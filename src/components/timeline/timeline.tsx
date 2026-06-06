// src/components/timeline/timeline.tsx
// React wrapper for the canvas timeline.

import { useRef, useEffect, useCallback, useState } from 'react';
import { drawTimeline } from './timeline-draw';
import { attachTimelineInput } from './timeline-input';
import { useEditStore } from '../../store/edit-store';
import type { Player } from '../../media/player';

interface TimelineProps {
  player: Player | null;
  className?: string;
}

export function Timeline({ player, className = '' }: TimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Throttle ref for seek-on-drag (only fire every ~100ms)
  const seekRafRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);

  const { segments, keyframeTimes, currentTime, duration, selectionStart, selectionEnd, setCurrentTime, setSelection } =
    useEditStore();

  // Initialize view to full duration when duration changes
  useEffect(() => {
    if (duration > 0) {
      setViewStart(0);
      setViewEnd(duration);
    }
  }, [duration]);

  // Draw loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || duration === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }

    drawTimeline({
      canvas,
      duration,
      segments,
      keyframeTimes,
      currentTime,
      hoverTime,
      selectionStart,
      selectionEnd,
      viewStart: viewStart || 0,
      viewEnd: viewEnd || duration,
    });
  }, [segments, keyframeTimes, currentTime, hoverTime, selectionStart, selectionEnd, viewStart, viewEnd, duration]);

  // rAF render loop — canvas only, no media decoding here
  useEffect(() => {
    const loop = () => {
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // Throttled seek — coalesces rapid calls into one per rAF tick
  const throttledSeek = useCallback((time: number) => {
    pendingSeekRef.current = time;
    if (seekRafRef.current !== null) return; // already scheduled
    seekRafRef.current = requestAnimationFrame(() => {
      seekRafRef.current = null;
      const t = pendingSeekRef.current;
      if (t !== null && player) {
        void player.seekTo(t);
        pendingSeekRef.current = null;
      }
    });
  }, [player]);

  // Attach input handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || duration === 0) return;

    const cleanup = attachTimelineInput({
      canvas,
      getViewRange: () => ({ viewStart, viewEnd }),
      setViewRange: (s, e) => {
        setViewStart(s);
        setViewEnd(e);
      },
      getDuration: () => duration,
      onHover: (time) => {
        // Only update the visual indicator — do NOT seek on every mousemove
        setHoverTime(time);
      },
      onSeek: (time) => {
        // Called on mousedown and drag — throttle to one decode per rAF
        setCurrentTime(time);
        throttledSeek(time);
      },
      onSelectionChange: (start, end) => {
        setSelection(start, end);
      },
    });

    return () => {
      cleanup();
      // Cancel any pending throttled seek
      if (seekRafRef.current !== null) {
        cancelAnimationFrame(seekRafRef.current);
        seekRafRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, duration, viewStart, viewEnd, throttledSeek]);

  return (
    <div className={`relative w-full ${className}`} style={{ cursor: 'crosshair' }}>
      <canvas
        ref={canvasRef}
        id="timeline-canvas"
        className="w-full h-full block"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
