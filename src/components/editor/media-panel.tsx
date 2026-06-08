// src/components/editor/media-panel.tsx
// Left side panel: import videos and drag them onto the timeline.

import { Button } from "@/components/ui/button";
import { Clock, Film, Plus, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../ui/badge";
import { saveFileToOPFS, deleteClipFromOPFS } from "../../lib/opfs";
import { useEditStore } from "../../store/edit-store";

export interface MediaItem {
  id: string;
  file: File;
  name: string;
  /** duration in seconds, populated after thumbnail generation */
  duration: number | null;
  /** object URL for thumbnail canvas blob */
  thumbnail: string | null;
}

interface MediaPanelProps {
  items: MediaItem[];
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveItem: (id: string) => void;
  /** called when user drags a clip item – pass the MediaItem id */
  onDragStart: (id: string) => void;
  activeItemId: string | null;
}

function formatDur(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Extract a thumbnail + duration from a video File via an off-screen <video> element. */
export async function extractMeta(file: File): Promise<{ thumbnail: string; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    const src = URL.createObjectURL(file);
    video.src = src;

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, video.duration * 0.05);
    };

    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      const THUMB_W = 160;
      const THUMB_H = 90;
      canvas.width = THUMB_W;
      canvas.height = THUMB_H;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, THUMB_W, THUMB_H);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(src);
            if (blob) {
              resolve({ thumbnail: URL.createObjectURL(blob), duration: video.duration });
            } else {
              reject(new Error("Could not generate thumbnail blob"));
            }
          },
          "image/jpeg",
          0.7,
        );
      } else {
        URL.revokeObjectURL(src);
        reject(new Error("No 2D context"));
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error("Video load error"));
    };
  });
}

function ClipCard({
  item,
  onRemove,
  onDragStart,
  isActive,
  isInTimeline,
}: {
  item: MediaItem;
  onRemove: () => void;
  onDragStart: () => void;
  isActive: boolean;
  isInTimeline: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("text/plain", item.id);
        onDragStart();
      }}
      className={`
        group relative rounded-lg overflow-hidden border cursor-grab active:cursor-grabbing
        transition-all duration-150 select-none
        ${
          isActive
            ? "border-primary/60 shadow-md shadow-primary/20 ring-1 ring-primary/40"
            : "border-border hover:border-border/80 hover:shadow-sm"
        }
        bg-card
      `}
      title={`Drag "${item.name}" onto the timeline`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-black/60 overflow-hidden">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt={item.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film className="size-6 text-muted-foreground/40" />
          </div>
        )}

        {/* In Timeline indicator badge */}
        {isInTimeline && (
          <div className="absolute top-1 left-1 bg-emerald-600/90 text-white backdrop-blur-sm rounded px-1 py-0.5 flex items-center gap-1 shadow-sm text-[9px] font-semibold uppercase tracking-wider">
            <span>In Timeline</span>
          </div>
        )}

        {/* Duration badge */}
        {item.duration !== null && (
          <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-sm rounded px-1 py-0.5 flex items-center gap-1">
            <Clock className="size-2.5 text-white/60" />
            <span className="text-white/90 font-mono text-[10px] leading-none">
              {formatDur(item.duration)}
            </span>
          </div>
        )}

        {/* Drag hint overlay */}
        <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/8 transition-colors duration-150 flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[10px] font-semibold text-white bg-black/60 backdrop-blur-sm rounded px-2 py-0.5">
            Drag to timeline
          </span>
        </div>
      </div>

      {/* File name */}
      <div className="px-2 py-1.5 flex items-center gap-1.5 min-w-0">
        <span className="text-xs text-foreground/80 truncate flex-1 leading-tight">
          {item.name}
        </span>
        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 rounded p-0.5 hover:bg-destructive/15 text-muted-foreground hover:text-destructive"
          title="Remove from panel"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}

