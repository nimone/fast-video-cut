// src/store/edit-store.ts
// zustand store: kept segment list + cut/trim/delete ops + undo/redo history

import { create } from 'zustand';
import { snapToNearestKeyframeBefore } from '../media/keyframes';

export interface Segment {
  start: number;
  end: number;
}

interface EditStoreState {
  // File info
  file: File | null;
  duration: number;
  keyframeTimes: number[];
  fps: number;

  // Segments (kept regions)
  segments: Segment[];

  // Undo/redo history — each entry is a snapshot of segments
  history: Segment[][];
  historyIndex: number;

  // Player state (shared)
  currentTime: number;

  // Selected range on timeline (for delete)
  selectionStart: number | null;
  selectionEnd: number | null;

  // Actions
  initFile: (file: File, duration: number, keyframeTimes: number[], fps: number) => void;
  setCurrentTime: (time: number) => void;
  setSelection: (start: number | null, end: number | null) => void;

  // Edit ops
  cutAtCursor: () => void;
  trimLeft: () => void;
  trimRight: () => void;
  deleteSelection: () => void;
  deleteSegmentByIndex: (idx: number) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const MAX_HISTORY = 100;

function pushHistory(
  history: Segment[][],
  historyIndex: number,
  newSegments: Segment[]
): { history: Segment[][]; historyIndex: number } {
  const trimmed = history.slice(0, historyIndex + 1);
  trimmed.push(newSegments.map((s) => ({ ...s })));
  if (trimmed.length > MAX_HISTORY) trimmed.shift();
  return {
    history: trimmed,
    historyIndex: trimmed.length - 1,
  };
}

function snapStart(time: number, keyframeTimes: number[]): number {
  return snapToNearestKeyframeBefore(time, keyframeTimes);
}

export const useEditStore = create<EditStoreState>((set, get) => ({
  file: null,
  duration: 0,
  keyframeTimes: [],
  fps: 30,
  segments: [],
  history: [],
  historyIndex: -1,
  currentTime: 0,
  selectionStart: null,
  selectionEnd: null,

  initFile(file, duration, keyframeTimes, fps) {
    const initialSegments: Segment[] = [{ start: 0, end: duration }];
    const initialHistory = [initialSegments.map((s) => ({ ...s }))];
    set({
      file,
      duration,
      keyframeTimes,
      fps,
      segments: initialSegments,
      history: initialHistory,
      historyIndex: 0,
      currentTime: 0,
      selectionStart: null,
      selectionEnd: null,
    });
  },

  setCurrentTime(time) {
    set({ currentTime: time });
  },

  setSelection(start, end) {
    set({ selectionStart: start, selectionEnd: end });
  },

  cutAtCursor() {
    const { currentTime, segments, keyframeTimes, history, historyIndex } = get();
    const snapTime = snapStart(currentTime, keyframeTimes);

    const newSegments: Segment[] = [];
    let didCut = false;

    for (const seg of segments) {
      if (!didCut && snapTime > seg.start && snapTime < seg.end) {
        // Split this segment
        newSegments.push({ start: seg.start, end: snapTime });
        newSegments.push({ start: snapTime, end: seg.end });
        didCut = true;
      } else {
        newSegments.push({ ...seg });
      }
    }

    if (!didCut) return; // Cursor not in any segment

    const h = pushHistory(history, historyIndex, newSegments);
    set({ segments: newSegments, ...h });
  },

  trimLeft() {
    // Remove everything from start up to cursor (snapped to keyframe).
    // Effectively: update the containing segment's start to cursor.
    const { currentTime, segments, keyframeTimes, history, historyIndex } = get();
    const snapTime = snapStart(currentTime, keyframeTimes);

    const newSegments: Segment[] = [];
    for (const seg of segments) {
      if (snapTime >= seg.end) {
        // Entirely before cursor — remove this segment
        continue;
      }
      if (snapTime > seg.start) {
        // Cursor is inside this segment — trim start
        newSegments.push({ start: snapTime, end: seg.end });
      } else {
        newSegments.push({ ...seg });
      }
    }

    if (newSegments.length === 0) return; // Would remove everything

    const h = pushHistory(history, historyIndex, newSegments);
    set({ segments: newSegments, ...h });
  },

  trimRight() {
    // Remove everything from cursor onward.
    const { currentTime, segments, keyframeTimes, history, historyIndex } = get();
    const snapTime = snapStart(currentTime, keyframeTimes);

    const newSegments: Segment[] = [];
    for (const seg of segments) {
      if (snapTime <= seg.start) {
        // Entirely after cursor — remove
        continue;
      }
      if (snapTime < seg.end) {
        // Cursor inside — trim end
        newSegments.push({ start: seg.start, end: snapTime });
      } else {
        newSegments.push({ ...seg });
      }
    }

    if (newSegments.length === 0) return;

    const h = pushHistory(history, historyIndex, newSegments);
    set({ segments: newSegments, ...h });
  },

  deleteSelection() {
    const { selectionStart, selectionEnd, segments, keyframeTimes, history, historyIndex } = get();
    if (selectionStart === null || selectionEnd === null) return;
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    const snapS = snapStart(start, keyframeTimes);
    const snapE = snapStart(end, keyframeTimes);

    const newSegments: Segment[] = [];
    for (const seg of segments) {
      if (snapE <= seg.start || snapS >= seg.end) {
        // No overlap
        newSegments.push({ ...seg });
      } else if (snapS <= seg.start && snapE >= seg.end) {
        // Selection covers entire segment — remove
      } else if (snapS > seg.start && snapE < seg.end) {
        // Selection cuts through middle
        newSegments.push({ start: seg.start, end: snapS });
        newSegments.push({ start: snapE, end: seg.end });
      } else if (snapS <= seg.start) {
        // Selection covers start
        newSegments.push({ start: snapE, end: seg.end });
      } else {
        // Selection covers end
        newSegments.push({ start: seg.start, end: snapS });
      }
    }

    if (newSegments.length === 0) return;

    const h = pushHistory(history, historyIndex, newSegments);
    set({ segments: newSegments, selectionStart: null, selectionEnd: null, ...h });
  },

  deleteSegmentByIndex(idx) {
    const { segments, history, historyIndex } = get();
    if (segments.length <= 1) return; // Can't remove last segment
    const newSegments = segments.filter((_, i) => i !== idx);
    const h = pushHistory(history, historyIndex, newSegments);
    set({ segments: newSegments, ...h });
  },

  undo() {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    set({
      segments: history[newIndex].map((s) => ({ ...s })),
      historyIndex: newIndex,
    });
  },

  redo() {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    set({
      segments: history[newIndex].map((s) => ({ ...s })),
      historyIndex: newIndex,
    });
  },

  canUndo: () => {
    const { historyIndex } = get();
    return historyIndex > 0;
  },

  canRedo: () => {
    const { history, historyIndex } = get();
    return historyIndex < history.length - 1;
  },
}));
