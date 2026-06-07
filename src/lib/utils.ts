import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ── Multi-clip VT utilities ────────────────────────────────────────────────

interface SegmentLike { start: number; end: number; }

/** Get effective (kept) duration of a clip */
export function clipEffDur(segments: SegmentLike[]): number {
  return segments.reduce((acc, s) => acc + (s.end - s.start), 0);
}

/** Given a global VT and clips array, return { clipIndex, localVT } */
export function globalVTToLocal(
  globalVT: number,
  clips: Array<{ segments: SegmentLike[] }>
): { clipIndex: number; localVT: number } {
  let offset = 0;
  for (let i = 0; i < clips.length; i++) {
    const dur = clipEffDur(clips[i].segments);
    if (globalVT <= offset + dur || i === clips.length - 1) {
      return { clipIndex: i, localVT: globalVT - offset };
    }
    offset += dur;
  }
  return { clipIndex: 0, localVT: 0 };
}

/** Convert local VT within a clip to global VT */
export function localVTToGlobal(
  clipIndex: number,
  localVT: number,
  clips: Array<{ segments: SegmentLike[] }>
): number {
  let offset = 0;
  for (let i = 0; i < clipIndex; i++) {
    offset += clipEffDur(clips[i].segments);
  }
  return offset + localVT;
}

/** Total virtual duration across all clips */
export function totalVirtualDuration(clips: Array<{ segments: SegmentLike[] }>): number {
  return clips.reduce((acc, c) => acc + clipEffDur(c.segments), 0);
}
