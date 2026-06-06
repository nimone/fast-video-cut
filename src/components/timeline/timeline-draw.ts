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
  bg: '#0a0a0f',
  track: '#1a1a2e',
  segment: '#5b4fff',
  segmentHover: '#7c6fff',
  segmentBorder: '#8b7fff',
  keyframe: '#3d6b8a',
  keyframeMajor: '#5a9cc5',
  playhead: '#ff4c8b',
  hoverLine: 'rgba(255, 255, 255, 0.35)',
  selection: 'rgba(91, 79, 255, 0.25)',
  selectionBorder: '#5b4fff',
  gapDark: '#0f0f1a',
  timeLabel: 'rgba(255,255,255,0.5)',
  timeLabelMajor: 'rgba(255,255,255,0.8)',
  segmentLabel: 'rgba(255,255,255,0.7)',
};

const TIMELINE_HEIGHT_FRAC = 0.5; // Fraction of canvas height for segment track
const TICK_AREA_HEIGHT = 24; // px for time ruler

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

  const trackTop = TICK_AREA_HEIGHT * dpr;
  const trackH = (H - trackTop) * TIMELINE_HEIGHT_FRAC;
  const trackBottom = trackTop + trackH;

  // Time ruler background
  ctx.fillStyle = '#111120';
  ctx.fillRect(0, 0, W, trackTop);

  // Draw time ruler ticks
  drawRuler(ctx, W, trackTop, viewStart, viewEnd, dpr);

  // Track background
  ctx.fillStyle = COLORS.track;
  ctx.fillRect(0, trackTop, W, trackH);

  // Selection region
  if (selectionStart !== null && selectionEnd !== null) {
    const sx = timeToX(Math.min(selectionStart, selectionEnd), viewStart, viewEnd, W);
    const ex = timeToX(Math.max(selectionStart, selectionEnd), viewStart, viewEnd, W);
    ctx.fillStyle = COLORS.selection;
    ctx.fillRect(sx, trackTop, ex - sx, trackH);
    ctx.strokeStyle = COLORS.selectionBorder;
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(sx, trackTop, ex - sx, trackH);
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
    const grad = ctx.createLinearGradient(x1, trackTop, x1, trackBottom);
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
    ctx.roundRect(x1, trackTop, x2 - x1, trackH, r);
    ctx.fillStyle = grad;
    ctx.fill();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Segment border glow
    ctx.strokeStyle = isSelected ? '#ffd700' : COLORS.segmentBorder;
    ctx.lineWidth = isSelected ? 2.5 * dpr : 1.5 * dpr;
    ctx.beginPath();
    ctx.roundRect(x1, trackTop, x2 - x1, trackH, r);
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
        trackTop + trackH / 2 + 4 * dpr
      );
    }
    accum += dur;
  }

  // Keyframe ticks mapped to virtual time
  drawKeyframeTicks(ctx, keyframeTimes, segments, viewStart, viewEnd, W, trackTop, trackH, dpr);

  // Hover line
  if (hoverTime !== null) {
    const hx = timeToX(hoverTime, viewStart, viewEnd, W);
    ctx.strokeStyle = COLORS.hoverLine;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx, H);
    ctx.stroke();

    // Hover time label
    const label = formatTime(hoverTime);
    ctx.font = `${9 * dpr}px ui-monospace, monospace`;
    const tw = ctx.measureText(label).width;
    const lx = Math.min(W - tw - 4 * dpr, Math.max(4 * dpr, hx - tw / 2));
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(lx - 3 * dpr, 2 * dpr, tw + 6 * dpr, 14 * dpr);
    ctx.fillStyle = '#000';
    ctx.fillText(label, lx, 12 * dpr);
  }

  // Playhead
  const px = timeToX(currentTime, viewStart, viewEnd, W);
  if (px >= 0 && px <= W) {
    ctx.strokeStyle = COLORS.playhead;
    ctx.lineWidth = 2 * dpr;
    ctx.shadowColor = COLORS.playhead;
    ctx.shadowBlur = 6 * dpr;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, H);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Playhead triangle
    ctx.fillStyle = COLORS.playhead;
    ctx.beginPath();
    ctx.moveTo(px - 6 * dpr, 0);
    ctx.lineTo(px + 6 * dpr, 0);
    ctx.lineTo(px, 10 * dpr);
    ctx.closePath();
    ctx.fill();

    // Time under playhead
    const plabel = formatTime(currentTime);
    ctx.font = `bold ${9 * dpr}px ui-monospace, monospace`;
    ctx.fillStyle = COLORS.playhead;
    ctx.textAlign = 'center';
    ctx.fillText(plabel, Math.min(W - 30 * dpr, Math.max(30 * dpr, px)), H - 4 * dpr);
  }
}

function drawRuler(
  ctx: CanvasRenderingContext2D,
  W: number,
  height: number,
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
    ctx.lineWidth = isMajor ? 1.5 * dpr : 0.8 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, isMajor ? height * 0.3 : height * 0.6);
    ctx.lineTo(x, height);
    ctx.stroke();

    if (isMajor) {
      ctx.font = `${8 * dpr}px ui-monospace, monospace`;
      ctx.fillStyle = COLORS.timeLabelMajor;
      ctx.textAlign = 'center';
      ctx.fillText(formatTime(t), x, height * 0.25);
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
    ctx.moveTo(x, trackTop + trackH * 0.7);
    ctx.lineTo(x, trackTop + trackH);
    ctx.stroke();
  }
}
