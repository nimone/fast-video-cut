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

  // Selected segment index (for reordering, deletion, visual highlight)
  selectedSegmentIndex: number | null;

  // Undo/redo history — each entry is a snapshot of segments
  history: Segment[][];
  historyIndex: number;

  // Player state (shared)
  currentTime: number;
  hoverTime: number | null;

  // Selected range on timeline (for delete)
  selectionStart: number | null;
  selectionEnd: number | null;

  // Actions
  initFile: (file: File, duration: number, keyframeTimes: number[], fps: number) => void;
  setCurrentTime: (time: number) => void;
  setHoverTime: (time: number | null) => void;
  setSelection: (start: number | null, end: number | null) => void;
  setSelectedSegmentIndex: (idx: number | null) => void;

  // Edit ops
  cutAtCursor: (time?: number) => void;
  trimLeft: (time?: number) => void;
  trimRight: (time?: number) => void;
  deleteSelection: () => void;
  deleteSegmentByIndex: (idx: number) => void;
  deleteSelectedSegment: () => void;
  moveSegment: (idx: number, direction: 'left' | 'right') => void;

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
  selectedSegmentIndex: null,
  history: [],
  historyIndex: -1,
  currentTime: 0,
  hoverTime: null,
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
      selectedSegmentIndex: null,
      history: initialHistory,
      historyIndex: 0,
      currentTime: 0,
      hoverTime: null,
      selectionStart: null,
      selectionEnd: null,
    });
  },

  setCurrentTime(time) {
    set({ currentTime: time });
  },

  setHoverTime(time) {
    set({ hoverTime: time });
  },

  setSelection(start, end) {
    set({ selectionStart: start, selectionEnd: end });
  },

  setSelectedSegmentIndex(idx) {
    set({ selectedSegmentIndex: idx });
  },

  cutAtCursor(time) {
    const { currentTime, segments, keyframeTimes, history, historyIndex } = get();
    const targetTime = typeof time === 'number' ? time : currentTime;
    const snapTime = snapStart(targetTime, keyframeTimes);

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

  trimLeft(time) {
    const { currentTime, segments, keyframeTimes, history, historyIndex } = get();
    const targetTime = typeof time === 'number' ? time : currentTime;
    const snapTime = snapStart(targetTime, keyframeTimes);

    // Find the segment containing the cursor
    const containingSegIdx = segments.findIndex(
      (seg) => snapTime >= seg.start && snapTime <= seg.end
    );

    if (containingSegIdx === -1) return; // Cursor is not in any segment

    const newSegments = segments
      .map((seg, idx) => {
        if (idx === containingSegIdx) {
          return { start: snapTime, end: seg.end };
        }
        return { ...seg };
      })
      .filter((seg) => seg.start < seg.end);

    if (newSegments.length === 0) return; // Keep at least one segment

    const h = pushHistory(history, historyIndex, newSegments);
    set({ segments: newSegments, ...h });
  },

  trimRight(time) {
    const { currentTime, segments, keyframeTimes, history, historyIndex } = get();
    const targetTime = typeof time === 'number' ? time : currentTime;
    const snapTime = snapStart(targetTime, keyframeTimes);

    // Find the segment containing the cursor
    const containingSegIdx = segments.findIndex(
      (seg) => snapTime >= seg.start && snapTime <= seg.end
    );

    if (containingSegIdx === -1) return; // Cursor is not in any segment

    const newSegments = segments
      .map((seg, idx) => {
        if (idx === containingSegIdx) {
          return { start: seg.start, end: snapTime };
        }
        return { ...seg };
      })
      .filter((seg) => seg.start < seg.end);

    if (newSegments.length === 0) return; // Keep at least one segment

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
    const { segments, history, historyIndex, selectedSegmentIndex } = get();
    if (segments.length <= 1) return; // Can't remove last segment
    const newSegments = segments.filter((_, i) => i !== idx);
    const h = pushHistory(history, historyIndex, newSegments);

    let newSelectedIdx = selectedSegmentIndex;
    if (selectedSegmentIndex === idx) {
      newSelectedIdx = null;
    } else if (selectedSegmentIndex !== null && selectedSegmentIndex > idx) {
      newSelectedIdx = selectedSegmentIndex - 1;
    }

    set({
      segments: newSegments,
      selectedSegmentIndex: newSelectedIdx,
      ...h
    });
  },

  deleteSelectedSegment() {
    const { selectedSegmentIndex, deleteSegmentByIndex } = get();
    if (selectedSegmentIndex !== null) {
      deleteSegmentByIndex(selectedSegmentIndex);
    }
  },

  moveSegment(idx, direction) {
    const { segments, history, historyIndex, selectedSegmentIndex } = get();
    if (idx < 0 || idx >= segments.length) return;
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= segments.length) return;

    const newSegments = [...segments];
    const temp = newSegments[idx];
    newSegments[idx] = newSegments[targetIdx];
    newSegments[targetIdx] = temp;

    const h = pushHistory(history, historyIndex, newSegments);

    let newSelectedIdx = selectedSegmentIndex;
    if (selectedSegmentIndex === idx) {
      newSelectedIdx = targetIdx;
    } else if (selectedSegmentIndex === targetIdx) {
      newSelectedIdx = idx;
    }

    set({
      segments: newSegments,
      selectedSegmentIndex: newSelectedIdx,
      ...h
    });
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
