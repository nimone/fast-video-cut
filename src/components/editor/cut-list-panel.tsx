import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowDown,
  ArrowRightIcon,
  ArrowUp,
  CheckIcon,
  Clock,
  ScissorsIcon,
  Trash2,
} from "lucide-react";
import type { Player } from "../../media/player";
import { useEditStore } from "../../store/edit-store";
import { useShallow } from "zustand/react/shallow";

interface CutListPanelProps {
  player: Player | null;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
}

export function CutListPanel({ player }: CutListPanelProps) {
  const {
    segments,
    selectedSegmentIndex,
    setSelectedSegmentIndex,
    deleteSegmentByIndex,
    moveSegment,
    setCurrentTime,
    duration,
  } = useEditStore(
    useShallow((s) => ({
      segments: s.segments,
      selectedSegmentIndex: s.selectedSegmentIndex,
      setSelectedSegmentIndex: s.setSelectedSegmentIndex,
      deleteSegmentByIndex: s.deleteSegmentByIndex,
      moveSegment: s.moveSegment,
      setCurrentTime: s.setCurrentTime,
      duration: s.duration,
    })),
  );

  const totalKept = segments.reduce((acc, s) => acc + (s.end - s.start), 0);
  const totalRemoved = duration - totalKept;

  return (
    <Card className="flex flex-col h-full overflow-hidden border-0 rounded-none!">
      <CardHeader className="flex justify-between items-center border-0 px-3 py-2! border-b">
        <CardTitle className="text-sm font-semibold">Cut List</CardTitle>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span className="flex gap-1 items-center">
            <CheckIcon className="size-3" />
            {formatTime(totalKept)}
          </span>
          {totalRemoved > 0.01 && (
            <span className="flex gap-1 items-center">
              <ScissorsIcon className="size-3" />
              {formatTime(totalRemoved)}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden">
        {segments.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/30 text-xs">
            No segments
          </div>
        ) : (
          <ScrollArea className="h-full">
            <ul className="divide-y divide-border">
              {segments.map((seg, i) => {
                const dur = seg.end - seg.start;
                const isSelected = selectedSegmentIndex === i;
                return (
                  <li
                    key={i}
                    id={`segment-${i}`}
                    className={`flex items-center gap-2 p-2 hover:bg-accent/50 transition-colors group cursor-pointer ${
                      isSelected
                        ? "bg-primary/10 border-l-2 border-l-primary"
                        : "border-l-2 border-l-transparent"
                    }`}
                    onClick={() => {
                      setCurrentTime(seg.start);
                      void player?.seekTo(seg.start);
                      setSelectedSegmentIndex(i);
                    }}
                  >
                    {/* Segment color indicator */}
                    <div
                      className={`w-1 h-8 rounded-full shrink-0 ${isSelected ? "bg-amber-500" : "bg-primary"}`}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-xs font-mono">
                        <span className="text-foreground/80">{formatTime(seg.start)}</span>
                        <span className="text-muted-foreground">
                          <ArrowRightIcon className="size-3" />
                        </span>
                        <span className="text-foreground/80">{formatTime(seg.end)}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="size-3 text-muted-foreground/60" />
                        <span className="text-[10px] text-muted-foreground/60 font-mono">
                          {formatTime(dur)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 data-[selected=true]:opacity-100 transition-all"
                      data-selected={isSelected}
                    >
                      {i > 0 && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveSegment(i, "left");
                          }}
                          className="text-muted-foreground/65 hover:text-primary transition-all"
                          title="Move up"
                        >
                          <ArrowUp className="size-3" />
                        </Button>
                      )}
                      {i < segments.length - 1 && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveSegment(i, "right");
                          }}
                          className="text-muted-foreground/65 hover:text-primary transition-all"
                          title="Move down"
                        >
                          <ArrowDown className="size-3" />
                        </Button>
                      )}
                      {segments.length > 1 && (
                        <Button
                          id={`delete-segment-${i}`}
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSegmentByIndex(i);
                          }}
                          className="text-muted-foreground/65 hover:text-destructive transition-all"
                          title="Remove segment"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
