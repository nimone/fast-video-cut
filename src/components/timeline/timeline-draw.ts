// src/components/timeline/timeline-draw.ts
// Pure canvas rendering: multi-clip blocks, segments, keyframe ticks, playhead, cursor.
// Called in a rAF loop.

export interface ClipInfo {
  id: string;
  /** Global VT start of this clip */
  vtStart: number;
  /** Global VT end of this clip  */
  vtEnd: number;
  color: string;
  label: string;             // filename without extension
  segments: Array<{ start: number; end: number }>;
  keyframeTimes: number[];
  isActive: boolean;
}

export interface TimelineDrawOptions {
  canvas: HTMLCanvasElement;
  /** TOTAL virtual duration across all clips */
  duration: number;
  /** Per-clip info for rendering */
  clips: ClipInfo[];
  /** Active clip's segments (legacy compat – used for selection coords) */
  segments: Array<{ start: number; end: number }>;
  /** Active clip's keyframes */
  keyframeTimes: number[];
  /** Global VT of playhead */
  currentTime: number;
  hoverTime: number | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectedSegmentIndex: number | null;
  viewStart: number;
  viewEnd: number;
  activeClipId: string | null;
}

const BASE_COLORS = {
  bg: '#121212',
  track: '#1e1e1e',
  keyframe: 'rgba(255, 255, 255, 0.22)',
  playhead: '#ff4c8b',
  hoverLine: 'rgba(255, 255, 255, 0.32)',
  selection: 'rgba(91, 79, 255, 0.22)',
  selectionBorder: '#5b4fff',
  timeLabel: 'rgba(255,255,255,0.5)',
  timeLabelMajor: 'rgba(255,255,255,0.85)',
  segmentLabel: 'rgba(255,255,255,0.7)',
  clipDivider: 'rgba(255,255,255,0.18)',
};

const TIMELINE_HEIGHT_FRAC = 0.35;
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

  let accum = 0;
  for (const seg of segments) {
    if (st >= seg.start && st <= seg.end) {
      return accum + (st - seg.start);
    }
    accum += seg.end - seg.start;
  }

  // If st is in a gap, find next chronological segment
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
    let vtAccum = 0;
    for (let i = 0; i < nextSegIdx; i++) {
      vtAccum += segments[i].end - segments[i].start;
    }
    return vtAccum;
  }

  let totalDur = 0;
  for (const seg of segments) {
    totalDur += seg.end - seg.start;
  }
  return totalDur;
}

