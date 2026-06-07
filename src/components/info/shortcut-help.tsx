// src/components/info/shortcut-help.tsx
// Keyboard shortcut cheatsheet + remapping UI.

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { AlertCircle, Keyboard, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTION_LABELS,
  DEFAULT_BINDINGS,
  useKeymapStore,
  type ActionName,
} from "../../store/keymap-store";

/* ── Key display helper ───────────────────────────────────────────── */

function formatKey(key: string): string {
  return key
    .replace("$mod", "⌘")
    .replace("Shift+/", "?")
    .replace("Shift", "⇧")
    .replace("ArrowLeft", "←")
    .replace("ArrowRight", "→")
    .replace("ArrowUp", "↑")
    .replace("ArrowDown", "↓")
    .replace("Space", "Space")
    .replace("Delete", "Del");
}

function splitBinding(formatted: string): string[] {
  if (formatted === "+") return ["+"];
  if (formatted.endsWith("++")) {
    return [...formatted.slice(0, -2).split("+"), "+"];
  }
  return formatted.split("+");
}

/** Convert a raw KeyboardEvent into a tinykeys-compatible binding string. */
function eventToBinding(e: KeyboardEvent): string | null {
  const ignore = ["Control", "Shift", "Alt", "Meta", "CapsLock", "Tab", "Escape"];
  if (ignore.includes(e.key)) return null;

  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("$mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  // Normalise the key
  let k = e.key;
  if (k === " ") k = "Space";

  parts.push(k);
  return parts.join("+");
}

/* ── Sections ─────────────────────────────────────────────────────── */

const SECTIONS: Array<{ title: string; actions: ActionName[] }> = [
  {
    title: "Playback",
    actions: [
      "playPause",
      "frameStepBack",
      "frameStepForward",
      "bigJumpBack",
      "bigJumpForward",
      "speedDown",
      "speedUp",
    ],
  },
  {
    title: "Editing",
    actions: [
      "cutAtCursor",
      "trimLeft",
      "trimRight",
      "deleteSelection",
      "moveSegmentLeft",
      "moveSegmentRight",
      "undo",
      "redo",
    ],
  },
  {
    title: "Navigation",
    actions: ["prevCut", "nextCut", "zoomIn", "zoomOut"],
  },
  {
    title: "File",
    actions: ["openFile", "export", "showCheatsheet"],
  },
];

/* ── Capture row ──────────────────────────────────────────────────── */

function ShortcutRow({
  action,
  binding,
  isConflict,
  onCapture,
  onReset,
  capturing,
  onStartCapture,
  onCancelCapture,
}: {
  action: ActionName;
  binding: string;
  isConflict: boolean;
  onCapture: (action: ActionName, key: string) => void;
  onReset: (action: ActionName) => void;
  capturing: boolean;
  onStartCapture: () => void;
  onCancelCapture: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const isDefault = binding === DEFAULT_BINDINGS[action];

  useEffect(() => {
    if (!capturing) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        onCancelCapture();
        return;
      }
      const b = eventToBinding(e);
      if (b) onCapture(action, b);
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing, action, onCapture, onCancelCapture]);

  return (
    <div
      className={`flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg transition-colors ${isConflict ? "bg-destructive/8" : "hover:bg-muted/40"}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isConflict && <AlertCircle className="size-3 text-destructive flex-shrink-0" />}
        <span className="text-xs text-foreground/75 truncate">{ACTION_LABELS[action]}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Reset to default */}
        {!isDefault && (
          <button
            className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors"
            onClick={() => onReset(action)}
            title="Reset to default"
          >
            <RotateCcw className="size-3" />
          </button>
        )}
        {/* Capture button / key display */}
        {capturing ? (
          <button
            ref={btnRef}
            onClick={onCancelCapture}
            className="font-mono text-[10px] px-2 py-0.5 rounded border border-primary bg-primary/10 text-primary animate-pulse min-w-[72px] text-center cursor-pointer"
          >
            Press key…
          </button>
        ) : (
          <button
            ref={btnRef}
            onClick={onStartCapture}
            title="Click to remap"
            className={`group/kbd relative cursor-pointer rounded transition-opacity ${
              isConflict ? "opacity-70 hover:opacity-100" : "hover:opacity-80"
            }`}
          >
            <KbdGroup>
              {splitBinding(formatKey(binding)).map((part) => (
                <Kbd
                  className={`font-mono pointer-events-none ${
                    isConflict
                      ? "bg-destructive/15 text-destructive/80 border border-destructive/30"
                      : ""
                  }`}
                >
                  {part}
                </Kbd>
              ))}
            </KbdGroup>
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Main dialog ──────────────────────────────────────────────────── */

interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  const { bindings, setBinding, resetBinding, resetAll } = useKeymapStore();
  const [capturingAction, setCapturingAction] = useState<ActionName | null>(null);

  // Close capturing when dialog closes
  useEffect(() => {
    if (!open) setCapturingAction(null);
  }, [open]);

  // Detect conflicts: same key bound to multiple actions
  const conflicts = useCallback((): Set<ActionName> => {
    const seen = new Map<string, ActionName>();
    const conflicted = new Set<ActionName>();
    for (const [action, key] of Object.entries(bindings) as [ActionName, string][]) {
      if (seen.has(key)) {
        conflicted.add(action);
        conflicted.add(seen.get(key)!);
      } else {
        seen.set(key, action);
      }
    }
    return conflicted;
  }, [bindings]);

  const conflictSet = conflicts();

  const handleCapture = useCallback(
    (action: ActionName, key: string) => {
      setBinding(action, key);
      setCapturingAction(null);
    },
    [setBinding],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setCapturingAction(null);
          onClose();
        }
      }}
    >
      <DialogPopup className="max-w-2xl" showCloseButton>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Keyboard className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle>Keyboard Shortcuts</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Click any shortcut to remap it. Press Escape to cancel.
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogPanel scrollFade>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0">
            {SECTIONS.map((section) => (
              <div key={section.title} className="mb-4">
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-2">
                  {section.title}
                </h3>
                <div className="space-y-0.5">
                  {section.actions.map((action) => (
                    <ShortcutRow
                      key={action}
                      action={action}
                      binding={bindings[action]}
                      isConflict={conflictSet.has(action)}
                      capturing={capturingAction === action}
                      onStartCapture={() => setCapturingAction(action)}
                      onCancelCapture={() => setCapturingAction(null)}
                      onCapture={handleCapture}
                      onReset={resetBinding}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {conflictSet.size > 0 && (
            <div className="mt-2 p-2.5 rounded-lg bg-destructive/8 border border-destructive/20 flex items-center gap-2">
              <AlertCircle className="size-3.5 text-destructive flex-shrink-0" />
              <p className="text-xs text-destructive/80">
                Some shortcuts conflict. Only the first binding will fire.
              </p>
            </div>
          )}
        </DialogPanel>

        <DialogFooter variant="default">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetAll();
              setCapturingAction(null);
            }}
            className="mr-auto"
          >
            <RotateCcw className="size-3.5" />
            Reset all to defaults
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setCapturingAction(null);
              onClose();
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
