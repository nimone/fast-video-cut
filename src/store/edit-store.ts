// src/store/edit-store.ts
// zustand store: multi-clip track + cut/trim/delete ops + per-clip undo/redo history

import { create } from 'zustand';
import { snapToNearestKeyframeBefore } from '../media/keyframes';

export interface Segment {
  start: number;
  end: number;
}

// Clip colors — cycled through as clips are added
const CLIP_COLORS = [
  '#5b4fff', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
];

export interface TrackClip {
  id: string;
  file: File;
  duration: number;
  keyframeTimes: number[];
  fps: number;
  segments: Segment[];
  history: Segment[][];
  historyIndex: number;
  color: string;
}

interface EditStoreState {
  // ── Multi-clip track ──────────────────────────────────────────────
  clips: TrackClip[];
  activeClipId: string | null;

  // ── Derived / active-clip mirrors (kept for backward compat) ──────
  file: File | null;
  duration: number;
  keyframeTimes: number[];
  fps: number;
  segments: Segment[];

  // Selected segment index (within the active clip)
  selectedSegmentIndex: number | null;

  // Undo/redo history — mirrors active clip's history
  history: Segment[][];
  historyIndex: number;

  // Player state (shared)
  currentTime: number;
  hoverTime: number | null;
  /** Which clip the cursor is currently hovering over (may differ from activeClipId) */
  hoverClipId: string | null;

  // Selected range on timeline (for delete)
  selectionStart: number | null;
  selectionEnd: number | null;

  // ── Actions ───────────────────────────────────────────────────────
  /** RESET — clears all clips, creates exactly one clip */
  initFile: (file: File, duration: number, keyframeTimes: number[], fps: number) => void;
  /** ADD — appends a new clip, returns its id */
  appendClip: (file: File, duration: number, keyframeTimes: number[], fps: number) => string;
  setActiveClipId: (id: string) => void;
  removeClip: (id: string) => void;
  loadClips: (clips: TrackClip[], activeClipId: string | null) => void;
  clearClips: () => void;

