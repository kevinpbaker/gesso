import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultVideoResolver, type VideoPlayback } from './VideoResolver';
import { DEFAULT_BLOCK_SIZE } from './ByteSource';
import { buildMp4, FakeVideoDecoder, mdatStart, type TrackSpec } from './Mp4TestUtils';

/**
 * The playback, and the arithmetic of getting to a position.
 *
 * Nothing here decodes anything: the decoder is a fake that records
 * what it was handed and emits a frame per chunk. That is deliberate
 * and it is what these specs are *about* — a seek that starts at the
 * wrong keyframe, or one that walks the whole clip to get somewhere,
 * is a mistake in a sample table index and is invisible in a picture.
 * Whether the pixels come out right is a browser's answer, and the
 * page says so.
 */

/**
 * Sixty frames at a tenth of a second each, with a keyframe every
 * tenth: six seconds of ten-frames-a-second video on a one-second
 * GOP, which is the shape a clip on the web has.
 *
 * Long enough to matter, and that length is load-bearing rather than
 * decorative. `FRAME_QUEUE_LIMIT` is twelve, so a decoder fed a clip
 * shorter than that has already been handed the entire file before
 * anything is presented — every position is already decoded, no seek
 * is needed to reach any of them, and a spec written against such a
 * clip passes whatever the seek logic does. The first draft of this
 * file used ten frames and proved nothing.
 */
const FRAMES = 60;
const KEY_EVERY = 10;

function clip(): { data: ArrayBuffer; spec: TrackSpec } {
  const spec: TrackSpec = {
    timescale: 1000,
    deltas: [{ count: FRAMES, delta: 100 }],
    sizes: Array.from({ length: FRAMES }, () => 8),
    chunkOffsets: [0],
    chunkRuns: [{ firstChunk: 1, samplesPerChunk: FRAMES }],
    // 1-based sample numbers, which is what `stss` holds.
    syncSamples: Array.from({ length: FRAMES / KEY_EVERY }, (_, n) => n * KEY_EVERY + 1),
    width: 64,
    height: 48
  };
  const data = buildMp4(spec);
  return { data: buildMp4({ ...spec, chunkOffsets: [mdatStart(data)] }), spec };
}

async function open(): Promise<{ playback: VideoPlayback; release: () => void }> {
  const { data } = clip();
  const resolver = new DefaultVideoResolver({ fetch: () => Promise.resolve(data) });
  const playback = await resolver.resolve('clip.mp4');
  return { playback, release: () => resolver.dispose() };
}

