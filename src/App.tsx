// src/App.tsx
// Main application shell.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Film,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Scissors,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CutListPanel } from "./components/editor/cut-list-panel";
import { EditorToolbar } from "./components/editor/editor-toolbar";
import { ExportDialog } from "./components/editor/export-dialog";
import { MediaPanel, useMediaItems, extractMeta } from "./components/editor/media-panel";
import type { MediaItem } from "./components/editor/media-panel";
import { PlayerPanel } from "./components/editor/player";
import { ProjectsHome } from "./components/home/projects-home";
import { ShortcutHelp } from "./components/info/shortcut-help";
import { Timeline } from "./components/timeline/timeline";
import { registerKeymap } from "./keymap/keys";
import { Player } from "./media/player";
import { probeFile } from "./media/probe";
import { useEditStore } from "./store/edit-store";
import type { TrackClip } from "./store/edit-store";
import { useKeymapStore } from "./store/keymap-store";
import type { ProjectStore } from "./store/project-store";
import { useProjectStore } from "./store/project-store";
import { saveFileToOPFS, loadFileFromOPFS } from "./lib/opfs";
import { useShallow } from "zustand/react/shallow";

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${sec.toFixed(1).padStart(4, "0")}`;
}

export default function App() {
  const { activeProjectId, closeProject, saveProjectState, activeProject } = useProjectStore();
  const currentProject = activeProject();

  // Show the home screen when no project is active
  if (!activeProjectId) {
    return <ProjectsHome />;
  }

  return (
    <Editor
      projectId={activeProjectId}
      projectName={currentProject?.name ?? ""}
      onClose={closeProject}
      saveProjectState={saveProjectState}
    />
  );
}

function Editor({
  projectId,
  projectName,
  onClose,
  saveProjectState,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
  saveProjectState: ProjectStore["saveProjectState"];
}) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Track which clip is being dragged from media panel, and whether it's over the timeline
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [isTimelineDragOver, setIsTimelineDragOver] = useState(false);
  // Collapsible panels
  const [mediaPanelOpen, setMediaPanelOpen] = useState(true);
  const [cutListOpen, setCutListOpen] = useState(true);

  const {
    items: mediaItems,
    setItems: setMediaItems,
    addFiles: addMediaFiles,
    removeItem: removeMediaItem,
  } = useMediaItems(projectId);

  const loadedFileRef = useRef<File | null>(null);
  const [probeInfo, setProbeInfo] = useState<{
    fps: number;
    width: number;
    height: number;
    formatName: string;
    videoCodecString: string | null;
    keyframeInterval: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<Player | null>(null);
  const autoPlayNextRef = useRef(false);

  const { file, duration, segments, keyframeTimes, fps, clips, activeClipId, initFile, appendClip } =
    useEditStore(
      useShallow((s) => ({
        file: s.file,
        duration: s.duration,
        segments: s.segments,
        keyframeTimes: s.keyframeTimes,
        fps: s.fps,
        clips: s.clips,
        activeClipId: s.activeClipId,
        initFile: s.initFile,
        appendClip: s.appendClip,
      })),
    );

  // Auto-save edit state and media items to project store
  useEffect(() => {
    if (!projectId || loading) return;

    const handler = setTimeout(() => {
      const savedClips = clips.map((clip) => ({
        id: clip.id,
        fileName: clip.file.name,
        fileSize: clip.file.size,
        fileType: clip.file.type,
        duration: clip.duration,
        keyframeTimes: clip.keyframeTimes,
        fps: clip.fps,
        segments: clip.segments,
        history: clip.history,
        historyIndex: clip.historyIndex,
        color: clip.color,
      }));

      const savedMediaItems = mediaItems.map((item) => ({
        id: item.id,
        name: item.name,
        size: item.file.size,
        type: item.file.type,
        duration: item.duration,
      }));

      saveProjectState(projectId, {
        segments,
        duration,
        keyframeTimes,
        fps,
        segmentCount: segments.length,
        mediaFileNames: file ? [file.name] : clips.map((c) => c.file.name),
        clips: savedClips,
        activeClipId,
        mediaItems: savedMediaItems,
      });
    }, 1000);

    return () => clearTimeout(handler);
  }, [
    projectId,
    clips,
    activeClipId,
    mediaItems,
    segments,
    duration,
    keyframeTimes,
    fps,
    file,
    loading,
    saveProjectState,
  ]);

  // Load/Restore project from OPFS on mount or projectId change
  useEffect(() => {
    if (!projectId) return;

    let active = true;

    async function restoreProject() {
      setLoading(true);
      setLoadError(null);

      // Dispose previous player
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
        setPlayer(null);
      }
      loadedFileRef.current = null;

      const projects = useProjectStore.getState().projects;
      const project = projects.find((p) => p.id === projectId);
      if (!project) {
        if (active) setLoading(false);
        return;
      }

      try {
        // 1. Restore Media Panel Items
        const restoredMediaItems: MediaItem[] = [];
        if (project.mediaItems && project.mediaItems.length > 0) {
          for (const itemMeta of project.mediaItems) {
            try {
              const file = await loadFileFromOPFS(projectId, itemMeta.id, itemMeta.name, itemMeta.type);
              restoredMediaItems.push({
                id: itemMeta.id,
                file,
                name: itemMeta.name,
                duration: itemMeta.duration,
                thumbnail: null,
              });
            } catch (err) {
              console.error(`Failed to load media file ${itemMeta.name} from OPFS:`, err);
            }
          }
        }

        // 2. Restore Timeline Clips
        const restoredClips: TrackClip[] = [];
        if (project.clips && project.clips.length > 0) {
          for (const clipMeta of project.clips) {
            try {
              const file = await loadFileFromOPFS(projectId, clipMeta.id, clipMeta.fileName, clipMeta.fileType);
              restoredClips.push({
                id: clipMeta.id,
                file,
                duration: clipMeta.duration,
                keyframeTimes: clipMeta.keyframeTimes,
                fps: clipMeta.fps,
                segments: clipMeta.segments,
                history: clipMeta.history,
                historyIndex: clipMeta.historyIndex,
                color: clipMeta.color,
              });
            } catch (err) {
              console.error(`Failed to load clip file ${clipMeta.fileName} from OPFS:`, err);
            }
          }
        }

        if (!active) return;

        // Set media panel items
        setMediaItems(restoredMediaItems);

        // Background extract thumbnails
        for (const item of restoredMediaItems) {
          extractMeta(item.file)
            .then(({ thumbnail, duration }) => {
              setMediaItems((prev) =>
                prev.map((it) => (it.id === item.id ? { ...it, thumbnail, duration } : it))
              );
            })
            .catch(() => {});
        }

        // Load timeline clips in edit store
        if (restoredClips.length > 0) {
          useEditStore.getState().loadClips(restoredClips, project.activeClipId ?? null);
          // The file useEffect will handle creating the player and setting loading to false.
        } else {
          // No clips saved, reset the edit-store
          useEditStore.getState().clearClips();
          if (active) setLoading(false);
        }
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : String(err);
          setLoadError(`Failed to load project: ${msg}`);
          setLoading(false);
        }
      }
    }

    restoreProject();

    return () => {
      active = false;
    };
  }, [projectId, setMediaItems]);

  // Recreate player when active clip's file changes (switching active clip or loading)
  useEffect(() => {
    const activeFile = file;
    if (!activeFile) {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
        setPlayer(null);
        loadedFileRef.current = null;
      }
      return;
    }

    if (
      loadedFileRef.current &&
      loadedFileRef.current.name === activeFile.name &&
      loadedFileRef.current.size === activeFile.size
    ) {
      // Same file contents (possibly different restored File object instances).
      // Update the reference but do not recreate the player.
      loadedFileRef.current = activeFile;
      return;
    }

    let active = true;
    async function switchPlayer() {
      if (!activeFile) return;
      setLoading(true);
      setLoadError(null);

      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
        setPlayer(null);
      }

      let inputToDispose: any = null;
      try {
        const probe = await probeFile(activeFile);
        if (!active) {
          probe.input.dispose();
          return;
        }
        inputToDispose = probe.input;

        // Compute keyframe interval
        const kfTimes = probe.keyframeTimes;
        const kfInterval =
          kfTimes.length >= 2
            ? (kfTimes[kfTimes.length - 1] - kfTimes[0]) / (kfTimes.length - 1)
            : 0;

        setProbeInfo({
          fps: probe.fps,
          width: probe.width,
          height: probe.height,
          formatName: probe.formatName,
          videoCodecString: probe.videoCodecString,
          keyframeInterval: kfInterval,
        });

        const input = probe.input;
        const videoTrack = await input.getPrimaryVideoTrack();
        const audioTrack = await input.getPrimaryAudioTrack();

        if (!videoTrack) throw new Error("No video track found.");

        const p = new Player(input, videoTrack, audioTrack, probe.duration);
        inputToDispose = null; // Player now owns the input and will dispose it
        playerRef.current = p;
        setPlayer(p);
        loadedFileRef.current = activeFile;

        const autoPlayTime = useEditStore.getState().autoPlayNextTime;
        if (autoPlayTime !== null) {
          useEditStore.setState({ autoPlayNextTime: null });
          await p.seekTo(autoPlayTime);
          void p.play(autoPlayTime);
        } else if (autoPlayNextRef.current) {
          autoPlayNextRef.current = false;
          await p.seekTo(0);
          void p.play();
        } else {
          const storeCurrentTime = useEditStore.getState().currentTime;
          await p.seekTo(storeCurrentTime);
        }
      } catch (err: unknown) {
        if (inputToDispose) {
          inputToDispose.dispose();
        }
        if (active) {
          const msg = err instanceof Error ? err.message : String(err);
          setLoadError(`Failed to load video: ${msg}`);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    switchPlayer();

    return () => {
      active = false;
    };
  }, [file]);

  // Listen to ended event for continuous playback
  useEffect(() => {
    if (!player) return;
    const offEnded = player.on("ended", () => {
      const { clips, activeClipId, setActiveClipId } = useEditStore.getState();
      const idx = clips.findIndex((c) => c.id === activeClipId);
      if (idx !== -1 && idx < clips.length - 1) {
        autoPlayNextRef.current = true;
        setActiveClipId(clips[idx + 1].id);
      }
    });
    return offEnded;
  }, [player]);

  // Register keyboard shortcuts
  useEffect(() => {
    const cleanup = registerKeymap({
      getEditStore: () => useEditStore.getState(),
      getKeymapStore: () => useKeymapStore.getState(),
      getPlayer: () => playerRef.current,
      openFile: () => fileInputRef.current?.click(),
      openExport: () => setExportOpen(true),
      toggleCheatsheet: () => setCheatsheetOpen((v) => !v),
    });
    return cleanup;
  }, []);

  const loadFile = useCallback(
    async (f: File) => {
      setLoading(true);
      setLoadError(null);
      try {
        const probe = await probeFile(f);
        try {
          initFile(f, probe.duration, probe.keyframeTimes, probe.fps);
          if (projectId) {
            const newActiveClipId = useEditStore.getState().activeClipId;
            if (newActiveClipId) {
              await saveFileToOPFS(projectId, newActiveClipId, f);
            }
          }
        } finally {
          probe.input.dispose();
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
        setLoading(false);
      }
    },
    [initFile, projectId],
  );

  /** Append a clip to the track (does NOT reset existing clips) */
  const appendFile = useCallback(
    async (f: File) => {
      setLoading(true);
      setLoadError(null);
      try {
        const probe = await probeFile(f);
        try {
          const newClipId = appendClip(f, probe.duration, probe.keyframeTimes, probe.fps);
          if (projectId) {
            await saveFileToOPFS(projectId, newClipId, f);
          }
        } finally {
          probe.input.dispose();
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
        setLoading(false);
      }
    },
    [appendClip, projectId],
  );

  // Global drag and drop (external files onto the app)
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      // If this is an internal clip drag, ignore at the global level
      if (e.dataTransfer.types.includes("text/plain") && !e.dataTransfer.types.includes("Files"))
        return;
      const f = e.dataTransfer.files[0];
      if (!f) return;
      // If a clip is already loaded, append; otherwise initialise
      if (clips.length > 0) {
        await appendFile(f);
      } else {
        await loadFile(f);
      }
    },
    [clips.length, loadFile, appendFile],
  );

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) await loadFile(f);
    e.target.value = "";
  };

  // Timeline drop zone: accept clips dragged from the media panel
  const handleTimelineDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsTimelineDragOver(false);

      const clipId = e.dataTransfer.getData("text/plain");
      if (clipId) {
        // Internal clip drag from media panel — append to track
        const item = mediaItems.find((it) => it.id === clipId);
        if (item) {
          setDraggingClipId(null);
          if (clips.length === 0) {
            await loadFile(item.file);
          } else {
            await appendFile(item.file);
          }
        }
      } else if (e.dataTransfer.files.length > 0) {
        // External file dropped directly on timeline — append to track
        if (clips.length === 0) {
          await loadFile(e.dataTransfer.files[0]);
        } else {
          await appendFile(e.dataTransfer.files[0]);
        }
      }
    },
    [mediaItems, clips.length, loadFile, appendFile],
  );

  const handleTimelineDragOver = (e: React.DragEvent) => {
    // Accept both internal clips and external files
    e.preventDefault();
    e.stopPropagation();
    setIsTimelineDragOver(true);
  };

  const handleTimelineDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsTimelineDragOver(false);
  };

  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col select-none"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        id="file-input"
        type="file"
        accept="video/*,.mkv,.mp4,.webm,.mov,.avi"
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-xs border-2 border-dashed border-primary pointer-events-none">
          <div className="text-center">
            <Film className="mx-auto mb-3 text-primary size-12" />
            <p className="text-xl font-semibold text-foreground">Drop video here</p>
          </div>
        </div>
      )}

      {/* Top navbar */}
      <header className="flex items-center gap-3 px-4 h-12 bg-card border-b border-border shrink-0">
        {/* Back to projects */}
        <Button
          id="btn-back-to-projects"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          title="Back to projects"
        >
          <ArrowLeft />
        </Button>

        <div className="h-4 w-px bg-border" />

        {/* Logo + project name */}
        <div className="flex items-center gap-2 mr-1">
          <Scissors className="text-primary size-4.5" />
          <span className="font-semibold text-sm tracking-tight text-foreground">
            Video<span className="text-primary">Cut</span>
          </span>
          <span className="text-muted-foreground/40 text-sm">/</span>
          <span className="text-sm text-foreground/70 font-medium truncate max-w-40">
            {projectName}
          </span>
        </div>

        {/* File info */}
        {file && (
          <>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <Film className="text-primary size-3 shrink-0" />
              <span className="truncate max-w-48 text-foreground/80">{file.name}</span>
              {probeInfo && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-muted-foreground/60 font-mono">
                    {probeInfo.width}×{probeInfo.height}
                  </span>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-muted-foreground/60 font-mono">
                    {probeInfo.fps.toFixed(0)}fps
                  </span>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-muted-foreground/60">{formatDuration(duration)}</span>
                  {probeInfo.keyframeInterval > 2 && (
                    <Badge
                      variant="warning"
                      size="sm"
                      className="gap-1"
                      title={`Keyframe interval: ${probeInfo.keyframeInterval.toFixed(1)}s — cuts may snap noticeably`}
                    >
                      <AlertTriangle className="size-3" />
                      Coarse keyframes
                    </Badge>
                  )}
                </>
              )}
            </div>
          </>
        )}

        <div className="flex-1" />

        <div className="h-4 w-px bg-border mx-1" />

        {/* Help */}
        <Button
          id="btn-cheatsheet"
          variant="ghost"
          size="icon-sm"
          onClick={() => setCheatsheetOpen(true)}
          title="Keyboard shortcuts (?)"
        >
          <HelpCircle />
        </Button>

        {/* Export */}
        {file && segments.length > 0 && (
          <Button
            id="btn-export"
            variant="default"
            size="sm"
            onClick={() => setExportOpen(true)}
            className="ml-1 shadow-lg shadow-primary/20"
            title="Export (Ctrl+E)"
          >
            <Download />
            Export
          </Button>
        )}
      </header>

      {/* Main content — always show editor layout */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Editor layout — column: top row (panels) + full-width timeline at bottom */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top row: Media panel | Player | Cut list */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left sidebar: Media panel (collapsible) */}
            <div
              className="shrink-0 flex border-r border-border bg-card/50 overflow-hidden transition-[width] duration-200 ease-in-out relative"
              style={{ width: mediaPanelOpen ? "13rem" : "0px" }}
            >
              <div className="w-52 shrink-0 h-full">
                <MediaPanel
                  items={mediaItems}
                  onAddFiles={addMediaFiles}
                  onRemoveItem={removeMediaItem}
                  onDragStart={setDraggingClipId}
                  activeItemId={draggingClipId}
                />
              </div>
            </div>

            {/* Center: Player (with panel toggle buttons) */}
            <div className="flex-1 min-w-0 p-3 relative">
              {/* Left panel toggle */}
              <button
                id="btn-toggle-media-panel"
                onClick={() => setMediaPanelOpen((v) => !v)}
                title={mediaPanelOpen ? "Collapse media panel" : "Expand media panel"}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-4 h-10 rounded-r-md bg-card border border-l-0 border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150 cursor-pointer"
              >
                {mediaPanelOpen ? (
                  <PanelLeftClose className="size-3" />
                ) : (
                  <PanelLeftOpen className="size-3" />
                )}
              </button>

              {/* Right panel toggle */}
              <button
                id="btn-toggle-cut-list"
                onClick={() => setCutListOpen((v) => !v)}
                title={cutListOpen ? "Collapse cut list" : "Expand cut list"}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-4 h-10 rounded-l-md bg-card border border-r-0 border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150 cursor-pointer"
              >
                {cutListOpen ? (
                  <PanelRightClose className="size-3" />
                ) : (
                  <PanelRightOpen className="size-3" />
                )}
              </button>

              {/* Error banner when file fails to load */}
              {loadError && !file && (
                <div className="absolute top-3 left-6 right-6 z-10 p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive-foreground text-xs flex items-center gap-2">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span className="font-semibold">Error loading file:</span> {loadError}
                </div>
              )}

              <PlayerPanel player={player} />
            </div>

            {/* Right: Cut list (collapsible) */}
            <div
              className="shrink-0 flex border-l border-border overflow-hidden transition-[width] duration-200 ease-in-out"
              style={{ width: cutListOpen ? "16rem" : "0px" }}
            >
              <div className="w-64 shrink-0 h-full">
                <CutListPanel player={player} />
              </div>
            </div>
          </div>

          {/* Toolbar above timeline */}
          <EditorToolbar />

          {/* Full-width Timeline */}
          <div
            id="timeline-container"
            className={`h-32 shrink-0 border-t transition-all duration-150 relative ${
              isTimelineDragOver
                ? "border-primary shadow-[0_-2px_12px_0] shadow-primary/20"
                : "border-border"
            }`}
            onDrop={handleTimelineDrop}
            onDragOver={handleTimelineDragOver}
            onDragLeave={handleTimelineDragLeave}
            onDragEnd={() => {
              setDraggingClipId(null);
              setIsTimelineDragOver(false);
            }}
          >
            <Timeline player={player} className="h-full" />

            {/* Drop overlay */}
            {isTimelineDragOver && (
              <div className="absolute inset-0 bg-primary/10 backdrop-blur-[1px] flex items-center justify-center pointer-events-none z-10">
                <div className="flex items-center gap-2 bg-card/90 border border-primary/40 rounded-lg px-4 py-2 shadow-lg">
                  <Film className="size-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    {clips.length === 0 ? "Drop to load clip" : "Drop to add clip"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Semi-transparent Loading Overlay (non-unmounting and non-blocking) */}
        {loading && (
          <div className="absolute inset-0 bg-background/30 backdrop-blur-[1px] flex items-center justify-center z-50 pointer-events-none">
            <div className="text-center bg-card/90 border border-border p-5 rounded-2xl shadow-xl backdrop-blur-md">
              <Spinner className="size-8 mx-auto mb-3 text-primary animate-spin" />
              <p className="text-sm text-foreground/80 font-medium">Loading video…</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">Probing keyframes…</p>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <ShortcutHelp open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />
    </div>
  );
}
