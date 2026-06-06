// src/media/exporter.ts
// Lossless export: uses mediabunny Conversion API with trim per kept segment.
// Each segment is converted (stream-copied) with proper trim bounds.
// For multi-segment, we run one Conversion pass and use EncodedPacketSources
// to concatenate all segments into a single output.

import {
  Input,
  Output,
  ALL_FORMATS,
  BlobSource,
  StreamTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
} from 'mediabunny';
import type { Segment } from '../store/edit-store';

export interface ExportProgress {
  phase: 'preparing' | 'exporting' | 'finalizing' | 'done' | 'error';
  /** 0–1 */
  progress: number;
  error?: string;
}

export type OnProgress = (p: ExportProgress) => void;

/**
 * Export the given kept segments from the source file losslessly.
 * Writes directly to a FileSystemWritableFileStream.
 *
 * Strategy:
 * - One Output file with EncodedVideoPacketSource + EncodedAudioPacketSource.
 * - For each kept segment, iterate encoded packets in the keyframe-aligned range
 *   and add them to the source with adjusted timestamps so segments are contiguous.
 * - No decoding/re-encoding: pure packet copy = lossless.
 */
export async function exportSegments(
  file: File,
  segments: Segment[],
  fileHandle: FileSystemFileHandle,
  onProgress: OnProgress
): Promise<void> {
  if (segments.length === 0) {
    throw new Error('Nothing to export — all segments have been removed.');
  }

  onProgress({ phase: 'preparing', progress: 0 });

  // Open source input
  const source = new BlobSource(file);
  const input = new Input({ formats: ALL_FORMATS, source });

  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error('No video track found.');

  const audioTrack = await input.getPrimaryAudioTrack();

  // Get codec info
  const videoDecoderConfig = await videoTrack.getDecoderConfig();
  if (!videoDecoderConfig) throw new Error('Cannot identify video codec — unsupported format.');

  const audioDecoderConfig = audioTrack ? await audioTrack.getDecoderConfig() : null;

  // Map mediabunny full codec string to short codec name for EncodedPacketSource
  // e.g. 'avc1.42001f' → 'avc', 'vp09.00.31.08' → 'vp9', 'av01...' → 'av1'
  function mapVideoCodec(codecStr: string): string {
    if (codecStr.startsWith('avc') || codecStr.startsWith('h264')) return 'avc';
    if (codecStr.startsWith('hev') || codecStr.startsWith('hvc')) return 'hevc';
    if (codecStr.startsWith('vp8')) return 'vp8';
    if (codecStr.startsWith('vp09') || codecStr.startsWith('vp9')) return 'vp9';
    if (codecStr.startsWith('av01') || codecStr.startsWith('av1')) return 'av1';
    return codecStr.split('.')[0]; // fallback: first segment
  }

  function mapAudioCodec(codecStr: string): string {
    if (codecStr.startsWith('mp4a')) return 'aac';
    if (codecStr.startsWith('opus')) return 'opus';
    if (codecStr.startsWith('vorbis')) return 'vorbis';
    if (codecStr.startsWith('flac')) return 'flac';
    if (codecStr.startsWith('mp3') || codecStr.startsWith('mp4a.6b')) return 'mp3';
    return codecStr.split('.')[0];
  }

  const videoCodecName = mapVideoCodec(videoDecoderConfig.codec);
  const audioCodecName = audioDecoderConfig ? mapAudioCodec(audioDecoderConfig.codec) : null;

  // Determine output format from source file
  const isMkv = file.name.toLowerCase().endsWith('.mkv');
  let outputFormat: ConstructorParameters<typeof Output>[0]['format'];
  if (isMkv) {
    const { MatroskaOutputFormat } = await import('mediabunny');
    outputFormat = new MatroskaOutputFormat();
  } else {
    const { Mp4OutputFormat } = await import('mediabunny');
    outputFormat = new Mp4OutputFormat();
  }

  // Create output file
  const writableStream = await fileHandle.createWritable();
  const outputTarget = new StreamTarget(writableStream);
  const output = new Output({ format: outputFormat, target: outputTarget });

  // Create packet sources
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videoSource = new EncodedVideoPacketSource(videoCodecName as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audioSource = audioCodecName ? new EncodedAudioPacketSource(audioCodecName as any) : null;

  output.addVideoTrack(videoSource);
  if (audioSource) output.addAudioTrack(audioSource);

  await output.start();

  const totalDuration = segments.reduce((acc, s) => acc + (s.end - s.start), 0);
  let processedDuration = 0;
  let videoTimestampOffset = 0;
  let audioTimestampOffset = 0;

  const videoPacketSink = new EncodedPacketSink(videoTrack);
  const audioPacketSink = audioTrack ? new EncodedPacketSink(audioTrack) : null;

  let isFirstVideoPacket = true;
  let isFirstAudioPacket = true;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segDuration = seg.end - seg.start;

    // ---- VIDEO PACKETS ----
    // Find the key packet at or before seg.start (for decodability)
    let vPkt = await videoPacketSink.getKeyPacket(seg.start);
    if (!vPkt) {
      vPkt = await videoPacketSink.getFirstKeyPacket();
    }

    let segVideoFirstTimestamp: number | null = null;

    while (vPkt && vPkt.timestamp < seg.end) {
      if (segVideoFirstTimestamp === null) {
        segVideoFirstTimestamp = vPkt.timestamp;
      }

      // Remap timestamp to be contiguous with previous segments
      const relativeTs = vPkt.timestamp - segVideoFirstTimestamp;
      const offsetTs = relativeTs + videoTimestampOffset;
      const adjustedPkt = vPkt.clone({ timestamp: offsetTs });

      if (isFirstVideoPacket) {
        // Must provide decoderConfig with first packet
        await videoSource.add(adjustedPkt, {
          decoderConfig: videoDecoderConfig,
        });
        isFirstVideoPacket = false;
      } else {
        await videoSource.add(adjustedPkt);
      }

      vPkt = await videoPacketSink.getNextPacket(vPkt);
    }

    videoTimestampOffset += segDuration;

    // ---- AUDIO PACKETS ----
    if (audioPacketSink && audioSource && audioTrack && audioDecoderConfig) {
      // Audio: start from nearest packet at or before seg.start
      let aPkt = await audioPacketSink.getPacket(seg.start);
      if (!aPkt) {
        aPkt = await audioPacketSink.getFirstPacket();
      }

      let segAudioFirstTimestamp: number | null = null;

      while (aPkt && aPkt.timestamp < seg.end) {
        if (segAudioFirstTimestamp === null) {
          segAudioFirstTimestamp = aPkt.timestamp;
        }

        const relativeTs = aPkt.timestamp - segAudioFirstTimestamp;
        const offsetTs = relativeTs + audioTimestampOffset;
        const adjustedPkt = aPkt.clone({ timestamp: offsetTs });

        if (isFirstAudioPacket) {
          await audioSource.add(adjustedPkt, {
            decoderConfig: audioDecoderConfig,
          });
          isFirstAudioPacket = false;
        } else {
          await audioSource.add(adjustedPkt);
        }

        aPkt = await audioPacketSink.getNextPacket(aPkt);
      }

      audioTimestampOffset += segDuration;
    }

    processedDuration += segDuration;
    onProgress({
      phase: 'exporting',
      progress: processedDuration / totalDuration * 0.9,
    });
  }

  // Close sources (allows the output to finalize track headers)
  videoSource.close();
  audioSource?.close();

  onProgress({ phase: 'finalizing', progress: 0.95 });
  await output.finalize();

  input.dispose();
  onProgress({ phase: 'done', progress: 1 });
}