describe('Mp4Playback', () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = FakeVideoDecoder.install();
  });

  afterEach(() => uninstall());

  it('reads the clip it was given', async () => {
    const { playback, release } = await open();
    expect(playback.duration).toBeCloseTo(6);
    expect(playback.width).toBe(64);
    expect(playback.frameDurationMs).toBe(100);
    release();
  });

  it('plays forwards without ever reconfiguring the decoder', async () => {
    const { playback, release } = await open();
    const configures = FakeVideoDecoder.configures;

    for (let at = 0; at < 6000; at += 100) {
      playback.present(at);
    }

    // The whole point of the seek test below: ordinary playback must
    // not trip it. One configure, for the initial one, and no resets.
    expect(FakeVideoDecoder.configures).toBe(configures);
    expect(FakeVideoDecoder.resets).toBe(0);
    release();
  });

  it('starts a backwards seek at the keyframe before where it was aimed', async () => {
    const { playback, release } = await open();
    for (let at = 0; at < 5000; at += 100) {
      playback.present(at);
    }

    FakeVideoDecoder.submitted.length = 0;
    // Back to 3500ms, which the keyframe at 3000ms covers.
    playback.present(3500);

    expect(FakeVideoDecoder.resets).toBe(1);
    // Not 0: a seek that went back to the start of the file to reach
    // the middle of it is the bug this replaced.
    expect(FakeVideoDecoder.submitted[0]?.timestamp).toBe(3_000_000);
    expect(FakeVideoDecoder.submitted[0]?.type).toBe('key');
    release();
  });

  it('seeks to the start of the file when the clip loops', async () => {
    const { playback, release } = await open();
    for (let at = 0; at < 6000; at += 100) {
      playback.present(at);
    }

    FakeVideoDecoder.submitted.length = 0;
    playback.present(0);

    // A loop is a seek to zero, and zero is always its own keyframe.
    expect(FakeVideoDecoder.submitted[0]?.timestamp).toBe(0);
    expect(playback.seeking).toBe(false);
    release();
  });

  it('does not decode the samples in between to reach a position further on', async () => {
    const { playback, release } = await open();
    playback.present(0);

    FakeVideoDecoder.submitted.length = 0;
    // 3500ms, from a decoder whose head is a dozen frames in.
    playback.present(3500);

    // The keyframe covering 3500ms is at 3000ms, and nothing before it
    // is worth decoding. Without the forward half of `needsSeek` this
    // would submit sample by sample from wherever the decoder's head
    // was, which is a scrub that plays rather than jumps.
    expect(FakeVideoDecoder.submitted[0]?.timestamp).toBe(3_000_000);
    expect(FakeVideoDecoder.sinceConfigure.every(at => at >= 3_000_000)).toBe(true);
    release();
  });

  it('throws away the frames between the keyframe and the target rather than showing them', async () => {
    const { playback, release } = await open();
    playback.present(0);
    const shownAt = playback.surface.version;

    playback.present(3500);

    // The frames from 3000 to 3400 were decoded — the picture at 3500
    // refers to them — and none of them was ever put on the surface.
    // One new version, for the one frame that was asked for.
    expect(playback.surface.version).toBe(shownAt + 1);
    release();
  });

  it('reports nothing pending once the wanted picture has been decoded', async () => {
    const { playback, release } = await open();
    playback.present(0);
    playback.present(3500);

    // The fake decoder emits synchronously, so by the time `present`
    // returns the target has arrived. A real one clears this a few
    // milliseconds later, which is the window a scrubber dims in.
    expect(playback.seeking).toBe(false);
    release();
  });

  it('treats a track with no sync samples as one where every sample is one', async () => {
    const spec: TrackSpec = {
      timescale: 1000,
      deltas: [{ count: FRAMES, delta: 100 }],
      sizes: Array.from({ length: FRAMES }, () => 8),
      chunkOffsets: [0],
      chunkRuns: [{ firstChunk: 1, samplesPerChunk: FRAMES }],
      // No `stss` at all, which is how an all-intra track says every
      // sample is a sync sample.
      width: 32,
      height: 32
    };
    const sized = buildMp4(spec);
    const data = buildMp4({ ...spec, chunkOffsets: [mdatStart(sized)] });
    const resolver = new DefaultVideoResolver({ fetch: () => Promise.resolve(data) });
    const playback = await resolver.resolve('all-intra.mp4');

    playback.present(0);
    FakeVideoDecoder.submitted.length = 0;
    playback.present(3500);

    // An all-intra track can start anywhere, so the seek lands exactly
    // where it was aimed rather than on the keyframe before it — there
    // is no frame here that is not one.
    expect(FakeVideoDecoder.submitted[0]?.timestamp).toBe(3_500_000);
    resolver.dispose();
  });
});

