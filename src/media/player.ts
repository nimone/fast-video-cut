// src/media/player.ts
// mediabunny canvas player: decode frames via WebCodecs, render to canvas.
// Key design: decode loop is sequential (await each frame) — never concurrent.

import {
  CanvasSink,
  type InputVideoTrack,
  type InputAudioTrack,
  type Input,
  type WrappedCanvas,
} from 'mediabunny';
import { useEditStore } from '../store/edit-store';

export interface PlayerState {
  currentTime: number;
  playing: boolean;
  speed: number;
  duration: number;
}

type PlayerEventMap = {
  timeupdate: (time: number) => void;
  statechange: (state: PlayerState) => void;
  frameReady: (canvas: HTMLCanvasElement | OffscreenCanvas) => void;
};

type PlayerEventKey = keyof PlayerEventMap;
type PlayerListeners = {
  [K in PlayerEventKey]: Array<PlayerEventMap[K]>;
};

export class Player {
  private canvasSink: CanvasSink;
  private audioCtx: AudioContext | null = null;

  private _currentTime = 0;
  private _playing = false;
  private _speed = 1;
  private _duration: number;

  // Playback loop state
  private playbackAbort: AbortController | null = null;
  private playStartWallTime = 0;
  private playStartMediaTime = 0;

  // Seek debounce — only one seek in flight at a time
  private seekInFlight = false;
  private pendingSeekTime: number | null = null;
  private _hoverTime: number | null = null;
  private playbackSeekTime: number | null = null;

  private listeners: PlayerListeners = {
    timeupdate: [],
    statechange: [],
    frameReady: [],
  };

  constructor(
    _input: Input,
    videoTrack: InputVideoTrack,
    _audioTrack: InputAudioTrack | null,
    duration: number
  ) {
    this._duration = duration;

    // poolSize=2: reuse canvases to avoid constant VRAM alloc/dealloc
    this.canvasSink = new CanvasSink(videoTrack, { poolSize: 2 });
  }

  on<K extends PlayerEventKey>(event: K, listener: PlayerEventMap[K]) {
    (this.listeners[event] as Array<PlayerEventMap[K]>).push(listener);
    return () => this.off(event, listener);
  }

  off<K extends PlayerEventKey>(event: K, listener: PlayerEventMap[K]) {
    const arr = this.listeners[event] as Array<PlayerEventMap[K]>;
    const idx = arr.indexOf(listener);
    if (idx >= 0) arr.splice(idx, 1);
  }

  private emit<K extends PlayerEventKey>(
    event: K,
    ...args: Parameters<PlayerEventMap[K]>
  ) {
    for (const fn of this.listeners[event] as Array<(...a: unknown[]) => void>) {
      fn(...(args as unknown[]));
    }
  }

  get currentTime() { return this._currentTime; }
  get playing() { return this._playing; }
  get speed() { return this._speed; }
  get duration() { return this._duration; }
  get hoverTime() { return this._hoverTime; }

  /**
   * Seek to a time and render that frame.
   * Concurrent seek calls are coalesced — if a seek is in flight,
   * we queue the latest time and execute it once the current one finishes.
   */
  async seekTo(time: number): Promise<void> {
    const clamped = Math.max(0, Math.min(time, this._duration));

    if (this.seekInFlight) {
      // Queue the latest requested time; discard any earlier pending
      this.pendingSeekTime = clamped;
      return;
    }

    this.seekInFlight = true;
    try {
      await this._doSeek(clamped);

      // Drain any queued seek
      while (this.pendingSeekTime !== null) {
        const next = this.pendingSeekTime;
        this.pendingSeekTime = null;
        await this._doSeek(next);
      }
    } finally {
      this.seekInFlight = false;
    }
  }

  private async _doSeek(time: number): Promise<void> {
    this._currentTime = time;
    if (this._playing) {
      this.playStartWallTime = performance.now();
      this.playStartMediaTime = time;
      this.playbackSeekTime = time;
    }
    try {
      const result = await this.canvasSink.getCanvas(time);
      if (result) {
        this.emit('frameReady', result.canvas);
      }
    } catch {
      // Seek errors during rapid scrub are acceptable
    }
    this.emit('timeupdate', this._currentTime);
    this.emit('statechange', this.getState());
  }

  /**
   * Render a hover preview frame on the main canvas.
   * Does NOT update playhead position or emit timeupdate.
   * Uses the same seekInFlight lock as regular seeks to coalesce calls.
   */
  async showHoverPreview(time: number): Promise<void> {
    const clamped = Math.max(0, Math.min(time, this._duration));
    this._hoverTime = clamped;

    if (this._playing) return;

    if (this.seekInFlight) {
      this.pendingSeekTime = clamped;
      return;
    }

    this.seekInFlight = true;
    try {
      await this._doHoverSeek(clamped);
      while (this.pendingSeekTime !== null) {
        const next = this.pendingSeekTime;
        this.pendingSeekTime = null;
        await this._doHoverSeek(next);
      }
    } finally {
      this.seekInFlight = false;
    }
  }

