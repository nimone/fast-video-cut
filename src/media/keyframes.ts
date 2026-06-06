// src/media/keyframes.ts
// Helpers for snapping positions to nearest keyframe.

/**
 * Find the nearest keyframe timestamp (<=) to a given time.
 * Returns the time itself if keyframeTimes is empty.
 */
export function snapToNearestKeyframeBefore(
  time: number,
  keyframeTimes: number[]
): number {
  if (keyframeTimes.length === 0) return time;
  let lo = 0;
  let hi = keyframeTimes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keyframeTimes[mid] <= time) lo = mid;
    else hi = mid - 1;
  }
  return keyframeTimes[lo];
}

/**
 * Find the nearest keyframe timestamp (>=) to a given time.
 * Returns the last keyframe if time exceeds all keyframes.
 */
export function snapToNearestKeyframeAfter(
  time: number,
  keyframeTimes: number[]
): number {
  if (keyframeTimes.length === 0) return time;
  let lo = 0;
  let hi = keyframeTimes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keyframeTimes[mid] >= time) hi = mid;
    else lo = mid + 1;
  }
  return keyframeTimes[lo];
}

/**
 * Find the nearest keyframe to a given time (either direction).
 */
export function snapToNearestKeyframe(
  time: number,
  keyframeTimes: number[]
): number {
  if (keyframeTimes.length === 0) return time;
  const before = snapToNearestKeyframeBefore(time, keyframeTimes);
  const after = snapToNearestKeyframeAfter(time, keyframeTimes);
  return Math.abs(time - before) <= Math.abs(time - after) ? before : after;
}

/** Compute keyframe interval (average gap between keyframes in seconds). */
export function computeKeyframeInterval(keyframeTimes: number[]): number {
  if (keyframeTimes.length < 2) return 0;
  const totalGap =
    keyframeTimes[keyframeTimes.length - 1] - keyframeTimes[0];
  return totalGap / (keyframeTimes.length - 1);
}
