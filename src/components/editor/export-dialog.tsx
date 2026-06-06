// src/components/editor/export-dialog.tsx
// Export dialog with progress tracking and file system API integration.

import { useState, useCallback } from 'react';
import { Download, AlertTriangle, CheckCircle } from 'lucide-react';
import { useEditStore } from '../../store/edit-store';
import { exportSegments, type ExportProgress } from '../../media/exporter';
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogPanel, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

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
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isRunning) onClose(); }}>
      <DialogPopup showCloseButton={!isRunning}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="size-4.5 text-primary" />
            Export Video
          </DialogTitle>
        </DialogHeader>

        <DialogPanel>
          {/* Stats */}
          {!isRunning && !isDone && !hasError && (
            <div className="space-y-4">
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Segments to export</span>
                  <span className="text-foreground font-mono">{segments.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total duration</span>
                  <span className="text-foreground font-mono">
                    {segments.reduce((a, s) => a + s.end - s.start, 0).toFixed(2)}s
                  </span>
                </div>
              </div>
              <Alert variant="info">
                <AlertDescription>
                  <strong>Lossless mode:</strong> packets are copied without re-encoding.
                  Output snaps to keyframe boundaries.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {isDone ? (
                  <CheckCircle className="size-4.5 text-success" />
                ) : hasError ? (
                  <AlertTriangle className="size-4.5 text-destructive" />
                ) : (
                  <Spinner className="size-4.5 text-primary" />
                )}
                <span className={`text-sm font-medium ${isDone ? 'text-success' : hasError ? 'text-destructive' : 'text-foreground/80'}`}>
                  {phaseLabel[progress.phase]}
                </span>
                {isRunning && (
                  <span className="ml-auto text-xs text-muted-foreground font-mono">
                    {Math.round(progress.progress * 100)}%
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {isRunning && (
                <Progress value={progress.progress * 100} />
              )}

              {hasError && error && (
                <Alert variant="error" className="mt-3">
                  <AlertTitle>Error details</AlertTitle>
                  <AlertDescription>
                    {error}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </DialogPanel>

        <DialogFooter variant="bare">
          {!isRunning && (
            <Button
              id="export-cancel-btn"
              variant="ghost"
              onClick={onClose}
            >
              {isDone ? 'Close' : 'Cancel'}
            </Button>
          )}

          {!isDone && (
            <Button
              id="export-start-btn"
              onClick={handleExport}
              disabled={isRunning}
              variant={hasError ? "destructive" : "default"}
            >
              {isRunning ? 'Exporting…' : hasError ? 'Retry' : 'Export'}
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
