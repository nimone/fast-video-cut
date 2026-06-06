// src/components/timeline/timeline-input.ts
// Mouse/touch/wheel interaction for the timeline canvas.

export interface TimelineInputOptions {
  canvas: HTMLCanvasElement;
  getViewRange: () => { viewStart: number; viewEnd: number };
  setViewRange: (start: number, end: number) => void;
  getDuration: () => number;
  onHover: (time: number | null, isDragging: boolean) => void;
  onSeek: (time: number) => void;
  onSelectionChange: (start: number | null, end: number | null) => void;
}

export function attachTimelineInput(opts: TimelineInputOptions): () => void {
  const {
    canvas,
    getViewRange,
    setViewRange,
    getDuration,
    onHover,
    onSeek,
    onSelectionChange,
  } = opts;

  function xToTime(clientX: number): number {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const { viewStart, viewEnd } = getViewRange();
    return viewStart + x * (viewEnd - viewStart);
  }

  let isDragging = false;
  let dragStartTime: number | null = null;
  let dragMode: 'seek' | 'select' = 'seek';

  function onMouseMove(e: MouseEvent) {
    const time = Math.max(0, Math.min(getDuration(), xToTime(e.clientX)));
    onHover(time, isDragging);

    if (isDragging && dragMode === 'seek') {
      onSeek(time);
    } else if (isDragging && dragMode === 'select' && dragStartTime !== null) {
      onSelectionChange(dragStartTime, time);
    }
  }

  function onMouseLeave() {
    onHover(null, false);
  }

  function onMouseDown(e: MouseEvent) {
    isDragging = true;
    dragStartTime = Math.max(0, Math.min(getDuration(), xToTime(e.clientX)));

    if (e.shiftKey) {
      dragMode = 'select';
      onSelectionChange(dragStartTime, dragStartTime);
    } else {
      dragMode = 'seek';
      onSelectionChange(null, null);
      onSeek(dragStartTime);
    }
  }

  function onMouseUp() {
    isDragging = false;
    dragStartTime = null;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();

    const { viewStart, viewEnd } = getViewRange();
    const viewDuration = viewEnd - viewStart;
    const duration = getDuration();

    if (e.ctrlKey || e.metaKey) {
      // Zoom: pinch around mouse position
      const mouseTime = xToTime(e.clientX);
      const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
      const newDuration = Math.max(
        0.5,
        Math.min(duration, viewDuration * zoomFactor)
      );

      const frac = (mouseTime - viewStart) / viewDuration;
      let newStart = mouseTime - frac * newDuration;
      let newEnd = newStart + newDuration;

      if (newStart < 0) { newStart = 0; newEnd = newDuration; }
      if (newEnd > duration) { newEnd = duration; newStart = duration - newDuration; }

      setViewRange(Math.max(0, newStart), Math.min(duration, newEnd));
    } else {
      // Pan
      const panAmount = viewDuration * 0.1 * (e.deltaY > 0 ? 1 : -1);
      let newStart = viewStart + panAmount;
      let newEnd = viewEnd + panAmount;

      if (newStart < 0) { newStart = 0; newEnd = viewDuration; }
      if (newEnd > duration) { newEnd = duration; newStart = duration - viewDuration; }

      setViewRange(Math.max(0, newStart), Math.min(duration, newEnd));
    }
  }

  // Global key-driven zoom events from timeline:zoomIn / timeline:zoomOut
  function onZoomIn() {
    const { viewStart, viewEnd } = getViewRange();
    const duration = getDuration();
    const viewDuration = viewEnd - viewStart;
    const center = (viewStart + viewEnd) / 2;
    const newDur = Math.max(0.5, viewDuration * 0.7);
    const newStart = Math.max(0, center - newDur / 2);
    const newEnd = Math.min(duration, newStart + newDur);
    setViewRange(newStart, newEnd);
  }

  function onZoomOut() {
    const { viewStart, viewEnd } = getViewRange();
    const duration = getDuration();
    const viewDuration = viewEnd - viewStart;
    const center = (viewStart + viewEnd) / 2;
    const newDur = Math.min(duration, viewDuration * 1.4);
    const newStart = Math.max(0, center - newDur / 2);
    const newEnd = Math.min(duration, newStart + newDur);
    setViewRange(newStart, newEnd);
  }

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('timeline:zoomIn' as never, onZoomIn);
  window.addEventListener('timeline:zoomOut' as never, onZoomOut);

  return () => {
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseleave', onMouseLeave);
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('timeline:zoomIn' as never, onZoomIn);
    window.removeEventListener('timeline:zoomOut' as never, onZoomOut);
  };
}