export function MediaPanel({
  items,
  onAddFiles,
  onRemoveItem,
  onDragStart,
  activeItemId,
}: MediaPanelProps) {
  const storeClips = useEditStore((state) => state.clips);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPanelDragOver, setIsPanelDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handlePanelDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsPanelDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) onAddFiles(files);
    },
    [onAddFiles],
  );

  const handlePanelDragOver = (e: React.DragEvent) => {
    // Only show panel-drop if it's an external file (has Files type), not an internal clip drag
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handlePanelDragEnter = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current++;
      setIsPanelDragOver(true);
    }
  };

  const handlePanelDragLeave = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsPanelDragOver(false);
      }
    }
  };

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      onDrop={handlePanelDrop}
      onDragOver={handlePanelDragOver}
      onDragEnter={handlePanelDragEnter}
      onDragLeave={handlePanelDragLeave}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mkv,.mp4,.webm,.mov,.avi"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onAddFiles(e.target.files);
          }
          e.target.value = "";
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Film className="size-4 text-primary" />
          <span className="text-sm font-semibold">Media</span>
          {items.length > 0 && <Badge variant="outline">{items.length}</Badge>}
        </div>
        <Button
          id="btn-media-add"
          variant="outline"
          size="icon-sm"
          onClick={() => fileInputRef.current?.click()}
          title="Add video files"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 relative">
        {items.length === 0 ? (
          /* Empty state / drop zone */
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`
              flex flex-col items-center justify-center h-full min-h-32 rounded-xl border-2 border-dashed
              cursor-pointer transition-all duration-200 gap-3 px-3 text-center
              ${
                isPanelDragOver
                  ? "border-primary bg-primary/8 scale-[0.98]"
                  : "border-border/50 hover:border-border hover:bg-muted/30"
              }
            `}
          >
            <div
              className={`
              rounded-xl p-3 transition-colors duration-200
              ${isPanelDragOver ? "bg-primary/15" : "bg-muted/50"}
            `}
            >
              <Upload
                className={`size-5 transition-colors ${isPanelDragOver ? "text-primary" : "text-muted-foreground/50"}`}
              />
            </div>
            <div>
              <p
                className={`text-xs font-medium transition-colors ${isPanelDragOver ? "text-primary" : "text-muted-foreground/70"}`}
              >
                {isPanelDragOver ? "Release to add" : "Add videos"}
              </p>
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">click or drag here</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Drop zone overlay when dragging files over */}
            {isPanelDragOver && (
              <div className="absolute inset-2 z-10 rounded-xl border-2 border-dashed border-primary bg-primary/10 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Upload className="size-6 text-primary mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-primary">Drop to add</p>
                </div>
              </div>
            )}

            {items.map((item) => {
              const isInTimeline = storeClips.some(
                (c) => c.file.name === item.file.name && c.file.size === item.file.size
              );
              return (
                <ClipCard
                  key={item.id}
                  item={item}
                  isActive={item.id === activeItemId}
                  isInTimeline={isInTimeline}
                  onRemove={() => onRemoveItem(item.id)}
                  onDragStart={() => onDragStart(item.id)}
                />
              );
            })}

            {/* Add more button at bottom */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 rounded-lg border border-dashed border-border/50 hover:border-border text-xs text-muted-foreground/50 hover:text-muted-foreground transition-all duration-150 flex items-center justify-center gap-1.5"
            >
              <Plus className="size-3" />
              Add more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Hook to manage media panel items with thumbnail extraction */
export function useMediaItems(projectId: string | null) {
  const [items, setItems] = useState<MediaItem[]>([]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    // Insert immediately with null thumbnail, then populate async
    const newItems: MediaItem[] = arr.map((f) => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
      file: f,
      name: f.name,
      duration: null,
      thumbnail: null,
    }));

    setItems((prev) => [...prev, ...newItems]);

    if (projectId) {
      for (const item of newItems) {
        saveFileToOPFS(projectId, item.id, item.file).catch((err) => {
          console.error(`Failed to save media item ${item.name} to OPFS:`, err);
        });
      }
    }

    // Extract metas in background
    for (const item of newItems) {
      extractMeta(item.file)
        .then(({ thumbnail, duration }) => {
          setItems((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, thumbnail, duration } : it)),
          );
        })
        .catch(() => {
          // Leave as null, video might still work
        });
    }
  }, [projectId]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((it) => it.id === id);
      if (item?.thumbnail) URL.revokeObjectURL(item.thumbnail);
      return prev.filter((it) => it.id !== id);
    });
    if (projectId) {
      deleteClipFromOPFS(projectId, id).catch((err) => {
        console.error(`Failed to delete media item ${id} from OPFS:`, err);
      });
    }
  }, [projectId]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      setItems((prev) => {
        prev.forEach((it) => {
          if (it.thumbnail) URL.revokeObjectURL(it.thumbnail);
        });
        return [];
      });
    };
  }, []);

  return { items, setItems, addFiles, removeItem };
}
