// src/components/editor/player.tsx
// Canvas video preview + transport controls

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, ChevronFirst, ChevronLast,
} from 'lucide-react';
import { useEditStore } from '../../store/edit-store';
import type { Player as PlayerEngine } from '../../media/player';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface PlayerProps {
  player: PlayerEngine | null;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`;
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2];

export function PlayerPanel({ player }: PlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const { currentTime, duration, fps, setCurrentTime } = useEditStore();

  // Render incoming frames to canvas
  useEffect(() => {
    if (!player) return;

    const offFrame = player.on('frameReady', (src) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(src as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    });

    const offState = player.on('statechange', (state) => {
      setPlaying(state.playing);
      setSpeed(state.speed);
    });

    const offTime = player.on('timeupdate', (time) => {
      setCurrentTime(time);
    });

    return () => {
      offFrame();
      offState();
      offTime();
    };
  }, [player, setCurrentTime]);



  const handleFrameStep = useCallback(
    (dir: -1 | 1) => void player?.frameStep(dir, fps),
    [player, fps]
  );

  const handleBigJump = useCallback(
    (dir: -1 | 1) => {
      const p = player;
      if (p) void p.seekTo(p.currentTime + dir * 5);
    },
    [player]
  );

  const progressFrac = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="flex flex-col h-full bg-card rounded-xl overflow-hidden border border-border">
      {/* Video canvas */}
      <div
        className="flex-1 relative flex items-center justify-center bg-black overflow-hidden"
        id="player-canvas-wrapper"
      >
        {!player ? (
          <div className="text-center text-muted-foreground select-none">
            <div className="text-5xl mb-3 opacity-30">▶</div>
            <p className="text-sm">Open a video to begin</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            id="player-canvas"
            width={1920}
            height={1080}
            className="max-w-full max-h-full object-contain"
          />
        )}
      </div>

      {/* Progress bar */}
      {player && (
        <div className="relative h-1 bg-white/10 mx-0">
          <div
            className="absolute left-0 top-0 h-full bg-primary transition-none"
            style={{ width: `${progressFrac * 100}%` }}
          />
        </div>
      )}

      {/* Transport controls */}
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/32 border-t border-border">
        {/* Time */}
        <span className="font-mono text-xs text-foreground/60 min-w-[90px]">
          {formatTime(currentTime)}
        </span>
        <span className="text-muted-foreground/30 text-xs">/</span>
        <span className="font-mono text-xs text-muted-foreground/55 min-w-[90px]">
          {formatTime(duration)}
        </span>

        <div className="flex-1" />

        {/* Controls */}
        <Button
          id="btn-big-jump-back"
          onClick={() => handleBigJump(-1)}
          variant="ghost"
          size="icon-sm"
          title="Jump -5s (Shift+←)"
        >
          <SkipBack />
        </Button>

        <Button
          id="btn-frame-back"
          onClick={() => handleFrameStep(-1)}
          variant="ghost"
          size="icon-sm"
          title="Frame back (←)"
        >
          <ChevronFirst />
        </Button>

        <Button
          id="btn-play-pause"
          onClick={() => player?.togglePlayPause()}
          variant="default"
          size="icon"
          className="rounded-lg shadow-lg shadow-primary/20"
          title="Play/Pause (Space)"
        >
          {playing ? <Pause /> : <Play />}
        </Button>

        <Button
          id="btn-frame-forward"
          onClick={() => handleFrameStep(1)}
          variant="ghost"
          size="icon-sm"
          title="Frame forward (→)"
        >
          <ChevronLast />
        </Button>

        <Button
          id="btn-big-jump-forward"
          onClick={() => handleBigJump(1)}
          variant="ghost"
          size="icon-sm"
          title="Jump +5s (Shift+→)"
        >
          <SkipForward />
        </Button>

        <div className="flex-1" />

        {/* Speed */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Speed</span>
          <Select
            value={String(speed)}
            onValueChange={(val) => {
              if (!val) return;
              const s = parseFloat(val);
              player?.setSpeed(s);
              setSpeed(s);
            }}
          >
            <SelectTrigger size="sm" className="min-w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPEED_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
