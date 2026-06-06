// src/components/timeline/timeline-draw.ts
// Pure canvas rendering: segments, keyframe ticks, playhead, cursor.
// Called in a rAF loop. Dirty-region updates handled by caller.

export interface TimelineDrawOptions {
  canvas: HTMLCanvasElement;
  duration: number;
  segments: Array<{ start: number; end: number }>;
  keyframeTimes: number[];
  currentTime: number;
  hoverTime: number | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectedSegmentIndex: number | null;
  /** Visible time window */
  viewStart: number;
  viewEnd: number;
}

const COLORS = {
  bg: '#121212', // Neutral dark gray canvas background
  track: '#262626', // Lighter neutral gray track background
  segment: '#5b4fff',
  segmentHover: '#7c6fff',
  segmentBorder: '#8b7fff',
  keyframe: 'rgba(255, 255, 255, 0.25)',
  keyframeMajor: '#5a9cc5',
  playhead: '#ff4c8b',
  hoverLine: 'rgba(255, 255, 255, 0.35)',
  selection: 'rgba(91, 79, 255, 0.25)',
  selectionBorder: '#5b4fff',
  gapDark: '#1c1c1c',
  timeLabel: 'rgba(255,255,255,0.5)',
  timeLabelMajor: 'rgba(255,255,255,0.85)',
  segmentLabel: 'rgba(255,255,255,0.7)',
};

const TIMELINE_HEIGHT_FRAC = 0.35; // Sleeker, less track height
const TICK_AREA_HEIGHT = 22; // px for time ruler

function timeToX(
  time: number,
  viewStart: number,
  viewEnd: number,
  width: number
): number {
  return ((time - viewStart) / (viewEnd - viewStart)) * width;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

export interface Segment {
  start: number;
  end: number;
}

export function vtToSt(vt: number, segments: Segment[]): number {
  if (segments.length === 0) return 0;
  let accum = 0;
  for (const seg of segments) {
    const dur = seg.end - seg.start;
    if (vt >= accum && vt <= accum + dur) {
      return seg.start + (vt - accum);
    }
    accum += dur;
  }
  return segments[segments.length - 1].end;
}

export function stToVt(st: number, segments: Segment[]): number {
  if (segments.length === 0) return 0;

  // 1. Check if st is inside any segment
  let accum = 0;
  for (const seg of segments) {
    if (st >= seg.start && st <= seg.end) {
      return accum + (st - seg.start);
    }
    accum += seg.end - seg.start;
  }

  // 2. If st is in a gap, find the next chronological segment (closest seg.start > st)
  let nextSegIdx = -1;
  let minStartAfterSt = Infinity;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.start > st && seg.start < minStartAfterSt) {
      minStartAfterSt = seg.start;
      nextSegIdx = i;
    }
  }

  if (nextSegIdx !== -1) {
    // Sum the durations of all segments before nextSegIdx in the timeline array
    let vtAccum = 0;
    for (let i = 0; i < nextSegIdx; i++) {
      vtAccum += segments[i].end - segments[i].start;
    }
    return vtAccum;
  }

  // 3. Otherwise, map to the very end of all segments
  let totalDur = 0;
  for (const seg of segments) {
    totalDur += seg.end - seg.start;
  }
  return totalDur;
}

