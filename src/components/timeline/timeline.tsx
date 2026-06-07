// src/components/timeline/timeline.tsx
// React wrapper for the canvas timeline.

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { drawTimeline, vtToSt } from './timeline-draw';
import type { ClipInfo } from './timeline-draw';
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
    clips: storeClips,
    activeClipId,
    segments,         // active clip's segments (for seek mapping)
    currentTime,
    duration,
    selectionStart,
    selectionEnd,
    selectedSegmentIndex,
    setCurrentTime,
    setHoverTime: setStoreHoverTime,
    setSelection,
    setSelectedSegmentIndex,
    setActiveClipId,
  } = useEditStore();

  // ── Build ClipInfo[] with sequential virtual-time offsets ───────────────
  const clipInfos = useMemo<ClipInfo[]>(() => {
    let vtOffset = 0;
    return storeClips.map((c) => {
      const totalSegDur = c.segments.reduce((s, seg) => s + (seg.end - seg.start), 0);
      const vtStart = vtOffset;
      const vtEnd = vtOffset + totalSegDur;
      vtOffset = vtEnd;

      const label = c.file.name.replace(/\.[^.]+$/, '');

      return {
        id: c.id,
        vtStart,
        vtEnd,
        color: c.color,
        label,
        segments: c.segments,
        keyframeTimes: c.keyframeTimes,
        isActive: c.id === activeClipId,
      };
    });
  }, [storeClips, activeClipId]);

  // Total virtual duration = sum of all clip kept-segment durations
  const totalDuration = useMemo(
    () => clipInfos.reduce((acc, c) => acc + (c.vtEnd - c.vtStart), 0) || duration,
    [clipInfos, duration]
  );

  // ── Map source-time currentTime → global virtual time ──────────────────
  // The active clip's currentTime is in source-time; we need to find which
  // clip is active, map st→localVT, then add that clip's vtStart.
  const virtualCurrentTime = useMemo(() => {
    const activeInfo = clipInfos.find((c) => c.id === activeClipId);
    if (!activeInfo || segments.length === 0) return 0;

    // Map source-time → local VT within the active clip
    let localVT = 0;
    let accum = 0;
    for (const seg of segments) {
      if (currentTime >= seg.start && currentTime <= seg.end) {
        localVT = accum + (currentTime - seg.start);
        break;
      }
      accum += seg.end - seg.start;
      localVT = accum; // fallback: end of clip
    }
    return activeInfo.vtStart + localVT;
  }, [currentTime, segments, clipInfos, activeClipId]);

  // Selection in global VT (simple: use active clip's vtStart + localVT)
  const mapStToGlobalVT = useCallback((st: number) => {
    const activeInfo = clipInfos.find((c) => c.id === activeClipId);
    if (!activeInfo || segments.length === 0) return st;
    let accum = 0;
    for (const seg of segments) {
      if (st >= seg.start && st <= seg.end) {
        return activeInfo.vtStart + accum + (st - seg.start);
      }
      accum += seg.end - seg.start;
    }
    return activeInfo.vtStart + accum;
  }, [clipInfos, activeClipId, segments]);

  const virtualSelectionStart = selectionStart !== null ? mapStToGlobalVT(selectionStart) : null;
  const virtualSelectionEnd = selectionEnd !== null ? mapStToGlobalVT(selectionEnd) : null;

  // Initialize view to full virtual duration when totalDuration changes
  useEffect(() => {
    if (totalDuration > 0) {
      setViewStart(0);
      setViewEnd(totalDuration);
    }
  }, [totalDuration]);

  // Draw loop for the timeline canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || totalDuration === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }

    drawTimeline({
      canvas,
      duration: totalDuration,
      clips: clipInfos,
      segments,
      keyframeTimes: storeClips.find((c) => c.id === activeClipId)?.keyframeTimes ?? [],
      currentTime: virtualCurrentTime,
      hoverTime,
      selectionStart: virtualSelectionStart,
      selectionEnd: virtualSelectionEnd,
      selectedSegmentIndex,
      viewStart: viewStart || 0,
      viewEnd: viewEnd || totalDuration,
      activeClipId,
    });
  }, [
    clipInfos, segments, storeClips, activeClipId,
    virtualCurrentTime, hoverTime,
    virtualSelectionStart, virtualSelectionEnd,
    selectedSegmentIndex, viewStart, viewEnd, totalDuration,
  ]);

  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // rAF render loop
  useEffect(() => {
    const loop = () => {
      drawRef.current();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Throttled seek
  const throttledSeek = useCallback((time: number) => {
    pendingSeekRef.current = time;
    if (seekRafRef.current !== null) return;
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
        setHoverTime(vt);
        if (vt !== null) {
          // Find whichever clip the cursor is over (active OR inactive)
          const clip = clipInfos.find((c) => vt >= c.vtStart && vt <= c.vtEnd);
          if (clip) {
            const localVT = vt - clip.vtStart;
            const st = vtToSt(localVT, clip.segments);
            // Always report hover source-time + which clip — store uses this for cut/trim
            setStoreHoverTime(st, clip.id);
            if (player && !isDragging) {
              void player.showHoverPreview(st);
            }
          } else {
            setStoreHoverTime(null, null);
          }
        } else {
          // Mouse left the timeline
          setStoreHoverTime(null, null);
          if (player) void player.clearHoverPreview();
        }
      },
      onSeek: (vt) => {
        // Find which clip this VT falls in
        const clip = clipInfos.find((c) => vt >= c.vtStart && vt <= c.vtEnd);
        if (!clip) return;

        const localVT = vt - clip.vtStart;
        const st = vtToSt(localVT, clip.segments);

        // Switch active clip if needed
        if (clip.id !== activeClipId) {
          setActiveClipId(clip.id);
        }

        setCurrentTime(st);
        throttledSeek(st);

        // Find segment index within that clip
        let accum = 0;
        let clickedIdx = -1;
        for (let i = 0; i < clip.segments.length; i++) {
          const dur = clip.segments[i].end - clip.segments[i].start;
          if (localVT >= accum && localVT <= accum + dur) {
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
        // Map global VT back to source-time on the active clip
        const activeInfo = clipInfos.find((c) => c.id === activeClipId);
        if (!activeInfo) {
          setSelection(null, null);
          return;
        }
        const toSt = (vt: number | null) => {
          if (vt === null) return null;
          const localVT = vt - activeInfo.vtStart;
          return vtToSt(localVT, activeInfo.segments);
        };
        setSelection(toSt(vStart), toSt(vEnd));
      },
    });

    return () => {
      cleanup();
      if (seekRafRef.current !== null) {
        cancelAnimationFrame(seekRafRef.current);
        seekRafRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, duration, totalDuration, clipInfos, activeClipId, viewStart, viewEnd, throttledSeek]);

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
