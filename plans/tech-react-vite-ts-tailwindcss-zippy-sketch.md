# Video-Cut — Lossless Browser Trimmer · Implementation Plan

## Context

The user makes screen recordings (OBS, 60fps, MKV) — tutorials and similar — and
needs to **remove sections (mostly silent pauses, often only 1–2s)** before real
editing in another program. They want a **fast, keyboard-driven** trimmer:
hover-to-scrub, drop cuts, trim left/right to the nearest cut, ripple-join the
kept parts, export **losslessly** (no transcode). Existing tool `lossless-cut`
felt high-friction and didn't fit the workflow.

**Output must be lossless** — only stream-copy / packet-copy, no re-encoding. The
user accepts that lossless cuts **snap to keyframes** and will record OBS with a
**short keyframe interval (~1s)** so tiny cuts stay precise.

This is a **greenfield, 100% client-side web app** (no backend). The "server" only
serves static files; all video work happens in the browser.

## Decisions (settled during brainstorming)

| Concern              | Decision                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App type             | Pure client-side web app, served from `localhost` / static host. No backend.                                                                                                |
| Language / build     | TypeScript + **Vite**                                                                                                                                                       |
| UI framework         | **React**                                                                                                                                                                   |
| Styling / components | **Tailwind CSS + cossUI** (Base UI primitives: dialogs, menus, etc.)                                                                                                        |
| State + undo/redo    | **zustand** with snapshot history                                                                                                                                           |
| Media engine         | **mediabunny** — playback (CanvasSink + AudioBufferSink), frame extraction, keyframe probing, AND lossless export. No ffmpeg.wasm.                                          |
| Player/preview       | **mediabunny canvas player** — decode frames via WebCodecs, render to canvas. NOT the HTML5 `<video>` element (it can't play MKV). Reference: mediabunny `dev/player.html`. |
| Timeline             | **Custom HTML Canvas** component (libs don't fit; lossless-cut's DOM approach hits a perf ceiling).                                                                         |

**Rejected for the timeline — Twick (`ncounterspecialist/twick`):** it's a multi-track
Fabric.js _compositor_ with a re-encoding (lossy) export. Its timeline UI is hardwired
to `TimelineProvider`/`LivePlayerProvider` + a tracks/elements model — not standalone;
decoupling ≈ 80% of building custom, and its canvas would fight our mediabunny player.
Restrictive Sustainable Use License. Keep as a _reference_ for tick-calculation logic only.
| Keybindings | **`tinykeys`** + a fully remappable keymap persisted to `localStorage`. |
| File I/O | **File System Access API** (open source + write output to a chosen folder) + drag-and-drop. |
| Cut model | Non-destructive **list of kept segments**, keyframe-aligned; ripple-join; export = lossless concat. |
| Target browser | Chrome/Edge (Chromium) first-class. Firefox/Safari fall back to drag-open + download. |

## Architecture

```
Browser (Chrome/Edge), static files from localhost
├─ Canvas Player  ← mediabunny CanvasSink (video) + AudioBufferSink (audio)
├─ Canvas Timeline ← custom: segments, keyframe ticks, playhead, zoom/pan, hover-scrub
├─ Side panels (cossUI): cut list, shortcut cheatsheet, export progress
├─ editStore (zustand): kept-segment list + cut/trim/delete ops + undo/redo history
├─ keymap (tinykeys + localStorage, remappable) → dispatches store actions
└─ exporter ← mediabunny: packet-copy kept ranges into one Output (lossless), write via FS Access API
```

## Data model (`editStore`)

- On open, probe with mediabunny `Input`: duration, video track, fps (60),
  and **keyframe timestamps** (via `EncodedPacketSink` reading packet metadata).
- State: ordered list of **kept segments** `{ start: number; end: number }`
  (seconds, video-keyframe-aligned at `start`). Initial = one segment `[0, duration]`.
- **Cut**: snap cursor to nearest keyframe → split the containing segment into two.
- **Trim-left**: remove span `[firstBoundaryLeftOfCursor … cursor]` (default clip
  start) → drop/shrink entries; neighbours become adjacent (ripple).
- **Trim-right**: mirror, toward the right / clip end.
- **Select + Delete**: same op driven by a dragged region.
- Preview shows the **virtual joined result**; source file is never mutated.
- **Undo/redo**: history stack of segment-list snapshots — instant.

## Modules / files (proposed)

```
src/
  media/
    probe.ts          # open Input, extract duration/fps/keyframe timestamps
    player.ts         # mediabunny CanvasSink + AudioBufferSink play clock, seek, frame-step, speed
    exporter.ts       # lossless packet-copy concat of kept segments → Output → file
    keyframes.ts      # nearest-keyframe snapping helpers
  store/
    edit-store.ts      # zustand: segments, cut/trim/delete, undo/redo
    keymap-store.ts    # bindings + remap + localStorage persistence
  components/
    timeline/
      timeline.tsx      # canvas element + React shell
      timeline-draw.ts   # render loop: segments, ticks, playhead (rAF, dirty-region)
      timeline-input.ts  # hover-scrub, drag-select, zoom (Ctrl+wheel), pan
    editor/
      player.tsx        # canvas preview + transport
      cut-list-panel.tsx  # list of cuts, click to jump (cossUI)
      export-dialog.tsx  # progress + folder pick (cossUI)
    info/
      shortcut-help.tsx  # '?' cheatsheet overlay (cossUI dialog)
  keymap/keys.ts      # default bindings (all remappable)
  App.tsx
```

## mediabunny specifics to use

- **Read/probe**: `Input` + `BlobSource`; `InputVideoTrack` / `InputAudioTrack`;
  `EncodedPacketSink` to enumerate keyframe timestamps.
- **Preview**: `CanvasSink` (`getCanvas(t)` for scrub/step; `canvasesAtTimestamps()`
  for smooth playback; `poolSize` to reuse canvases) + `AudioBufferSink` for audio,
  synced by a play clock. Mirror the `dev/player.html` reference.
- **Export (lossless concat)**: read encoded packets via `EncodedPacketSink`,
  copy only packets within each kept keyframe-aligned range into a single `Output`
  (`Mp4OutputFormat` / `MatroskaOutputFormat` matching the source), offsetting
  timestamps so segments are contiguous. Each kept segment begins on a keyframe, so
  decoding stays valid. Write via `StreamTarget` → File System Access API writable.
  **(Verify the exact packet-copy API in the Phase 1 spike — this is the riskiest
  bit; the `Conversion` API with trimming is the fallback if multi-segment packet
  copy needs assembling per-segment then joining.)**

## Default keybindings (all remappable via `keymapStore`)

| Action           | Default               | Action        | Default                   |
| ---------------- | --------------------- | ------------- | ------------------------- |
| Scrub            | mouse hover           | Prev/next cut | `,` / `.`                 |
| Play/pause       | `Space`               | Zoom in/out   | `+` / `-`, Ctrl+wheel     |
| Cut at cursor    | `C`                   | Speed cycle   | `[` / `]`                 |
| Trim left/right  | `Q` / `W`             | Undo/redo     | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Delete selection | `Delete`              | Export        | `Ctrl+E`                  |
| Frame step       | `←` / `→`             | Open file     | `Ctrl+O` / drag-drop      |
| Bigger jump      | `Shift+←` / `Shift+→` | Cheatsheet    | `?`                       |

## Edge cases / error handling

- **Coarse keyframes** (non-OBS source): show keyframe spacing; warn that tiny cuts
  may snap noticeably. Cuts still work.
- **Unsupported codec/container**: detect on open, show clear message.
- **Empty timeline** (all trimmed): block export with a message.
- **Audio/video keyframe mismatch**: align cuts to **video** keyframes; copy audio to match.
- **Firefox/Safari** (no FS Access API): drag-open + download fallback.

## Out of scope (YAGNI)

No transcoding/format conversion, transitions, multi-clip timeline, audio-waveform
editing, effects/filters, or titles. Pure trim-and-join, one clip at a time.

## Implementation phases (tracer-bullet order — riskiest first)

0. **Scaffold**: Vite + React + TS + Tailwind + cossUI + zustand; app shell layout.
1. **Lossless concat spike** (de-risks the core promise): hardcode 2–3 kept ranges,
   packet-copy a real OBS MKV into one output, confirm it plays and is bit-identical
   frames / no re-encode. Lock the export API approach here.
2. **mediabunny canvas player**: load file, render frame at time, play/pause with
   A/V sync, frame-step, playback speed. (Follow `dev/player.html`.)
3. **Custom canvas timeline**: duration, playhead, keyframe ticks, hover-scrub,
   zoom/pan, 60fps via rAF.
4. **Edit model + ops**: wire cut / trim-left / trim-right / select-delete to
   `editStore` + timeline + ripple preview + undo/redo.
5. **Keybindings**: `tinykeys`, remap UI, `localStorage`, `?` cheatsheet.
6. **File I/O + export UX**: FS Access open/save, drag-drop, progress, edge-case
   handling and warnings.
7. **QoL polish**: cut-list panel, jump to next/prev cut, zoom controls, coarse-keyframe warning.

## Verification (end-to-end)

- Record a short OBS clip at 60fps with **keyframe interval = 1s**, MKV, with a
  deliberate silent pause.
- Open it in the app at `http://localhost:5173`; confirm it previews (proves MKV via
  WebCodecs), scrubs by hover, and steps frame-by-frame.
- Cut at the pause start, scrub to where action resumes, Trim-left; confirm the
  ripple join in preview.
- Export; open the output in a player AND re-probe with mediabunny/ffprobe to confirm:
  (a) it plays, (b) same codec/no re-encode (stream-copy), (c) the silent gap is gone,
  (d) duration shortened by the removed span.
- Repeat with an MP4 source and a coarse-keyframe (non-OBS) file to exercise the
  snapping warning.
- Undo/redo a sequence of cuts; confirm state restores correctly.
- Rebind a key in the remap UI; reload; confirm the binding persists.

```

```

## Docs Ref

- MediaBunny: https://mediabunny.dev/llms.txt
- Zustand: https://zustand.docs.pmnd.rs/llms.txt
- CossUI: https://coss.com/ui/llms.txt
- Tinykeys: https://raw.githubusercontent.com/jamiebuilds/tinykeys/refs/heads/main/README.md