// ── hex color helpers ──────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.min(255, r + amount)},${Math.min(255, g + amount)},${Math.min(255, b + amount)})`;
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.max(0, r - amount)},${Math.max(0, g - amount)},${Math.max(0, b - amount)})`;
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Main draw ──────────────────────────────────────────────────────────────

export function drawTimeline(opts: TimelineDrawOptions): void {
  const {
    canvas,
    clips,
    currentTime,
    hoverTime,
    selectionStart,
    selectionEnd,
    selectedSegmentIndex,
    viewStart,
    viewEnd,
    activeClipId,
  } = opts;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const dpr = window.devicePixelRatio || 1;

  // Background
  ctx.fillStyle = BASE_COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  const gapH = 4 * dpr;
  const trackTop = TICK_AREA_HEIGHT * dpr;
  const actualTrackTop = trackTop + gapH;
  const trackH = (H - actualTrackTop) * TIMELINE_HEIGHT_FRAC;
  const trackBottom = actualTrackTop + trackH;

  // Time ruler background
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, W, trackTop);

  drawRuler(ctx, W, trackTop, viewStart, viewEnd, dpr);

  // Track background
  ctx.fillStyle = BASE_COLORS.track;
  ctx.fillRect(0, actualTrackTop, W, trackH);

  // ── Selection region (global VT coords) ───────────────────────────────
  if (selectionStart !== null && selectionEnd !== null) {
    const sx = timeToX(Math.min(selectionStart, selectionEnd), viewStart, viewEnd, W);
    const ex = timeToX(Math.max(selectionStart, selectionEnd), viewStart, viewEnd, W);
    ctx.fillStyle = BASE_COLORS.selection;
    ctx.fillRect(sx, actualTrackTop, ex - sx, trackH);
    ctx.strokeStyle = BASE_COLORS.selectionBorder;
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(sx, actualTrackTop, ex - sx, trackH);
  }

  // ── Render each clip block ─────────────────────────────────────────────
  for (const clip of clips) {
    drawClipBlock(
      ctx, clip, W, actualTrackTop, trackH, trackBottom,
      viewStart, viewEnd, dpr, selectedSegmentIndex, activeClipId
    );
  }

  // ── Clip boundary dividers (vertical lines between clips) ─────────────
  for (let i = 1; i < clips.length; i++) {
    const divX = timeToX(clips[i].vtStart, viewStart, viewEnd, W);
    if (divX < 0 || divX > W) continue;
    ctx.strokeStyle = BASE_COLORS.clipDivider;
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.beginPath();
    ctx.moveTo(divX, actualTrackTop);
    ctx.lineTo(divX, trackBottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Hover time indicator ───────────────────────────────────────────────
  if (hoverTime !== null) {
    const hx = timeToX(hoverTime, viewStart, viewEnd, W);

    const label = formatTime(hoverTime);
    ctx.font = `${9 * dpr}px ui-monospace, monospace`;
    const tw = ctx.measureText(label).width;

    const paddingX = 6 * dpr;
    const paddingY = 2 * dpr;
    const rectW = tw + paddingX * 2;
    const rectH = 11 * dpr + paddingY * 2;

    const lx = Math.min(W - rectW - 4 * dpr, Math.max(4 * dpr, hx - rectW / 2));
    const ly = trackTop - rectH - 2 * dpr;

    ctx.strokeStyle = BASE_COLORS.hoverLine;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(hx, ly + rectH);
    ctx.lineTo(hx, H);
    ctx.stroke();

    ctx.fillStyle = 'rgba(20, 20, 30, 0.95)';
    ctx.beginPath();
    ctx.roundRect(lx, ly, rectW, rectH, 3 * dpr);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx + rectW / 2, ly + rectH / 2 + 0.5 * dpr);
    ctx.textBaseline = 'alphabetic';
  }

  // ── Playhead ───────────────────────────────────────────────────────────
  const px = timeToX(currentTime, viewStart, viewEnd, W);
  if (px >= 0 && px <= W) {
    const handleW = 10 * dpr;
    const handleH = 14 * dpr;

    ctx.strokeStyle = BASE_COLORS.playhead;
    ctx.lineWidth = 2 * dpr;
    ctx.shadowColor = BASE_COLORS.playhead;
    ctx.shadowBlur = 6 * dpr;
    ctx.beginPath();
    ctx.moveTo(px, handleH);
    ctx.lineTo(px, H);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = BASE_COLORS.playhead;
    ctx.beginPath();
    ctx.roundRect(px - handleW / 2, 0, handleW, handleH, 3 * dpr);
    ctx.fill();

    const plabel = formatTime(currentTime);
    ctx.font = `bold ${9 * dpr}px ui-monospace, monospace`;
    const ptw = ctx.measureText(plabel).width;

    const pxPaddingX = 6 * dpr;
    const pxPaddingY = 3 * dpr;
    const pxRectW = ptw + pxPaddingX * 2;
    const pxRectH = 12 * dpr + pxPaddingY * 2;

    const plx = Math.min(W - pxRectW - 4 * dpr, Math.max(4 * dpr, px - pxRectW / 2));
    const ply = H - pxRectH - 2 * dpr;

    ctx.fillStyle = BASE_COLORS.playhead;
    ctx.beginPath();
    ctx.roundRect(plx, ply, pxRectW, pxRectH, 4 * dpr);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(plabel, plx + pxRectW / 2, ply + pxRectH / 2 + 0.5 * dpr);
    ctx.textBaseline = 'alphabetic';
  }
}

// ── Per-clip block renderer ────────────────────────────────────────────────

function drawClipBlock(
  ctx: CanvasRenderingContext2D,
  clip: ClipInfo,
  W: number,
  actualTrackTop: number,
  trackH: number,
  trackBottom: number,
  viewStart: number,
  viewEnd: number,
  dpr: number,
  selectedSegmentIndex: number | null,
  activeClipId: string | null,
): void {
  const { vtStart, vtEnd, color, label, segments, keyframeTimes, isActive, id } = clip;

  // Clip block bounds in pixel space
  const clipX1 = Math.max(0, timeToX(vtStart, viewStart, viewEnd, W));
  const clipX2 = Math.min(W, timeToX(vtEnd, viewStart, viewEnd, W));
  if (clipX2 <= clipX1) return;

  const clipW = clipX2 - clipX1;
  const r = Math.min(5 * dpr, clipW / 2);

  // ── Clip background (dark base) ───────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(clipX1, actualTrackTop, clipX1, trackBottom);
  if (isActive) {
    bgGrad.addColorStop(0, darken(color, 30));
    bgGrad.addColorStop(1, darken(color, 60));
  } else {
    bgGrad.addColorStop(0, darken(color, 55));
    bgGrad.addColorStop(1, darken(color, 80));
  }
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.roundRect(clipX1, actualTrackTop, clipW, trackH, r);
  ctx.fill();

  // ── Kept segments within the clip ─────────────────────────────────────
  // Segments are in source-time; we need to map them to VT within the clip,
  // then to global VT by adding vtStart.
  let localAccum = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const dur = seg.end - seg.start;
    const segGlobalStart = vtStart + localAccum;
    const segGlobalEnd = vtStart + localAccum + dur;

    const sx = Math.max(clipX1, timeToX(segGlobalStart, viewStart, viewEnd, W));
    const ex = Math.min(clipX2, timeToX(segGlobalEnd, viewStart, viewEnd, W));
    if (ex <= sx) {
      localAccum += dur;
      continue;
    }

    const isSelected = isActive && id === activeClipId && selectedSegmentIndex === i;
    const segW = ex - sx;
    const segR = Math.min(4 * dpr, segW / 2);

    // Segment fill gradient — selected just brightens the clip's own colour
    const segGrad = ctx.createLinearGradient(sx, actualTrackTop, sx, trackBottom);
    if (isSelected) {
      segGrad.addColorStop(0, lighten(color, 55));
      segGrad.addColorStop(0.55, lighten(color, 30));
      segGrad.addColorStop(1, color);
    } else if (isActive) {
      segGrad.addColorStop(0, lighten(color, 30));
      segGrad.addColorStop(0.55, color);
      segGrad.addColorStop(1, darken(color, 20));
    } else {
      // Inactive clip: desaturate / dim
      segGrad.addColorStop(0, lighten(color, 5));
      segGrad.addColorStop(1, darken(color, 10));
    }

    ctx.beginPath();
    ctx.roundRect(sx, actualTrackTop, segW, trackH, segR);
    ctx.fillStyle = segGrad;
    ctx.fill();

    // Segment border — selected: slightly brighter, no ring
    ctx.strokeStyle = isSelected
      ? withAlpha(lighten(color, 70), 1)
      : isActive
        ? lighten(color, 50)
        : withAlpha(lighten(color, 30), 0.5);
    ctx.lineWidth = isSelected ? 1.5 * dpr : 1.2 * dpr;
    ctx.beginPath();
    ctx.roundRect(sx, actualTrackTop, segW, trackH, segR);
    ctx.stroke();

    // Segment label — clip name + duration inside the segment
    if (segW > 36 * dpr) {
      const nameAlpha = isActive ? 0.9 : 0.5;
      const timeAlpha = isActive ? 0.6 : 0.35;
      const midX = sx + segW / 2;
      const midY = actualTrackTop + trackH / 2;

      // Truncate name to fit
      ctx.font = `600 ${9 * dpr}px ui-sans-serif, system-ui, sans-serif`;
      const maxTw = segW - 10 * dpr;
      let nameText = label;
      while (nameText.length > 2 && ctx.measureText(nameText).width > maxTw) {
        nameText = nameText.slice(0, -1);
      }
      if (nameText !== label) nameText = nameText.slice(0, -1) + '…';

      const durText = formatTime(dur);

      // Two-line layout: name above centre, duration below
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Name
      ctx.fillStyle = isActive
        ? withAlpha('#ffffff', nameAlpha)
        : withAlpha(lighten(color, 60), nameAlpha);
      ctx.fillText(nameText, midX, midY - 5 * dpr);

      // Duration
      ctx.font = `${8.5 * dpr}px ui-monospace, monospace`;
      ctx.fillStyle = isActive
        ? withAlpha('#ffffff', timeAlpha)
        : withAlpha(lighten(color, 40), timeAlpha);
      ctx.fillText(durText, midX, midY + 5.5 * dpr);

      ctx.textBaseline = 'alphabetic';
    }

    localAccum += dur;
  }

  // ── Active clip: golden glow border ───────────────────────────────────
  if (isActive) {
    ctx.strokeStyle = withAlpha(lighten(color, 80), 0.9);
    ctx.lineWidth = 2 * dpr;
    ctx.shadowColor = withAlpha(color, 0.6);
    ctx.shadowBlur = 8 * dpr;
    ctx.beginPath();
    ctx.roundRect(clipX1, actualTrackTop, clipW, trackH, r);
    ctx.stroke();
    ctx.shadowBlur = 0;
  } else {
    // Inactive clip: subtle border
    ctx.strokeStyle = withAlpha(color, 0.25);
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.roundRect(clipX1, actualTrackTop, clipW, trackH, r);
    ctx.stroke();
  }

  // ── Keyframe ticks (all clips, dimmer for inactive) ───────────────────
  drawKeyframeTicksForClip(
    ctx, keyframeTimes, segments, vtStart,
    viewStart, viewEnd, W, actualTrackTop, trackH, dpr,
    isActive
  );

  // (clip name + duration are rendered inside each segment above)
}

// ── Time ruler ────────────────────────────────────────────────────────────

function drawRuler(
  ctx: CanvasRenderingContext2D,
  W: number,
  trackTop: number,
  viewStart: number,
  viewEnd: number,
  dpr: number
): void {
  const viewDuration = viewEnd - viewStart;
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

    ctx.strokeStyle = isMajor ? BASE_COLORS.timeLabelMajor : BASE_COLORS.timeLabel;
    ctx.lineWidth = isMajor ? 1.2 * dpr : 0.8 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, isMajor ? 6 * dpr : 3 * dpr);
    ctx.stroke();

    if (isMajor) {
      ctx.font = `bold ${9 * dpr}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = BASE_COLORS.timeLabelMajor;
      ctx.textAlign = 'center';
      ctx.fillText(formatTime(t), x, trackTop - 2 * dpr);
    }
  }
}

// ── Keyframe ticks for one clip ────────────────────────────────────────────

function drawKeyframeTicksForClip(
  ctx: CanvasRenderingContext2D,
  keyframeTimes: number[],
  segments: Array<{ start: number; end: number }>,
  clipVTStart: number,
  viewStart: number,
  viewEnd: number,
  W: number,
  trackTop: number,
  trackH: number,
  dpr: number,
  isActive: boolean = true,
): void {
  const minPixelsPerTick = 3 * dpr;
  // Active clips: normal tick colour; inactive: more transparent
  ctx.strokeStyle = isActive ? BASE_COLORS.keyframe : 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1 * dpr;
  ctx.setLineDash([2 * dpr, 2 * dpr]);

  let lastX = -999;
  for (const t of keyframeTimes) {
    // Check if inside any segment
    let isInSegment = false;
    for (const seg of segments) {
      if (t >= seg.start && t <= seg.end) { isInSegment = true; break; }
    }
    if (!isInSegment) continue;

    // Map source-time keyframe → local VT → global VT
    const localVT = stToVt(t, segments);
    const globalVT = clipVTStart + localVT;

    const x = ((globalVT - viewStart) / (viewEnd - viewStart)) * W;
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
