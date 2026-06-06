// src/components/editor/cut-list-panel.tsx
// Panel showing the list of kept segments. Click to jump.

import { Trash2, Clock } from 'lucide-react';
import { useEditStore } from '../../store/edit-store';
import type { Player } from '../../media/player';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CutListPanelProps {
  player: Player | null;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}

export function CutListPanel({ player }: CutListPanelProps) {
  const { segments, deleteSegmentByIndex, setCurrentTime, duration } = useEditStore();

  const totalKept = segments.reduce((acc, s) => acc + (s.end - s.start), 0);
  const totalRemoved = duration - totalKept;

  return (
    <Card className="flex flex-col h-full overflow-hidden border border-border">
      <CardHeader className="border-b border-border p-4">
        <CardTitle className="text-sm font-semibold">Cut List</CardTitle>
        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
          <span>
            <span className="text-success">↑ </span>
            kept {formatTime(totalKept)}
          </span>
          {totalRemoved > 0.01 && (
            <span>
              <span className="text-destructive">✂ </span>
              removed {formatTime(totalRemoved)}
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
                return (
                  <li
                    key={i}
                    id={`segment-${i}`}
                    className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/50 transition-colors group cursor-pointer"
                    onClick={() => {
                      setCurrentTime(seg.start);
                      void player?.seekTo(seg.start);
                    }}
                  >
                    {/* Segment color indicator */}
                    <div className="w-1.5 h-8 rounded-full bg-primary flex-shrink-0" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-foreground/80">{formatTime(seg.start)}</span>
                        <span className="text-muted-foreground/30">→</span>
                        <span className="text-foreground/80">{formatTime(seg.end)}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="size-3 text-muted-foreground/50" />
                        <span className="text-[10px] text-muted-foreground/50 font-mono">
                          {formatTime(dur)}
                        </span>
                      </div>
                    </div>

                    {/* Delete */}
                    {segments.length > 1 && (
                      <Button
                        id={`delete-segment-${i}`}
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSegmentByIndex(i);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground/65 hover:text-destructive transition-all"
                        title="Remove segment"
                      >
                        <Trash2 />
                      </Button>
                    )}
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
