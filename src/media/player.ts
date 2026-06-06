// src/media/player.ts
// mediabunny canvas player: decode frames via WebCodecs, render to canvas.
// Key design: decode loop is sequential (await each frame) — never concurrent.

import {
  CanvasSink,
  type InputVideoTrack,
  type InputAudioTrack,
  type Input,
} from 'mediabunny';

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
  private input: Input;
  private videoTrack: InputVideoTrack;
  private audioTrack: InputAudioTrack | null;
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

  private listeners: PlayerListeners = {
    timeupdate: [],
    statechange: [],
    frameReady: [],
  };

  constructor(
    input: Input,
    videoTrack: InputVideoTrack,
    audioTrack: InputAudioTrack | null,
    duration: number
  ) {
    this.input = input;
    this.videoTrack = videoTrack;
    this.audioTrack = audioTrack;
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

  async play(): Promise<void> {
    if (this._playing) return;
    this._playing = true;

    this.playStartWallTime = performance.now();
    this.playStartMediaTime = this._currentTime;
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

    // Sequential decode loop — await each frame before requesting the next.
    // This is the key: never more than ONE decode in flight at a time.
    const loop = async () => {
      while (!signal.aborted) {
        const elapsed = (performance.now() - this.playStartWallTime) / 1000;
        const mediaTime = this.playStartMediaTime + elapsed * this._speed;

        if (mediaTime >= this._duration) {
          this._currentTime = this._duration;
          this._playing = false;
          this.emit('timeupdate', this._currentTime);
          this.emit('statechange', this.getState());
          return;
        }

        this._currentTime = mediaTime;

        try {
          const result = await this.canvasSink.getCanvas(mediaTime);
          if (!signal.aborted && result) {
            this.emit('frameReady', result.canvas);
          }
        } catch {
          if (signal.aborted) return;
        }

        this.emit('timeupdate', this._currentTime);

        if (signal.aborted) return;

        // Yield to the event loop — wait for next animation frame before
        // requesting the next decode. This caps us at ≤ 1 decode per frame.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
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

  togglePlayPause(): void {
    if (this._playing) this.pause();
    else void this.play();
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
