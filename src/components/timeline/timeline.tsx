// src/components/timeline/timeline.tsx
// React wrapper for the canvas timeline.

import { useRef, useEffect, useCallback, useState } from 'react';
import { drawTimeline, stToVt, vtToSt } from './timeline-draw';
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

  const {
    segments,
    keyframeTimes,
    currentTime,
    duration,
    selectionStart,
    selectionEnd,
    selectedSegmentIndex,
    setCurrentTime,
    setSelection,
    setSelectedSegmentIndex,
  } = useEditStore();

  const totalDuration = segments.reduce((acc, s) => acc + (s.end - s.start), 0) || duration;

  // Initialize view to full virtual duration when totalDuration changes
  useEffect(() => {
    if (totalDuration > 0) {
      setViewStart(0);
      setViewEnd(totalDuration);
    }
  }, [totalDuration]);

  // Draw loop for the timeline canvas (non-preview)
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || totalDuration === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }

    const virtualCurrentTime = stToVt(currentTime, segments);
    const virtualSelectionStart = selectionStart !== null ? stToVt(selectionStart, segments) : null;
    const virtualSelectionEnd = selectionEnd !== null ? stToVt(selectionEnd, segments) : null;

    drawTimeline({
      canvas,
      duration: totalDuration,
      segments,
      keyframeTimes,
      currentTime: virtualCurrentTime,
      hoverTime,
      selectionStart: virtualSelectionStart,
      selectionEnd: virtualSelectionEnd,
      selectedSegmentIndex,
      viewStart: viewStart || 0,
      viewEnd: viewEnd || totalDuration,
    });
  }, [segments, keyframeTimes, currentTime, hoverTime, selectionStart, selectionEnd, selectedSegmentIndex, viewStart, viewEnd, totalDuration]);

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
    if (!canvas || totalDuration === 0) return;

    const cleanup = attachTimelineInput({
      canvas,
      getViewRange: () => ({ viewStart, viewEnd }),
      setViewRange: (s, e) => {
        setViewStart(s);
        setViewEnd(e);
      },
      getDuration: () => totalDuration,
      onHover: (vt, isDragging) => {
        // Update the visual indicator and trigger hover preview on main player
        setHoverTime(vt);
        if (player) {
          if (vt !== null && !isDragging) {
            const st = vtToSt(vt, segments);
            void player.showHoverPreview(st);
          } else {
            void player.clearHoverPreview();
          }
        }
      },
      onSeek: (vt) => {
        // Called on mousedown and drag — throttle to one decode per rAF
        const st = vtToSt(vt, segments);
        setCurrentTime(st);
        throttledSeek(st);

        // Find which segment index contains vt
        let accum = 0;
        let clickedIdx = -1;
        for (let i = 0; i < segments.length; i++) {
          const dur = segments[i].end - segments[i].start;
          if (vt >= accum && vt <= accum + dur) {
            clickedIdx = i;
            break;
          }
          accum += dur;
        }
        if (clickedIdx !== -1) {
          setSelectedSegmentIndex(clickedIdx);
        }
      },
      onSelectionChange: (vStart, vEnd) => {
        const sStart = vStart !== null ? vtToSt(vStart, segments) : null;
        const sEnd = vEnd !== null ? vtToSt(vEnd, segments) : null;
        setSelection(sStart, sEnd);
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
  }, [player, duration, totalDuration, segments, viewStart, viewEnd, throttledSeek]);

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
