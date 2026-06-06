// src/store/keymap-store.ts
// Default keybindings + remap UI + localStorage persistence.

import { create } from 'zustand';

export type ActionName =
  | 'playPause'
  | 'cutAtCursor'
  | 'trimLeft'
  | 'trimRight'
  | 'deleteSelection'
  | 'frameStepBack'
  | 'frameStepForward'
  | 'bigJumpBack'
  | 'bigJumpForward'
  | 'prevCut'
  | 'nextCut'
  | 'zoomIn'
  | 'zoomOut'
  | 'speedDown'
  | 'speedUp'
  | 'moveSegmentLeft'
  | 'moveSegmentRight'
  | 'undo'
  | 'redo'
  | 'export'
  | 'openFile'
  | 'showCheatsheet';

export const ACTION_LABELS: Record<ActionName, string> = {
  playPause: 'Play / Pause',
  cutAtCursor: 'Cut at cursor',
  trimLeft: 'Trim left',
  trimRight: 'Trim right',
  deleteSelection: 'Delete selection / clip',
  frameStepBack: 'Frame step back',
  frameStepForward: 'Frame step forward',
  bigJumpBack: 'Big jump back',
  bigJumpForward: 'Big jump forward',
  prevCut: 'Previous cut',
  nextCut: 'Next cut',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  speedDown: 'Speed down',
  speedUp: 'Speed up',
  moveSegmentLeft: 'Move selected clip left',
  moveSegmentRight: 'Move selected clip right',
  undo: 'Undo',
  redo: 'Redo',
  export: 'Export',
  openFile: 'Open file',
  showCheatsheet: 'Show cheatsheet',
};

export const DEFAULT_BINDINGS: Record<ActionName, string> = {
  playPause: 'Space',
  cutAtCursor: 's',
  trimLeft: 'a',
  trimRight: 'd',
  deleteSelection: 'Delete',
  frameStepBack: 'ArrowLeft',
  frameStepForward: 'ArrowRight',
  bigJumpBack: 'Shift+ArrowLeft',
  bigJumpForward: 'Shift+ArrowRight',
  prevCut: ',',
  nextCut: '.',
  zoomIn: '+',
  zoomOut: '-',
  speedDown: 'Alt+[',
  speedUp: 'Alt+]',
  moveSegmentLeft: '[',
  moveSegmentRight: ']',
  undo: '$mod+z',
  redo: '$mod+Shift+z',
  export: '$mod+e',
  openFile: '$mod+o',
  showCheatsheet: '?',
};

const STORAGE_KEY = 'videoCut_keymap_v1';

function loadFromStorage(): Partial<Record<ActionName, string>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Clean up legacy default key bindings so new defaults take effect
      if (parsed.cutAtCursor === 'c') delete parsed.cutAtCursor;
      if (parsed.trimLeft === 'q') delete parsed.trimLeft;
      if (parsed.trimRight === 'w') delete parsed.trimRight;
      if (parsed.speedDown === '[') delete parsed.speedDown;
      if (parsed.speedUp === ']') delete parsed.speedUp;
      return parsed;
    }
  } catch {
    // ignore
  }
  return {};
}

function saveToStorage(bindings: Record<ActionName, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // ignore
  }
}

interface KeymapState {
  bindings: Record<ActionName, string>;
  setBinding: (action: ActionName, key: string) => void;
  resetBinding: (action: ActionName) => void;
  resetAll: () => void;
}

export const useKeymapStore = create<KeymapState>((set) => {
  const overrides = loadFromStorage();
  const bindings: Record<ActionName, string> = { ...DEFAULT_BINDINGS, ...overrides };

  return {
    bindings,

    setBinding(action, key) {
      set((state) => {
        const next = { ...state.bindings, [action]: key };
        saveToStorage(next);
        return { bindings: next };
      });
    },

    resetBinding(action) {
      set((state) => {
        const next = { ...state.bindings, [action]: DEFAULT_BINDINGS[action] };
        saveToStorage(next);
        return { bindings: next };
      });
    },

    resetAll() {
      const next = { ...DEFAULT_BINDINGS };
      saveToStorage(next);
      set({ bindings: next });
    },
  };
});
