// src/App.tsx
// Main application shell.

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Scissors, Download, HelpCircle, FolderOpen, RotateCcw, RotateCw,
  Slash, ChevronLeft, ChevronRight, Film, AlertTriangle,
} from 'lucide-react';
import { Timeline } from './components/timeline/timeline';
import { PlayerPanel } from './components/editor/player';
import { CutListPanel } from './components/editor/cut-list-panel';
import { ExportDialog } from './components/editor/export-dialog';
import { ShortcutHelp } from './components/info/shortcut-help';
import { probeFile } from './media/probe';
import { Player } from './media/player';
import { useEditStore } from './store/edit-store';
import { useKeymapStore } from './store/keymap-store';
import { registerKeymap } from './keymap/keys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`;
}

export default function App() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
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

  const {
    file,
    duration,
    segments,
    canUndo,
    canRedo,
    undo,
    redo,
    cutAtCursor,
    trimLeft,
    trimRight,
    deleteSelection,
    selectionStart,
    initFile,
  } = useEditStore();

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

  const loadFile = useCallback(async (f: File) => {
    setLoading(true);
    setLoadError(null);

    // Dispose previous player
    if (playerRef.current) {
      playerRef.current.dispose();
      playerRef.current = null;
      setPlayer(null);
    }

    try {
      const probe = await probeFile(f);

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

      initFile(f, probe.duration, probe.keyframeTimes, probe.fps);

      // Create player
      const input = probe.input;
      const videoTrack = await input.getPrimaryVideoTrack();
      const audioTrack = await input.getPrimaryAudioTrack();

      if (!videoTrack) throw new Error('No video track found.');

      const p = new Player(input, videoTrack, audioTrack, probe.duration);
      playerRef.current = p;
      setPlayer(p);

      // Seek to first frame
      await p.seekTo(0);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [initFile]);

  // Drag and drop
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) await loadFile(f);
    },
    [loadFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) await loadFile(f);
    e.target.value = '';
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
      <header className="flex items-center gap-3 px-4 h-12 bg-card border-b border-border flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-3">
          <Scissors className="text-primary size-4.5" />
          <span className="font-semibold text-sm tracking-tight text-foreground">
            Video<span className="text-primary">Cut</span>
          </span>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Open file */}
        <Button
          id="btn-open-file"
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          title="Open file (Ctrl+O)"
        >
          <FolderOpen />
          Open
        </Button>

        {/* File info */}
        {file && (
          <>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <Film className="text-primary size-3 flex-shrink-0" />
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
                  <span className="text-muted-foreground/60">
                    {formatDuration(duration)}
                  </span>
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

        {/* Edit actions */}
        {file && (
          <div className="flex items-center gap-1">
            <Button
              id="btn-cut"
              variant="ghost"
              size="sm"
              onClick={() => cutAtCursor()}
              title="Cut at cursor (S)"
            >
              <Scissors />
              Cut
            </Button>

            <Button
              id="btn-trim-left"
              variant="ghost"
              size="sm"
              onClick={() => trimLeft()}
              title="Trim left (A)"
            >
              <ChevronLeft />
              Trim L
            </Button>

            <Button
              id="btn-trim-right"
              variant="ghost"
              size="sm"
              onClick={() => trimRight()}
              title="Trim right (D)"
            >
              <ChevronRight />
              Trim R
            </Button>

            {(selectionStart !== null) && (
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
        )}

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

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!file && !loading ? (
          // Drop zone / welcome
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
                <Film className="text-primary size-9" />
              </div>
              <h1 className="text-2xl font-bold mb-2 text-foreground">
                Video<span className="text-primary">Cut</span>
              </h1>
              <p className="text-sm text-muted-foreground mb-6">
                Fast, keyboard-driven lossless trimmer.
                <br />
                No re-encoding. Snaps to keyframes.
              </p>

              {loadError && (
                <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive-foreground text-xs text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="size-3.5" />
                    <strong>Error loading file</strong>
                  </div>
                  {loadError}
                </div>
              )}

              <Button
                id="btn-open-file-welcome"
                variant="default"
                size="lg"
                onClick={() => fileInputRef.current?.click()}
                className="w-full justify-center mb-3 shadow-lg shadow-primary/20"
              >
                <FolderOpen />
                Open Video File
              </Button>

              <p className="text-xs text-muted-foreground/50">
                or drag & drop a video file here
              </p>

              <div className="mt-6 grid grid-cols-3 gap-2">
                {['MKV', 'MP4', 'WebM', 'MOV', '60fps', 'H.264'].map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="justify-center py-1"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Spinner className="size-10 mx-auto mb-4 text-primary" />
              <p className="text-sm text-muted-foreground">Loading video…</p>
              <p className="text-xs text-muted-foreground/50 mt-1">Probing keyframes…</p>
            </div>
          </div>
        ) : (
          // Editor layout
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Player */}
            <div className="flex-1 min-w-0 flex flex-col p-3 gap-3">
              <div className="flex-1 min-h-0">
                <PlayerPanel player={player} />
              </div>

              {/* Timeline */}
              <div
                id="timeline-container"
                className="h-32 rounded-xl overflow-hidden border border-border"
              >
                <Timeline player={player} className="h-full" />
              </div>
            </div>

            {/* Right: Cut list */}
            <div className="w-64 flex-shrink-0 p-3 pl-0">
              <CutListPanel player={player} />
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
