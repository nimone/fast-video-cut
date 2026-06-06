// src/components/info/shortcut-help.tsx
// Keyboard shortcut cheatsheet overlay.

import { X } from 'lucide-react';
import { useKeymapStore, ACTION_LABELS, type ActionName } from '../../store/keymap-store';

interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

function formatKey(key: string): string {
  return key
    .replace('$mod', '⌘/Ctrl')
    .replace('Shift+', 'Shift+')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('Space', 'Space')
    .replace('Delete', 'Del');
}

const SECTIONS: Array<{ title: string; actions: ActionName[] }> = [
  {
    title: 'Playback',
    actions: ['playPause', 'frameStepBack', 'frameStepForward', 'bigJumpBack', 'bigJumpForward', 'speedDown', 'speedUp'],
  },
  {
    title: 'Editing',
    actions: ['cutAtCursor', 'trimLeft', 'trimRight', 'deleteSelection', 'undo', 'redo'],
  },
  {
    title: 'Navigation',
    actions: ['prevCut', 'nextCut', 'zoomIn', 'zoomOut'],
  },
  {
    title: 'File',
    actions: ['openFile', 'export', 'showCheatsheet'],
  },
];

export function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  const { bindings } = useKeymapStore();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div
        id="shortcut-help-dialog"
        className="relative w-full max-w-xl bg-[#0f0f22] border border-white/10 rounded-2xl shadow-2xl p-6 z-10 max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            id="shortcut-help-close"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {SECTIONS.map((section) => (
            <div key={section.title} className="space-y-2">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
                {section.title}
              </h3>
              {section.actions.map((action) => (
                <div
                  key={action}
                  id={`shortcut-${action}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-xs text-white/60">{ACTION_LABELS[action]}</span>
                  <kbd className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 font-mono text-[10px] text-white/80 whitespace-nowrap">
                    {formatKey(bindings[action])}
                  </kbd>
                </div>
              ))}
            </div>
          ))}
        </div>

        <p className="text-xs text-white/30 mt-5 text-center">
          Press <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-[10px]">?</kbd> to toggle this overlay
        </p>
      </div>
    </div>
  );
}
