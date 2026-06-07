import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  RotateCw,
  Scissors,
  Slash,
} from "lucide-react";
import { useEditStore } from "../../store/edit-store";

export function EditorToolbar() {
  const {
    file,
    canUndo,
    canRedo,
    undo,
    redo,
    cutAtCursor,
    trimLeft,
    trimRight,
    deleteSelection,
    selectionStart,
  } = useEditStore();

  return (
    <div className="flex items-center gap-1 px-3 h-9 shrink-0 border-t border-border bg-card/60">
      <Button
        id="btn-cut"
        variant="secondary"
        size="sm"
        onClick={() => cutAtCursor()}
        disabled={!file}
        title="Cut at cursor (S)"
      >
        <Scissors />
        Cut
      </Button>

      <Button
        id="btn-trim-left"
        variant="secondary"
        size="sm"
        onClick={() => trimLeft()}
        disabled={!file}
        title="Trim left (A)"
      >
        <ChevronLeft />
        Trim L
      </Button>

      <Button
        id="btn-trim-right"
        variant="secondary"
        size="sm"
        onClick={() => trimRight()}
        disabled={!file}
        title="Trim right (D)"
      >
        <ChevronRight />
        Trim R
      </Button>

      {selectionStart !== null && (
        <Button
          id="btn-delete-selection"
          variant="destructive-outline"
          size="sm"
          onClick={deleteSelection}
          title="Delete selection (Del)"
        >
          <Slash />
          Delete
        </Button>
      )}

      <div className="h-4 w-px bg-border mx-1" />

      <Button
        id="btn-undo"
        variant="ghost"
        size="icon-sm"
        onClick={undo}
        disabled={!canUndo()}
        title="Undo (Ctrl+Z)"
      >
        <RotateCcw />
      </Button>

      <Button
        id="btn-redo"
        variant="ghost"
        size="icon-sm"
        onClick={redo}
        disabled={!canRedo()}
        title="Redo (Ctrl+Shift+Z)"
      >
        <RotateCw />
      </Button>
    </div>
  );
}
