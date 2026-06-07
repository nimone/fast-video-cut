// src/media/probe.ts
// Open a media file with mediabunny and extract duration, fps, and keyframe timestamps.

import {
  Input,
  ALL_FORMATS,
  BlobSource,
  EncodedPacketSink,
} from 'mediabunny';

export interface ProbeResult {
  input: Input;
  duration: number;
  fps: number;
  width: number;
  height: number;
  keyframeTimes: number[]; // sorted ascending
  hasAudio: boolean;
  videoCodecString: string | null;
  audioCodecString: string | null;
  formatName: string;
}

export async function probeFile(file: File): Promise<ProbeResult> {
  const source = new BlobSource(file);
  const input = new Input({ formats: ALL_FORMATS, source });

  try {
    // Validate
    const canRead = await input.canRead();
    if (!canRead) {
      throw new Error('Unsupported format or corrupted file.');
    }

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new Error('No video track found in this file.');
    }

    const audioTrack = await input.getPrimaryAudioTrack();

    // Duration
    const duration = await input.computeDuration();

    // FPS
    const stats = await videoTrack.computePacketStats(100);
    const fps = stats.averagePacketRate;

    // Dimensions (display)
    const width = await videoTrack.getDisplayWidth();
    const height = await videoTrack.getDisplayHeight();

    // Codec strings
    const videoCodecString = await videoTrack.getCodecParameterString();
    const audioCodecString = audioTrack ? await audioTrack.getCodecParameterString() : null;

    // Format name
    const fmt = await input.getFormat();
    const formatName = fmt?.constructor?.name ?? 'Unknown';

    // Collect keyframe timestamps using EncodedPacketSink
    const packetSink = new EncodedPacketSink(videoTrack);
    const keyframeTimes: number[] = [];

    let pkt = await packetSink.getFirstKeyPacket({ metadataOnly: true });
    while (pkt) {
      if (pkt.type === 'key') {
        keyframeTimes.push(pkt.timestamp);
      }
      pkt = await packetSink.getNextKeyPacket(pkt, { metadataOnly: true });
    }

    // Ensure they are sorted
    keyframeTimes.sort((a, b) => a - b);

    return {
      input,
      duration,
      fps,
      width,
      height,
      keyframeTimes,
      hasAudio: audioTrack !== null,
      videoCodecString,
      audioCodecString,
      formatName,
    };
  } catch (err) {
    input.dispose();
    throw err;
  }
}