export function drawTimeline(opts: TimelineDrawOptions): void {
  const {
    canvas,
    segments,
    keyframeTimes,
    currentTime,
    hoverTime,
    selectionStart,
    selectionEnd,
    selectedSegmentIndex,
    viewStart,
    viewEnd,
  } = opts;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const dpr = window.devicePixelRatio || 1;

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  const gapH = 4 * dpr; // Gap space between ruler and track
  const trackTop = TICK_AREA_HEIGHT * dpr;
  const actualTrackTop = trackTop + gapH;
  const trackH = (H - actualTrackTop) * TIMELINE_HEIGHT_FRAC;
  const trackBottom = actualTrackTop + trackH;

  // Time ruler background (distinct dark neutral gray)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, W, trackTop);

  // Draw time ruler ticks
  drawRuler(ctx, W, trackTop, viewStart, viewEnd, dpr);

  // Track background
  ctx.fillStyle = COLORS.track;
  ctx.fillRect(0, actualTrackTop, W, trackH);

  // Selection region
  if (selectionStart !== null && selectionEnd !== null) {
    const sx = timeToX(Math.min(selectionStart, selectionEnd), viewStart, viewEnd, W);
    const ex = timeToX(Math.max(selectionStart, selectionEnd), viewStart, viewEnd, W);
    ctx.fillStyle = COLORS.selection;
    ctx.fillRect(sx, actualTrackTop, ex - sx, trackH);
    ctx.strokeStyle = COLORS.selectionBorder;
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(sx, actualTrackTop, ex - sx, trackH);
  }

  // Draw kept segments contiguously
  let accum = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const dur = seg.end - seg.start;
    const x1 = Math.max(0, timeToX(accum, viewStart, viewEnd, W));
    const x2 = Math.min(W, timeToX(accum + dur, viewStart, viewEnd, W));
    if (x2 <= x1) {
      accum += dur;
      continue;
    }

    const isSelected = selectedSegmentIndex === i;
    const r = Math.min(6 * dpr, (x2 - x1) / 2);

    // Segment background gradient
    const grad = ctx.createLinearGradient(x1, actualTrackTop, x1, trackBottom);
    if (isSelected) {
      grad.addColorStop(0, '#8b5cf6'); // Violet-500
      grad.addColorStop(0.6, '#6d28d9'); // Violet-700
      grad.addColorStop(1, '#4c1d95'); // Violet-900
    } else {
      grad.addColorStop(0, '#7065ff');
      grad.addColorStop(0.6, '#5b4fff');
      grad.addColorStop(1, '#4a3fd0');
    }

    if (isSelected) {
      ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
      ctx.shadowBlur = 12 * dpr;
    }

    ctx.beginPath();
    ctx.roundRect(x1, actualTrackTop, x2 - x1, trackH, r);
    ctx.fillStyle = grad;
    ctx.fill();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Segment border glow
    ctx.strokeStyle = isSelected ? '#ffd700' : COLORS.segmentBorder;
    ctx.lineWidth = isSelected ? 2.5 * dpr : 1.5 * dpr;
    ctx.beginPath();
    ctx.roundRect(x1, actualTrackTop, x2 - x1, trackH, r);
    ctx.stroke();

    // Segment label
    const segW = x2 - x1;
    if (segW > 40 * dpr) {
      ctx.font = `${10 * dpr}px ui-monospace, monospace`;
      ctx.fillStyle = COLORS.segmentLabel;
      ctx.textAlign = 'center';
      ctx.fillText(
        formatTime(seg.end - seg.start),
        x1 + segW / 2,
        actualTrackTop + trackH / 2 + 4 * dpr
      );
    }
    accum += dur;
  }

  // Keyframe ticks mapped to virtual time
  drawKeyframeTicks(ctx, keyframeTimes, segments, viewStart, viewEnd, W, actualTrackTop, trackH, dpr);

  // Hover line & label
  if (hoverTime !== null) {
    const hx = timeToX(hoverTime, viewStart, viewEnd, W);
    
    // Label
    const label = formatTime(hoverTime);
    ctx.font = `${9 * dpr}px ui-monospace, monospace`;
    const tw = ctx.measureText(label).width;
    
    const paddingX = 6 * dpr;
    const paddingY = 2 * dpr;
    const rectW = tw + paddingX * 2;
    const rectH = 11 * dpr + paddingY * 2;
    
    const lx = Math.min(W - rectW - 4 * dpr, Math.max(4 * dpr, hx - rectW / 2));
    const ly = trackTop - rectH - 2 * dpr; // Positioned neatly in the ruler area

    // Hover line (drawn starting from the bottom of the label container)
    ctx.strokeStyle = COLORS.hoverLine;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(hx, ly + rectH);
    ctx.lineTo(hx, H);
    ctx.stroke();

    // Capsule background for label
    ctx.fillStyle = 'rgba(20, 20, 30, 0.95)';
    ctx.beginPath();
    ctx.roundRect(lx, ly, rectW, rectH, 3 * dpr);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx + rectW / 2, ly + rectH / 2 + 0.5 * dpr);
    ctx.textBaseline = 'alphabetic'; // reset
  }

  // Playhead
  const px = timeToX(currentTime, viewStart, viewEnd, W);
  if (px >= 0 && px <= W) {
    const handleW = 10 * dpr;
    const handleH = 14 * dpr;

    // Playhead line
    ctx.strokeStyle = COLORS.playhead;
    ctx.lineWidth = 2 * dpr;
    ctx.shadowColor = COLORS.playhead;
    ctx.shadowBlur = 6 * dpr;
    ctx.beginPath();
    ctx.moveTo(px, handleH);
    ctx.lineTo(px, H);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Playhead handle: rounded pill shape starting at y = 0
    ctx.fillStyle = COLORS.playhead;
    ctx.beginPath();
    ctx.roundRect(px - handleW / 2, 0, handleW, handleH, 3 * dpr);
    ctx.fill();

    // Time under playhead (solid pill-shaped container at the bottom)
    const plabel = formatTime(currentTime);
    ctx.font = `bold ${9 * dpr}px ui-monospace, monospace`;
    const ptw = ctx.measureText(plabel).width;
    
    const pxPaddingX = 6 * dpr;
    const pxPaddingY = 3 * dpr;
    const pxRectW = ptw + pxPaddingX * 2;
    const pxRectH = 12 * dpr + pxPaddingY * 2;
    
    const plx = Math.min(W - pxRectW - 4 * dpr, Math.max(4 * dpr, px - pxRectW / 2));
    const ply = H - pxRectH - 2 * dpr;

    // Capsule background
    ctx.fillStyle = COLORS.playhead;
    ctx.beginPath();
    ctx.roundRect(plx, ply, pxRectW, pxRectH, 4 * dpr);
    ctx.fill();

    // Bold white text inside capsule
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(plabel, plx + pxRectW / 2, ply + pxRectH / 2 + 0.5 * dpr);
    ctx.textBaseline = 'alphabetic'; // reset
  }
}

