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
    currentTime,
    canUndo,
    canRedo,
    undo,
    redo,
    cutAtCursor,
    trimLeft,
    trimRight,
    deleteSelection,
    selectionStart,
    selectionEnd,
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
      className="min-h-screen bg-[#07070f] text-white flex flex-col select-none"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#5b4fff]/20 backdrop-blur-sm border-2 border-dashed border-[#5b4fff] pointer-events-none">
          <div className="text-center">
            <Film size={48} className="mx-auto mb-3 text-[#5b4fff]" />
            <p className="text-xl font-semibold text-white">Drop video here</p>
          </div>
        </div>
      )}

      {/* Top navbar */}
      <header className="flex items-center gap-3 px-4 h-12 bg-[#0a0a16] border-b border-white/5 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-3">
          <Scissors size={18} className="text-[#5b4fff]" />
          <span className="font-semibold text-sm tracking-tight text-white">
            Video<span className="text-[#5b4fff]">Cut</span>
          </span>
        </div>

        <div className="h-4 w-px bg-white/10" />

        {/* Open file */}
        <button
          id="btn-open-file"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          title="Open file (Ctrl+O)"
        >
          <FolderOpen size={13} />
          Open
        </button>

        {/* File info */}
        {file && (
          <>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-2 text-xs text-white/40 min-w-0">
              <Film size={12} className="text-[#5b4fff] flex-shrink-0" />
              <span className="truncate max-w-48 text-white/60">{file.name}</span>
              {probeInfo && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="text-white/30 font-mono">
                    {probeInfo.width}×{probeInfo.height}
                  </span>
                  <span className="text-white/20">·</span>
                  <span className="text-white/30 font-mono">
                    {probeInfo.fps.toFixed(0)}fps
                  </span>
                  <span className="text-white/20">·</span>
                  <span className="text-white/30">
                    {formatDuration(duration)}
                  </span>
                  {probeInfo.keyframeInterval > 2 && (
                    <div
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400/80 text-[10px]"
                      title={`Keyframe interval: ${probeInfo.keyframeInterval.toFixed(1)}s — cuts may snap noticeably`}
                    >
                      <AlertTriangle size={9} />
                      Coarse keyframes
                    </div>
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
            <button
              id="btn-cut"
              onClick={cutAtCursor}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              title="Cut at cursor (C)"
            >
              <Scissors size={12} />
              Cut
            </button>

            <button
              id="btn-trim-left"
              onClick={trimLeft}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              title="Trim left (Q)"
            >
              <ChevronLeft size={12} />
              Trim L
            </button>

            <button
              id="btn-trim-right"
              onClick={trimRight}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              title="Trim right (W)"
            >
              <ChevronRight size={12} />
              Trim R
            </button>

            {(selectionStart !== null) && (
              <button
                id="btn-delete-selection"
                onClick={deleteSelection}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Delete selection (Del)"
              >
                <Slash size={12} />
                Delete
              </button>
            )}

            <div className="h-4 w-px bg-white/10 mx-1" />

            <button
              id="btn-undo"
              onClick={undo}
              disabled={!canUndo()}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <RotateCcw size={14} />
            </button>

            <button
              id="btn-redo"
              onClick={redo}
              disabled={!canRedo()}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              title="Redo (Ctrl+Shift+Z)"
            >
              <RotateCw size={14} />
            </button>
          </div>
        )}

        <div className="h-4 w-px bg-white/10 mx-1" />

        {/* Help */}
        <button
          id="btn-cheatsheet"
          onClick={() => setCheatsheetOpen(true)}
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          title="Keyboard shortcuts (?)"
        >
          <HelpCircle size={15} />
        </button>

        {/* Export */}
        {file && segments.length > 0 && (
          <button
            id="btn-export"
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-medium bg-[#5b4fff] hover:bg-[#7065ff] text-white transition-colors shadow-lg shadow-[#5b4fff]/30 ml-1"
            title="Export (Ctrl+E)"
          >
            <Download size={13} />
            Export
          </button>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!file && !loading ? (
          // Drop zone / welcome
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="w-20 h-20 rounded-2xl bg-[#5b4fff]/10 border border-[#5b4fff]/20 flex items-center justify-center mx-auto mb-6">
                <Film size={36} className="text-[#5b4fff]" />
              </div>
              <h1 className="text-2xl font-bold mb-2 text-white">
                Video<span className="text-[#5b4fff]">Cut</span>
              </h1>
              <p className="text-sm text-white/40 mb-6">
                Fast, keyboard-driven lossless trimmer.
                <br />
                No re-encoding. Snaps to keyframes.
              </p>

              {loadError && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={12} />
                    <strong>Error loading file</strong>
                  </div>
                  {loadError}
                </div>
              )}

              <button
                id="btn-open-file-welcome"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#5b4fff] hover:bg-[#7065ff] text-white font-medium transition-colors shadow-lg shadow-[#5b4fff]/30 mb-3"
              >
                <FolderOpen size={16} />
                Open Video File
              </button>

              <p className="text-xs text-white/25">
                or drag & drop a video file here
              </p>

              <div className="mt-6 grid grid-cols-3 gap-2 text-xs text-white/30">
                {['MKV', 'MP4', 'WebM', 'MOV', '60fps', 'H.264'].map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 rounded-lg bg-white/5 border border-white/5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-[#5b4fff] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-white/50">Loading video…</p>
              <p className="text-xs text-white/25 mt-1">Probing keyframes…</p>
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
                className="h-32 rounded-xl overflow-hidden border border-white/5"
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