  setCurrentTime: (time: number) => void;
  setHoverTime: (time: number | null, clipId?: string | null) => void;
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

/** Build the top-level derived fields from a clip */
function derivedFromClip(clip: TrackClip) {
  return {
    file: clip.file,
    duration: clip.duration,
    keyframeTimes: clip.keyframeTimes,
    fps: clip.fps,
    segments: clip.segments,
    history: clip.history,
    historyIndex: clip.historyIndex,
  };
}

/** Update clips array: replace the clip matching `id` with `updatedClip` */
function updateClips(clips: TrackClip[], id: string, updatedClip: TrackClip): TrackClip[] {
  return clips.map((c) => (c.id === id ? updatedClip : c));
}

let colorIndex = 0;
function nextColor(): string {
  const color = CLIP_COLORS[colorIndex % CLIP_COLORS.length];
  colorIndex++;
  return color;
}

export const useEditStore = create<EditStoreState>((set, get) => ({
  clips: [],
  activeClipId: null,

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
  hoverClipId: null,
  selectionStart: null,
  selectionEnd: null,

  initFile(file, duration, keyframeTimes, fps) {
    colorIndex = 0; // reset color cycling
    const initialSegments: Segment[] = [{ start: 0, end: duration }];
    const initialHistory = [initialSegments.map((s) => ({ ...s }))];
    const id = crypto.randomUUID();
    const clip: TrackClip = {
      id,
      file,
      duration,
      keyframeTimes,
      fps,
      segments: initialSegments,
      history: initialHistory,
      historyIndex: 0,
      color: nextColor(),
    };
    set({
      clips: [clip],
      activeClipId: id,
      ...derivedFromClip(clip),
      selectedSegmentIndex: null,
      currentTime: 0,
      hoverTime: null,
      hoverClipId: null,
      selectionStart: null,
      selectionEnd: null,
    });
  },

  appendClip(file, duration, keyframeTimes, fps) {
    const initialSegments: Segment[] = [{ start: 0, end: duration }];
    const initialHistory = [initialSegments.map((s) => ({ ...s }))];
    const id = crypto.randomUUID();
    const clip: TrackClip = {
      id,
      file,
      duration,
      keyframeTimes,
      fps,
      segments: initialSegments,
      history: initialHistory,
      historyIndex: 0,
      color: nextColor(),
    };
    const newClips = [...get().clips, clip];
    set({
      clips: newClips,
      activeClipId: id,
      ...derivedFromClip(clip),
      selectedSegmentIndex: null,
      currentTime: 0,
      hoverTime: null,
      hoverClipId: null,
      selectionStart: null,
      selectionEnd: null,
    });
    return id;
  },

  setActiveClipId(id) {
    const { clips } = get();
    const clip = clips.find((c) => c.id === id);
    if (!clip) return;
    set({
      activeClipId: id,
      ...derivedFromClip(clip),
      selectedSegmentIndex: null,
      currentTime: 0,
      hoverTime: null,
      hoverClipId: null,
    });
  },

  removeClip(id) {
    const { clips, activeClipId } = get();
    const newClips = clips.filter((c) => c.id !== id);
    if (newClips.length === 0) {
      set({
        clips: [],
        activeClipId: null,
        file: null,
        duration: 0,
        keyframeTimes: [],
        fps: 30,
        segments: [],
        history: [],
        historyIndex: -1,
        selectedSegmentIndex: null,
        currentTime: 0,
      });
      return;
    }
    let newActiveId = activeClipId;
    if (activeClipId === id) {
      newActiveId = newClips[0].id;
    }
    const activeClip = newClips.find((c) => c.id === newActiveId) ?? newClips[0];
    set({
      clips: newClips,
      activeClipId: activeClip.id,
      ...derivedFromClip(activeClip),
      selectedSegmentIndex: null,
    });
  },

  loadClips(clips, activeClipId) {
    const activeClip = clips.find((c) => c.id === activeClipId) || clips[0];
    if (activeClip) {
      set({
        clips,
        activeClipId: activeClip.id,
        ...derivedFromClip(activeClip),
        selectedSegmentIndex: null,
        currentTime: 0,
        hoverTime: null,
        hoverClipId: null,
        selectionStart: null,
        selectionEnd: null,
      });
    } else {
      get().clearClips();
    }
  },

  clearClips() {
    set({
      clips: [],
      activeClipId: null,
      file: null,
      duration: 0,
      keyframeTimes: [],
      fps: 30,
      segments: [],
      history: [],
      historyIndex: -1,
      selectedSegmentIndex: null,
      currentTime: 0,
      hoverTime: null,
      hoverClipId: null,
      selectionStart: null,
      selectionEnd: null,
    });
  },

  setCurrentTime(time) {
    set({ currentTime: time });
  },

  setHoverTime(time, clipId) {
    set({ hoverTime: time, hoverClipId: clipId ?? null });
  },

  setSelection(start, end) {
    set({ selectionStart: start, selectionEnd: end });
  },

  setSelectedSegmentIndex(idx) {
    set({ selectedSegmentIndex: idx });
  },

  cutAtCursor(time) {
    const { hoverTime, hoverClipId, activeClipId, clips, currentTime, segments, keyframeTimes, history, historyIndex } = get();
    // Resolve target clip — use hovered clip if different, otherwise active clip
    const targetId = (hoverClipId && hoverClipId !== activeClipId) ? hoverClipId : activeClipId;
    const targetClip = clips.find((c) => c.id === targetId);
    if (!targetClip) return;
    const isActive = targetId === activeClipId;
    const workSegs = isActive ? segments : targetClip.segments;
    const workKf   = isActive ? keyframeTimes : targetClip.keyframeTimes;
    const workHist = isActive ? history : targetClip.history;
    const workHistIdx = isActive ? historyIndex : targetClip.historyIndex;

    const targetTime = typeof time === 'number' ? time : (hoverTime ?? currentTime);
    const snapTime = snapStart(targetTime, workKf);

    const newSegments: Segment[] = [];
    let didCut = false;
    for (const seg of workSegs) {
      if (!didCut && snapTime > seg.start && snapTime < seg.end) {
        newSegments.push({ start: seg.start, end: snapTime });
        newSegments.push({ start: snapTime, end: seg.end });
        didCut = true;
      } else {
        newSegments.push({ ...seg });
      }
    }
    if (!didCut) return;

    const h = pushHistory(workHist, workHistIdx, newSegments);
    const updatedClips = updateClips(clips, targetId!, {
      ...targetClip,
      segments: newSegments,
      history: h.history,
      historyIndex: h.historyIndex,
    });
    // Only update derived active-clip mirrors if we edited the active clip
    if (isActive) {
      set({ segments: newSegments, clips: updatedClips, ...h });
    } else {
      set({ clips: updatedClips });
    }
  },

  trimLeft(time) {
    const { hoverTime, hoverClipId, activeClipId, clips, currentTime, segments, keyframeTimes, history, historyIndex } = get();
    const targetId = (hoverClipId && hoverClipId !== activeClipId) ? hoverClipId : activeClipId;
    const targetClip = clips.find((c) => c.id === targetId);
    if (!targetClip) return;
    const isActive = targetId === activeClipId;
    const workSegs = isActive ? segments : targetClip.segments;
    const workKf   = isActive ? keyframeTimes : targetClip.keyframeTimes;
    const workHist = isActive ? history : targetClip.history;
    const workHistIdx = isActive ? historyIndex : targetClip.historyIndex;

    const targetTime = typeof time === 'number' ? time : (hoverTime ?? currentTime);
    const snapTime = snapStart(targetTime, workKf);

    const containingSegIdx = workSegs.findIndex(
      (seg) => snapTime >= seg.start && snapTime <= seg.end
    );
    if (containingSegIdx === -1) return;

    const newSegments = workSegs
      .map((seg, idx) => idx === containingSegIdx ? { start: snapTime, end: seg.end } : { ...seg })
      .filter((seg) => seg.start < seg.end);
    if (newSegments.length === 0) return;

    const h = pushHistory(workHist, workHistIdx, newSegments);
    const updatedClips = updateClips(clips, targetId!, {
      ...targetClip,
      segments: newSegments,
      history: h.history,
      historyIndex: h.historyIndex,
    });
    if (isActive) {
      set({ segments: newSegments, clips: updatedClips, ...h });
    } else {
      set({ clips: updatedClips });
    }
  },

  trimRight(time) {
    const { hoverTime, hoverClipId, activeClipId, clips, currentTime, segments, keyframeTimes, history, historyIndex } = get();
    const targetId = (hoverClipId && hoverClipId !== activeClipId) ? hoverClipId : activeClipId;
    const targetClip = clips.find((c) => c.id === targetId);
    if (!targetClip) return;
    const isActive = targetId === activeClipId;
    const workSegs = isActive ? segments : targetClip.segments;
    const workKf   = isActive ? keyframeTimes : targetClip.keyframeTimes;
    const workHist = isActive ? history : targetClip.history;
    const workHistIdx = isActive ? historyIndex : targetClip.historyIndex;

    const targetTime = typeof time === 'number' ? time : (hoverTime ?? currentTime);
    const snapTime = snapStart(targetTime, workKf);

    const containingSegIdx = workSegs.findIndex(
      (seg) => snapTime >= seg.start && snapTime <= seg.end
    );
    if (containingSegIdx === -1) return;

    const newSegments = workSegs
      .map((seg, idx) => idx === containingSegIdx ? { start: seg.start, end: snapTime } : { ...seg })
      .filter((seg) => seg.start < seg.end);
    if (newSegments.length === 0) return;

    const h = pushHistory(workHist, workHistIdx, newSegments);
    const updatedClips = updateClips(clips, targetId!, {
      ...targetClip,
      segments: newSegments,
      history: h.history,
      historyIndex: h.historyIndex,
    });
    if (isActive) {
      set({ segments: newSegments, clips: updatedClips, ...h });
    } else {
      set({ clips: updatedClips });
    }
  },

  deleteSelection() {
    const { selectionStart, selectionEnd, segments, keyframeTimes, history, historyIndex, clips, activeClipId } = get();
    if (selectionStart === null || selectionEnd === null) return;
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    const snapS = snapStart(start, keyframeTimes);
    const snapE = snapStart(end, keyframeTimes);

    const newSegments: Segment[] = [];
    for (const seg of segments) {
      if (snapE <= seg.start || snapS >= seg.end) {
        newSegments.push({ ...seg });
      } else if (snapS <= seg.start && snapE >= seg.end) {
        // covered entirely — drop
      } else if (snapS > seg.start && snapE < seg.end) {
        newSegments.push({ start: seg.start, end: snapS });
        newSegments.push({ start: snapE, end: seg.end });
      } else if (snapS <= seg.start) {
        newSegments.push({ start: snapE, end: seg.end });
      } else {
        newSegments.push({ start: seg.start, end: snapS });
      }
    }

    if (newSegments.length === 0) return;

    const h = pushHistory(history, historyIndex, newSegments);
    const updatedClips = activeClipId
      ? updateClips(clips, activeClipId, {
          ...clips.find((c) => c.id === activeClipId)!,
          segments: newSegments,
          history: h.history,
          historyIndex: h.historyIndex,
        })
      : clips;
    set({ segments: newSegments, selectionStart: null, selectionEnd: null, clips: updatedClips, ...h });
  },

  deleteSegmentByIndex(idx) {
    const { segments, history, historyIndex, selectedSegmentIndex, clips, activeClipId, removeClip } = get();
    if (segments.length <= 1) {
      if (activeClipId) {
        removeClip(activeClipId);
      }
      return;
    }
    const newSegments = segments.filter((_, i) => i !== idx);
    const h = pushHistory(history, historyIndex, newSegments);

    let newSelectedIdx = selectedSegmentIndex;
    if (selectedSegmentIndex === idx) {
      newSelectedIdx = null;
    } else if (selectedSegmentIndex !== null && selectedSegmentIndex > idx) {
      newSelectedIdx = selectedSegmentIndex - 1;
    }

    const updatedClips = activeClipId
      ? updateClips(clips, activeClipId, {
          ...clips.find((c) => c.id === activeClipId)!,
          segments: newSegments,
          history: h.history,
          historyIndex: h.historyIndex,
        })
      : clips;
    set({
      segments: newSegments,
      selectedSegmentIndex: newSelectedIdx,
      clips: updatedClips,
      ...h,
    });
  },

  deleteSelectedSegment() {
    const { selectedSegmentIndex, deleteSegmentByIndex } = get();
    if (selectedSegmentIndex !== null) {
      deleteSegmentByIndex(selectedSegmentIndex);
    }
  },

  moveSegment(idx, direction) {
    const { segments, history, historyIndex, selectedSegmentIndex, clips, activeClipId } = get();
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

    const updatedClips = activeClipId
      ? updateClips(clips, activeClipId, {
          ...clips.find((c) => c.id === activeClipId)!,
          segments: newSegments,
          history: h.history,
          historyIndex: h.historyIndex,
        })
      : clips;
    set({
      segments: newSegments,
      selectedSegmentIndex: newSelectedIdx,
      clips: updatedClips,
      ...h,
    });
  },

  undo() {
    const { history, historyIndex, clips, activeClipId } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const newSegments = history[newIndex].map((s) => ({ ...s }));
    const updatedClips = activeClipId
      ? updateClips(clips, activeClipId, {
          ...clips.find((c) => c.id === activeClipId)!,
          segments: newSegments,
          historyIndex: newIndex,
        })
      : clips;
    set({
      segments: newSegments,
      historyIndex: newIndex,
      clips: updatedClips,
    });
  },

  redo() {
    const { history, historyIndex, clips, activeClipId } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const newSegments = history[newIndex].map((s) => ({ ...s }));
    const updatedClips = activeClipId
      ? updateClips(clips, activeClipId, {
          ...clips.find((c) => c.id === activeClipId)!,
          segments: newSegments,
          historyIndex: newIndex,
        })
      : clips;
    set({
      segments: newSegments,
      historyIndex: newIndex,
      clips: updatedClips,
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
