// src/components/editor/cut-list-panel.tsx
// Panel showing the list of kept segments. Click to jump.

import { Trash2, Clock } from 'lucide-react';
import { useEditStore } from '../../store/edit-store';
import type { Player } from '../../media/player';

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
    <div className="flex flex-col h-full bg-[#0d0d1f] rounded-xl border border-white/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5">
        <h3 className="text-sm font-semibold text-white/80">Cut List</h3>
        <div className="flex gap-4 mt-1 text-xs text-white/40">
          <span>
            <span className="text-emerald-400">↑ </span>
            kept {formatTime(totalKept)}
          </span>
          {totalRemoved > 0.01 && (
            <span>
              <span className="text-red-400">✂ </span>
              removed {formatTime(totalRemoved)}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {segments.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/20 text-xs">
            No segments
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {segments.map((seg, i) => {
              const dur = seg.end - seg.start;
              return (
                <li
                  key={i}
                  id={`segment-${i}`}
                  className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors group cursor-pointer"
                  onClick={() => {
                    setCurrentTime(seg.start);
                    void player?.seekTo(seg.start);
                  }}
                >
                  {/* Segment color indicator */}
                  <div className="w-1.5 h-8 rounded-full bg-[#5b4fff] flex-shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-white/70">{formatTime(seg.start)}</span>
                      <span className="text-white/20">→</span>
                      <span className="text-white/70">{formatTime(seg.end)}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock size={9} className="text-white/30" />
                      <span className="text-[10px] text-white/30 font-mono">
                        {formatTime(dur)}
                      </span>
                    </div>
                  </div>

                  {/* Delete */}
                  {segments.length > 1 && (
                    <button
                      id={`delete-segment-${i}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSegmentByIndex(i);
                      }}
                      className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400/60 hover:text-red-400 transition-all"
                      title="Remove segment"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
