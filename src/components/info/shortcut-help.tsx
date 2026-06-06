// src/components/info/shortcut-help.tsx
// Keyboard shortcut cheatsheet overlay.

import { useKeymapStore, ACTION_LABELS, type ActionName } from '../../store/keymap-store';
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogPanel } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

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
    actions: ['cutAtCursor', 'trimLeft', 'trimRight', 'deleteSelection', 'moveSegmentLeft', 'moveSegmentRight', 'undo', 'redo'],
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <DialogPanel scrollFade>
          <div className="grid grid-cols-2 gap-4">
            {SECTIONS.map((section) => (
              <div key={section.title} className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  {section.title}
                </h3>
                {section.actions.map((action) => (
                  <div
                    key={action}
                    id={`shortcut-${action}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-xs text-foreground/75">{ACTION_LABELS[action]}</span>
                    <Kbd className="font-mono text-[10px]">
                      {formatKey(bindings[action])}
                    </Kbd>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground/50 mt-6 text-center">
            Press <Kbd className="font-mono text-[10px]">?</Kbd> to toggle this overlay
          </p>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