  private async _doHoverSeek(time: number): Promise<void> {
    try {
      const result = await this.canvasSink.getCanvas(time);
      if (result) {
        this.emit('frameReady', result.canvas);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Revert the main canvas frame to the actual current playhead time.
   */
  async clearHoverPreview(): Promise<void> {
    this._hoverTime = null;
    if (this._playing) return;
    await this.seekTo(this._currentTime);
  }



  async play(startTime?: number): Promise<void> {
    if (this._playing) return;
    this._playing = true;

    this.playStartWallTime = performance.now();
    this.playStartMediaTime = startTime !== undefined ? startTime : this._currentTime;
    this._currentTime = this.playStartMediaTime;
    this.playbackSeekTime = null;
    this.playbackAbort = new AbortController();
    const { signal } = this.playbackAbort;

    // Initialize audio context (must be resumed after user gesture)
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.emit('statechange', this.getState());

    // Sequential decode loop — pre-decode frames smoothly using canvases iterator.
    const loop = async () => {
      let iterator = this.canvasSink.canvases(this.playStartMediaTime);

      while (!signal.aborted) {
        // Handle dynamic seek/jump during playback
        if (this.playbackSeekTime !== null) {
          const seekTime = this.playbackSeekTime;
          this.playbackSeekTime = null;
          this.playStartWallTime = performance.now();
          this.playStartMediaTime = seekTime;
          iterator = this.canvasSink.canvases(seekTime);
          continue;
        }

        let result: IteratorResult<WrappedCanvas>;
        try {
          result = await iterator.next();
        } catch {
          if (signal.aborted) return;
          break;
        }

        if (signal.aborted) return;

        if (result.done) {
          // Reached end of source video
          this._currentTime = this._duration;
          this._playing = false;
          this.emit('timeupdate', this._currentTime);
          this.emit('statechange', this.getState());
          return;
        }

        const frame = result.value;
        if (!frame) continue;

        const segments = useEditStore.getState().segments;
        if (segments.length === 0) {
          this._currentTime = this._duration;
          this._playing = false;
          this.emit('timeupdate', this._currentTime);
          this.emit('statechange', this.getState());
          return;
        }

        // Find which segment the frame timestamp belongs to
        let segIdx = segments.findIndex((s) => frame.timestamp >= s.start && frame.timestamp < s.end);

        if (segIdx === -1) {
          // The frame is not in any segment. We need to jump to the next segment in the timeline array.
          // Let's find which segment the current playhead (this._currentTime) was in.
          const lastSegIdx = segments.findIndex((s) => this._currentTime >= s.start && this._currentTime <= s.end);

          let nextSegIdx = -1;
          if (lastSegIdx !== -1) {
            nextSegIdx = lastSegIdx + 1;
          } else {
            // Fallback: find the first segment in the timeline that starts after this._currentTime chronologically
            nextSegIdx = segments.findIndex((s) => s.start > this._currentTime);
          }

          if (nextSegIdx !== -1 && nextSegIdx < segments.length) {
            const nextSeg = segments[nextSegIdx];
            this.playStartWallTime = performance.now();
            this.playStartMediaTime = nextSeg.start;
            this.playbackSeekTime = null;
            iterator = this.canvasSink.canvases(nextSeg.start);
            continue;
          } else {
            // No next segment, stop playing and pause at the end of the last segment in the array
            const lastSeg = segments[segments.length - 1];
            this._currentTime = lastSeg ? lastSeg.end : this._duration;
            this._playing = false;
            this.emit('timeupdate', this._currentTime);
            this.emit('statechange', this.getState());
            return;
          }
        }

        // Calculate when to display this frame
        const targetWallTime = this.playStartWallTime + ((frame.timestamp - this.playStartMediaTime) / this._speed) * 1000;

        // Wait until targetWallTime is reached
        let delay = targetWallTime - performance.now();
        if (delay > 0) {
          if (delay > 16) {
            await new Promise<void>((resolve) => setTimeout(resolve, delay - 8));
          }
          while (targetWallTime - performance.now() > 0.5) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            if (signal.aborted) return;
          }
        }

        if (signal.aborted) return;

        // Draw the frame
        this._currentTime = frame.timestamp;
        this.emit('frameReady', frame.canvas);
        this.emit('timeupdate', this._currentTime);
      }
    };

    void loop();
  }

  pause(): void {
    if (!this._playing) return;
    this._playing = false;
    this.playbackAbort?.abort();
    this.playbackAbort = null;
    this.emit('statechange', this.getState());
  }

  togglePlayPause(startTime?: number): void {
    if (this._playing) this.pause();
    else void this.play(startTime);
  }

  setSpeed(speed: number): void {
    if (this._playing) {
      // Reset origin so speed change is seamless
      this.playStartWallTime = performance.now();
      this.playStartMediaTime = this._currentTime;
    }
    this._speed = speed;
    this.emit('statechange', this.getState());
  }

  /** Step forward/backward by N frames at the given fps. */
  async frameStep(frames: number, fps: number): Promise<void> {
    this.pause();
    const dt = frames / fps;
    await this.seekTo(this._currentTime + dt);
  }

  private getState(): PlayerState {
    return {
      currentTime: this._currentTime,
      playing: this._playing,
      speed: this._speed,
      duration: this._duration,
    };
  }

  dispose(): void {
    this.pause();
    this.audioCtx?.close();
  }
}
