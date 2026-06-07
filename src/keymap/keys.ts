// src/keymap/keys.ts
// Registers global tinykeys bindings and dispatches them to store/player actions.

import { tinykeys } from 'tinykeys';
import type { Player } from '../media/player';
import { useEditStore } from '../store/edit-store';
import { useKeymapStore } from '../store/keymap-store';

const SPEED_CYCLE = [0.25, 0.5, 1, 1.5, 2];

/** Returns true when keyboard focus is inside a text input / dialog close button — shortcuts should be suppressed. */
function isFocusedOnInput(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
}

interface KeymapDeps {
  getEditStore: () => ReturnType<typeof useEditStore.getState>;
  getKeymapStore: () => ReturnType<typeof useKeymapStore.getState>;
  getPlayer: () => Player | null;
  openFile: () => void;
  openExport: () => void;
  toggleCheatsheet: () => void;
}

export function registerKeymap(deps: KeymapDeps): () => void {
  const {
    getEditStore,
    getKeymapStore,
    getPlayer,
    openFile,
    openExport,
    toggleCheatsheet,
  } = deps;

  const actions: Record<string, (e: KeyboardEvent) => void> = {
    playPause(e) {
      e.preventDefault();
      const p = getPlayer();
      if (!p) return;
      if (!p.playing && p.hoverTime !== null) {
        const targetTime = p.hoverTime;
        const store = getEditStore();
        store.setCurrentTime(targetTime);
        void p.play(targetTime);
      } else {
        p.togglePlayPause();
      }
    },
    cutAtCursor(e) {
      e.preventDefault();
      const store = getEditStore();
      const p = getPlayer();
      const targetTime = (p && p.hoverTime !== null) ? p.hoverTime : store.currentTime;
      store.cutAtCursor(targetTime);
      store.setCurrentTime(targetTime);
      void p?.seekTo(targetTime);
    },
    trimLeft(e) {
      e.preventDefault();
      const store = getEditStore();
      const p = getPlayer();
      const targetTime = (p && p.hoverTime !== null) ? p.hoverTime : store.currentTime;
      store.trimLeft(targetTime);
      store.setCurrentTime(targetTime);
      void p?.seekTo(targetTime);
    },
    trimRight(e) {
      e.preventDefault();
      const store = getEditStore();
      const p = getPlayer();
      const targetTime = (p && p.hoverTime !== null) ? p.hoverTime : store.currentTime;
      store.trimRight(targetTime);
      store.setCurrentTime(targetTime);
      void p?.seekTo(targetTime);
    },
    deleteSelection(e) {
      e.preventDefault();
      const store = getEditStore();
      if (store.selectionStart !== null && store.selectionEnd !== null) {
        store.deleteSelection();
      } else if (store.selectedSegmentIndex !== null) {
        store.deleteSelectedSegment();
      }
    },
    moveSegmentLeft(e) {
      e.preventDefault();
      const store = getEditStore();
      if (store.selectedSegmentIndex !== null) {
        store.moveSegment(store.selectedSegmentIndex, 'left');
      }
    },
    moveSegmentRight(e) {
      e.preventDefault();
      const store = getEditStore();
      if (store.selectedSegmentIndex !== null) {
        store.moveSegment(store.selectedSegmentIndex, 'right');
      }
    },
    frameStepBack(e) {
      e.preventDefault();
      const { fps } = getEditStore();
      void getPlayer()?.frameStep(-1, fps);
    },
    frameStepForward(e) {
      e.preventDefault();
      const { fps } = getEditStore();
      void getPlayer()?.frameStep(1, fps);
    },
    bigJumpBack(e) {
      e.preventDefault();
      const p = getPlayer();
      if (p) void p.seekTo(p.currentTime - 5);
    },
    bigJumpForward(e) {
      e.preventDefault();
      const p = getPlayer();
      if (p) void p.seekTo(p.currentTime + 5);
    },
    prevCut(e) {
      e.preventDefault();
      const { segments, currentTime, setCurrentTime } = getEditStore();
      const p = getPlayer();
      // Find all cut boundaries
      const boundaries = [
        ...new Set(segments.flatMap((s) => [s.start, s.end])),
      ].sort((a, b) => a - b);
      const prev = boundaries
        .filter((t) => t < currentTime - 0.05)
        .at(-1);
      if (prev !== undefined) {
        setCurrentTime(prev);
        void p?.seekTo(prev);
      }
    },
    nextCut(e) {
      e.preventDefault();
      const { segments, currentTime, setCurrentTime } = getEditStore();
      const p = getPlayer();
      const boundaries = [
        ...new Set(segments.flatMap((s) => [s.start, s.end])),
      ].sort((a, b) => a - b);
      const next = boundaries.find((t) => t > currentTime + 0.05);
      if (next !== undefined) {
        setCurrentTime(next);
        void p?.seekTo(next);
      }
    },
    zoomIn(e) {
      e.preventDefault();
      // Timeline zoom handled via event
      window.dispatchEvent(new CustomEvent('timeline:zoomIn'));
    },
    zoomOut(e) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('timeline:zoomOut'));
    },
    speedDown(e) {
      e.preventDefault();
      const p = getPlayer();
      if (!p) return;
      const idx = SPEED_CYCLE.findIndex((s) => s >= p.speed);
      const nextIdx = Math.max(0, idx - 1);
      p.setSpeed(SPEED_CYCLE[nextIdx]);
    },
    speedUp(e) {
      e.preventDefault();
      const p = getPlayer();
      if (!p) return;
      const idx = SPEED_CYCLE.findIndex((s) => s >= p.speed);
      const nextIdx = Math.min(SPEED_CYCLE.length - 1, idx + 1);
      p.setSpeed(SPEED_CYCLE[nextIdx]);
    },
    undo(e) {
      e.preventDefault();
      getEditStore().undo();
    },
    redo(e) {
      e.preventDefault();
      getEditStore().redo();
    },
    export(e) {
      e.preventDefault();
      openExport();
    },
    openFile(e) {
      if (isFocusedOnInput()) return;
      e.preventDefault();
      openFile();
    },
    showCheatsheet(e) {
      if (isFocusedOnInput()) return;
      e.preventDefault();
      toggleCheatsheet();
    },
  };

  // Build the tinykeys map from current bindings
  const rebuild = () => {
    const { bindings } = getKeymapStore();
    const keyMap: Record<string, (e: KeyboardEvent) => void> = {};
    for (const [action, key] of Object.entries(bindings)) {
      if (actions[action]) {
        keyMap[key] = actions[action];
      }
    }
    return keyMap;
  };

  let unsubscribe = tinykeys(window, rebuild());

  // Re-register whenever bindings change
  const unsubscribeStore = useKeymapStore.subscribe(() => {
    unsubscribe();
    unsubscribe = tinykeys(window, rebuild());
  });

  return () => {
    unsubscribe();
    unsubscribeStore();
  };
}