function drawRuler(
  ctx: CanvasRenderingContext2D,
  W: number,
  trackTop: number,
  viewStart: number,
  viewEnd: number,
  dpr: number
): void {
  const viewDuration = viewEnd - viewStart;
  // Choose tick interval based on view duration
  const INTERVALS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600];
  const targetTicks = W / (60 * dpr);
  let interval = INTERVALS[0];
  for (const iv of INTERVALS) {
    interval = iv;
    if (viewDuration / iv <= targetTicks) break;
  }

  const majorInterval = interval * 5;
  const firstTick = Math.ceil(viewStart / interval) * interval;

  for (let t = firstTick; t <= viewEnd; t = Math.round((t + interval) * 1e6) / 1e6) {
    const x = ((t - viewStart) / viewDuration) * W;
    const isMajor = Math.abs(t % majorInterval) < interval * 0.01;

    ctx.strokeStyle = isMajor ? COLORS.timeLabelMajor : COLORS.timeLabel;
    ctx.lineWidth = isMajor ? 1.2 * dpr : 0.8 * dpr;
    ctx.beginPath();
    // Ticks point downwards from the very top of the canvas
    ctx.moveTo(x, 0);
    ctx.lineTo(x, isMajor ? 6 * dpr : 3 * dpr);
    ctx.stroke();

    if (isMajor) {
      // Bold, clean monospace font for timing numbers
      ctx.font = `bold ${9 * dpr}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = COLORS.timeLabelMajor;
      ctx.textAlign = 'center';
      // Time labels sit at the bottom of the time ruler, below the ticks
      ctx.fillText(formatTime(t), x, trackTop - 2 * dpr);
    }
  }
}

function drawKeyframeTicks(
  ctx: CanvasRenderingContext2D,
  keyframeTimes: number[],
  segments: Array<{ start: number; end: number }>,
  viewStart: number,
  viewEnd: number,
  W: number,
  trackTop: number,
  trackH: number,
  dpr: number
): void {
  const minPixelsPerTick = 3 * dpr;
  ctx.strokeStyle = COLORS.keyframe;
  ctx.lineWidth = 1 * dpr;
  ctx.setLineDash([2 * dpr, 2 * dpr]);

  let lastX = -999;
  for (const t of keyframeTimes) {
    let isInSegment = false;
    for (const seg of segments) {
      if (t >= seg.start && t <= seg.end) {
        isInSegment = true;
        break;
      }
    }
    if (!isInSegment) continue;

    const vt = stToVt(t, segments);
    const x = ((vt - viewStart) / (viewEnd - viewStart)) * W;
    if (x < 0 || x > W) continue;
    if (x - lastX < minPixelsPerTick) continue;
    lastX = x;

    ctx.beginPath();
    ctx.moveTo(x, trackTop);
    ctx.lineTo(x, trackTop + trackH);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}