describe('DefaultVideoResolver reading a file in ranges', () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = FakeVideoDecoder.install();
  });

  afterEach(() => uninstall());

  /** Serves a buffer as if it were a file behind range requests. */
  function serve(data: ArrayBuffer) {
    const ranges: [number, number][] = [];
    const fetchRange = (_source: string, start: number, end: number) => {
      ranges.push([start, end]);
      return Promise.resolve({ data: data.slice(start, end), total: data.byteLength });
    };
    return { ranges, fetchRange };
  }

  it('opens a short file in a single request', async () => {
    const { data } = clip();
    const { fetchRange, ranges } = serve(data);
    const resolver = new DefaultVideoResolver({ fetchRange });
    const playback = await resolver.resolve('clip.mp4');

    expect(playback.duration).toBeCloseTo(6);
    // One request, starting at zero: the probe is a whole block, so it
    // is kept rather than thrown away, and a faststart `moov` inside
    // it is read from what is already here. Before the probe and the
    // block size were made the same number this took three requests
    // and moved more bytes than the file contains.
    expect(ranges).toEqual([[0, DEFAULT_BLOCK_SIZE]]);
    resolver.dispose();
  });

  it('asks for media only when the decoder wants it', async () => {
    const { data } = clip();
    const { fetchRange, ranges } = serve(data);
    const resolver = new DefaultVideoResolver({ fetchRange });
    const playback = await resolver.resolve('clip.mp4');
    const afterOpening = ranges.length;

    playback.present(0);
    await new Promise(resolve => setTimeout(resolve, 0));

    // Nothing beyond the header was fetched to *open* the clip; the
    // media follows the decoder. Here the whole file fits inside the
    // first block, so presenting asks for nothing more, which is
    // itself the right answer for a short clip.
    expect(ranges.length).toBe(afterOpening);
    expect(playback.surface.version).toBeGreaterThan(0);
    resolver.dispose();
  });

  it('does not use the whole-file fetch when it was given a ranged one', async () => {
    const { data } = clip();
    const { fetchRange } = serve(data);
    const whole = vi.fn(() => Promise.resolve(data));
    const resolver = new DefaultVideoResolver({ fetchRange, fetch: whole });

    await resolver.resolve('clip.mp4');

    // Neither is a default the other should be silently upgraded to,
    // so an application that asked for ranges gets ranges.
    expect(whole).not.toHaveBeenCalled();
    resolver.dispose();
  });

  it('finds a moov written after the media, which is what a camera writes', async () => {
    // `-movflags +faststart` moves the moov to the front and every
    // file served for streaming has been through it. A file that has
    // not is the ordinary case for something just recorded, and a
    // reader that only looked at the front of the file would refuse
    // it.
    const { data } = clip();
    const tail = moovLast(data);
    const { fetchRange } = serve(tail);
    const resolver = new DefaultVideoResolver({ fetchRange });

    const playback = await resolver.resolve('camera.mp4');
    expect(playback.duration).toBeCloseTo(6);
    resolver.dispose();
  });

  it('decodes once the bytes it was waiting for arrive', async () => {
    const { data } = clip();
    const { fetchRange } = serve(data);
    const resolver = new DefaultVideoResolver({ fetchRange });
    const playback = await resolver.resolve('clip.mp4');

    playback.present(0);
    // `fill` stops at the first sample whose bytes are not here and
    // asks for them; the request calls it again when it lands.
    await new Promise(resolve => setTimeout(resolve, 0));
    playback.present(100);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(FakeVideoDecoder.submitted.length).toBeGreaterThan(0);
    resolver.dispose();
  });

  it('refuses a file whose top level cannot be walked', async () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer;
    const { fetchRange } = serve(junk);
    const resolver = new DefaultVideoResolver({ fetchRange });

    await expect(resolver.resolve('junk.bin')).rejects.toThrow(/no moov/i);
    resolver.dispose();
  });
});

/** The same file with its `moov` moved behind the `mdat`. */
function moovLast(data: ArrayBuffer): ArrayBuffer {
  const view = new DataView(data);
  const boxes: { type: string; start: number; size: number }[] = [];
  let at = 0;
  while (at + 8 <= data.byteLength) {
    const size = view.getUint32(at);
    const type = String.fromCharCode(
      view.getUint8(at + 4),
      view.getUint8(at + 5),
      view.getUint8(at + 6),
      view.getUint8(at + 7)
    );
    boxes.push({ type, start: at, size });
    at += size;
  }
  const order = [...boxes.filter(box => box.type !== 'moov'), ...boxes.filter(box => box.type === 'moov')];
  const out = new Uint8Array(data.byteLength);
  let written = 0;
  for (const box of order) {
    out.set(new Uint8Array(data, box.start, box.size), written);
    written += box.size;
  }
  return out.buffer;
}

describe('a picture arriving after the frame was chosen', () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = FakeVideoDecoder.install();
    // The real path, which the rest of this file deliberately avoids:
    // a decoded frame is converted to an `ImageBitmap` before it is
    // drawable, and that conversion is asynchronous. Every spec above
    // runs with `createImageBitmap` absent, so `show` replaces the
    // frame synchronously and the gap this is about does not exist.
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = (frame: { timestamp: number }) =>
      Promise.resolve({ width: 4, height: 4, close: () => {}, timestamp: frame.timestamp });
  });

  afterEach(() => {
    uninstall();
  });

  it('says so when the picture lands, not when the frame was picked', async () => {
    const { data } = clip();
    const resolver = new DefaultVideoResolver({ fetch: () => Promise.resolve(data) });
    const playback = await resolver.resolve('clip.mp4');
    const seen: number[] = [];
    playback.onFrame?.(() => seen.push(playback.surface.version));

    seen.length = 0;
    const before = playback.surface.version;

    // What a paused clip does when it is scrubbed: ask for a position
    // once, and never ask again. `present` returns having *chosen* a
    // frame, and the picture is not on the surface yet.
    playback.present(3500);
    expect(seen).toEqual([]);
    expect(playback.surface.version).toBe(before);

    await new Promise(resolve => setTimeout(resolve, 0));

    // The conversion has landed and the surface said so. Without that,
    // nothing would ever repaint and the scrub would leave the old
    // picture up: a playing clip hides this because its next tick
    // repaints anyway, which is why this went unnoticed.
    expect(playback.surface.version).toBeGreaterThan(before);
    expect(seen.length).toBeGreaterThan(0);
    resolver.dispose();
  });
});
