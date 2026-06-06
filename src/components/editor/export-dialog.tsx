// src/components/editor/export-dialog.tsx
// Export dialog with progress tracking and file system API integration.

import { useState, useCallback } from 'react';
import { X, Download, AlertTriangle, CheckCircle, Loader } from 'lucide-react';
import { useEditStore } from '../../store/edit-store';
import { exportSegments, type ExportProgress } from '../../media/exporter';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const { file, segments } = useEditStore();
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    if (!file || segments.length === 0) return;

    setError(null);
    setProgress({ phase: 'preparing', progress: 0 });

    try {
      // Determine output filename
      const ext = file.name.endsWith('.mkv') ? '.mkv' : '.mp4';
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const suggestedName = `${baseName}_cut${ext}`;

      // Open file picker
      const fileHandle = await (window as typeof window & {
        showSaveFilePicker: (o: object) => Promise<FileSystemFileHandle>
      }).showSaveFilePicker({
        suggestedName,
        types: ext === '.mkv'
          ? [{ description: 'Matroska Video', accept: { 'video/x-matroska': ['.mkv'] } }]
          : [{ description: 'MP4 Video', accept: { 'video/mp4': ['.mp4'] } }],
      });

      await exportSegments(file, segments, fileHandle, (p) => {
        setProgress(p);
      });
    } catch (e: unknown) {
      if (
        e instanceof Error &&
        (e.name === 'AbortError' || e.message?.includes('abort'))
      ) {
        setProgress(null);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setProgress({ phase: 'error', progress: 0, error: msg });
    }
  }, [file, segments]);

  if (!open) return null;

  const isDone = progress?.phase === 'done';
  const isRunning = progress !== null && !isDone && progress.phase !== 'error';
  const hasError = progress?.phase === 'error' || error;

  const phaseLabel: Record<ExportProgress['phase'], string> = {
    preparing: 'Preparing…',
    exporting: `Exporting…`,
    finalizing: 'Finalizing…',
    done: 'Export complete!',
    error: 'Export failed',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={!isRunning ? onClose : undefined}
      />

      {/* Dialog */}
      <div
        id="export-dialog"
        className="relative w-full max-w-md bg-[#0f0f22] border border-white/10 rounded-2xl shadow-2xl p-6 z-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Download size={18} className="text-[#5b4fff]" />
            Export Video
          </h2>
          {!isRunning && (
            <button
              id="export-dialog-close"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Stats */}
        {!isRunning && !isDone && !hasError && (
          <div className="mb-5 space-y-2 text-sm text-white/60">
            <div className="flex justify-between">
              <span>Segments to export</span>
              <span className="text-white/80 font-mono">{segments.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Total duration</span>
              <span className="text-white/80 font-mono">
                {segments.reduce((a, s) => a + s.end - s.start, 0).toFixed(2)}s
              </span>
            </div>
            <div className="mt-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300/80 text-xs">
              <strong>Lossless mode:</strong> packets are copied without re-encoding.
              Output snaps to keyframe boundaries.
            </div>
          </div>
        )}

        {/* Progress */}
        {progress && (
          <div className="mb-5 space-y-3">
            <div className="flex items-center gap-2">
              {isDone ? (
                <CheckCircle size={16} className="text-emerald-400" />
              ) : hasError ? (
                <AlertTriangle size={16} className="text-red-400" />
              ) : (
                <Loader size={16} className="text-[#5b4fff] animate-spin" />
              )}
              <span className={`text-sm font-medium ${isDone ? 'text-emerald-400' : hasError ? 'text-red-400' : 'text-white/80'}`}>
                {phaseLabel[progress.phase]}
              </span>
              {isRunning && (
                <span className="ml-auto text-xs text-white/40 font-mono">
                  {Math.round(progress.progress * 100)}%
                </span>
              )}
            </div>

            {/* Progress bar */}
            {isRunning && (
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#5b4fff] to-[#ff4c8b] transition-all duration-200 rounded-full"
                  style={{ width: `${progress.progress * 100}%` }}
                />
              </div>
            )}

            {hasError && error && (
              <p className="text-xs text-red-400/80 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                {error}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          {!isRunning && (
            <button
              id="export-cancel-btn"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            >
              {isDone ? 'Close' : 'Cancel'}
            </button>
          )}

          {!isDone && (
            <button
              id="export-start-btn"
              onClick={handleExport}
              disabled={isRunning}
              className="px-5 py-2 rounded-xl text-sm font-medium bg-[#5b4fff] hover:bg-[#7065ff] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#5b4fff]/30"
            >
              {isRunning ? 'Exporting…' : hasError ? 'Retry' : 'Export'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
