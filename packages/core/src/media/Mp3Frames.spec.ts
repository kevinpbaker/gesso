import { describe, expect, it } from 'vitest';

import { Mp3Frames, readMp3Header, splitMp3Frames } from './Mp3Frames';

/**
 * The splitter, against streams built here byte by byte.
 *
 * The same bargain `Mp4Demuxer.spec.ts` strikes: a real `.mp3` would
 * be a better test of reality and a worse test of this code, because
 * when it failed you would not know which field was misread. Building
 * the stream means every assertion names the thing it is about, and
 * the awkward cases, a tag that spans two chunks, a false sync, a
 * chunk that ends inside a header, can be constructed rather than
 * hunted for.
 *
 * What this cannot check is that real encoders write what it expects.
 * That was checked against a live track in a browser, and the bytes take
 * longer to arrive than anything done with them takes to run.
 */

// ---------------------------------------------------------------------------
// A very small MPEG audio writer
// ---------------------------------------------------------------------------

interface FrameSpec {
  /** 3 for MPEG-1, 2 for MPEG-2, 0 for MPEG-2.5. */
  version?: number;
  /** The header's four bitrate bits, not a rate in kbps. */
  bitrate?: number;
  rate?: number;
  padding?: boolean;
  mono?: boolean;
  /** What the body is filled with, so a test can tell frames apart. */
  fill?: number;
  /** Bytes to use instead of the length the header declares, for a truncated tail. */
  cut?: number;
}

function frameBytes(spec: FrameSpec = {}): number[] {
  const version = spec.version ?? 3;
  const bitrate = spec.bitrate ?? 9;
  const rate = spec.rate ?? 0;
  const padding = spec.padding === true ? 1 : 0;
  const header = [
    0xff,
    0xe0 | (version << 3) | (1 << 1) | 1,
    (bitrate << 4) | (rate << 2) | (padding << 1),
    spec.mono === true ? 0xc0 : 0x00
  ];
  const head = readMp3Header(Uint8Array.from(header), 0);
  if (head === null) {
    throw new Error('the test wrote a header the parser rejects');
  }
  const length = spec.cut ?? head.length;
  const body = Array.from<number>({ length: Math.max(0, length - 4) }).fill(spec.fill ?? 0x55);
  return [...header, ...body].slice(0, length);
}

function id3(size: number): number[] {
  const syncsafe = [(size >>> 21) & 0x7f, (size >>> 14) & 0x7f, (size >>> 7) & 0x7f, size & 0x7f];
  return [0x49, 0x44, 0x33, 3, 0, 0, ...syncsafe, ...Array.from<number>({ length: size }).fill(0x00)];
}

/** A Xing frame: a normal frame whose body holds the tag after the side information. */
function xingFrame(totalFrames: number, totalBytes: number): number[] {
  const bytes = frameBytes({ fill: 0x00 });
  const at = 4 + 32; // MPEG-1, stereo
  const tag = [
    ...[...'Xing'].map(c => c.charCodeAt(0)),
    0,
    0,
    0,
    0x03, // frames and bytes both present
    (totalFrames >>> 24) & 0xff,
    (totalFrames >>> 16) & 0xff,
    (totalFrames >>> 8) & 0xff,
    totalFrames & 0xff,
    (totalBytes >>> 24) & 0xff,
    (totalBytes >>> 16) & 0xff,
    (totalBytes >>> 8) & 0xff,
    totalBytes & 0xff
  ];
  bytes.splice(at, tag.length, ...tag);
  return bytes;
}

/** Push a stream in pieces of a fixed size, and collect everything it yields. */
function pushInChunks(bytes: number[], size: number) {
  const splitter = new Mp3Frames();
  const all = [];
  const source = Uint8Array.from(bytes);
  for (let at = 0; at < source.length; at += size) {
    all.push(...splitter.push(source.subarray(at, Math.min(source.length, at + size))));
  }
  all.push(...splitter.flush());
  return { splitter, frames: all };
}

// ---------------------------------------------------------------------------

describe('readMp3Header', () => {
  it('reads an MPEG-1 layer III frame', () => {
    const head = readMp3Header(Uint8Array.from(frameBytes()), 0);
    expect(head).toMatchObject({
      version: 'mpeg1',
      layer: 3,
      sampleRate: 44100,
      channels: 2,
      bitrate: 128000,
      samples: 1152,
      length: 417
    });
  });

  it('adds the padding byte to the length', () => {
    expect(readMp3Header(Uint8Array.from(frameBytes({ padding: true })), 0)?.length).toBe(418);
  });

  it('halves the samples and the length below MPEG-1', () => {
    const head = readMp3Header(Uint8Array.from(frameBytes({ version: 2, rate: 0, bitrate: 9 })), 0);
    // MPEG-2 layer III: 576 samples, and 72 rather than 144 bytes per kbps.
    expect(head).toMatchObject({ version: 'mpeg2', sampleRate: 22050, samples: 576, length: 261 });
  });

  it('reads the mono mode as one channel', () => {
    expect(readMp3Header(Uint8Array.from(frameBytes({ mono: true })), 0)?.channels).toBe(1);
  });

  it('rejects every reserved combination', () => {
    const good = frameBytes();
    const reject = (index: number, value: number) => {
      const bytes = Uint8Array.from(good);
      bytes[index] = value;
      return readMp3Header(bytes, 0);
    };
    expect(reject(1, 0xe0 | (1 << 3) | (1 << 1) | 1)).toBeNull(); // reserved version
    expect(reject(1, 0xe0 | (3 << 3) | (0 << 1) | 1)).toBeNull(); // reserved layer
    expect(reject(2, 0x00)).toBeNull(); // the free format, whose length is not declared
    expect(reject(2, 0xf0)).toBeNull(); // reserved bitrate
    expect(reject(2, 0x9c)).toBeNull(); // reserved sample rate
    expect(reject(0, 0xfe)).toBeNull(); // a broken sync word
  });

  it('reads nothing off the end of the buffer', () => {
    expect(readMp3Header(Uint8Array.from(frameBytes()).subarray(0, 3), 0)).toBeNull();
    expect(readMp3Header(Uint8Array.from(frameBytes()), -1)).toBeNull();
  });
});

describe('splitMp3Frames', () => {
  it('splits a constant bitrate stream and times every frame', () => {
    const stream = [...frameBytes({ fill: 1 }), ...frameBytes({ fill: 2 }), ...frameBytes({ fill: 3 })];
    const { format, frames } = splitMp3Frames(Uint8Array.from(stream));

    expect(format).toMatchObject({ sampleRate: 44100, channels: 2, samplesPerFrame: 1152, layer: 3 });
    expect(frames).toHaveLength(3);
    expect(frames.map(frame => frame.offset)).toEqual([0, 417, 834]);
    expect(frames.map(frame => frame.sampleOffset)).toEqual([0, 1152, 2304]);
    expect(frames.map(frame => frame.bytes[4])).toEqual([1, 2, 3]);
    expect(frames[0]?.durationUs).toBe(26122);
    expect(frames[2]?.timestampUs).toBe(52245);
  });

  it('gives each frame its own bytes, header included', () => {
    const { frames } = splitMp3Frames(Uint8Array.from([...frameBytes(), ...frameBytes()]));
    expect(frames[1]?.bytes).toHaveLength(417);
    expect([...frames[1]!.bytes.subarray(0, 2)]).toEqual([0xff, 0xfb]);
  });

  it('skips an ID3v2 tag', () => {
    const { frames } = splitMp3Frames(Uint8Array.from([...id3(500), ...frameBytes(), ...frameBytes()]));
    expect(frames).toHaveLength(2);
    expect(frames[0]?.offset).toBe(510);
  });

  it('resyncs past junk in front of the first frame', () => {
    const junk = [0xff, 0x00, 0x13, 0xff, 0xe0, 0x42];
    const { frames } = splitMp3Frames(Uint8Array.from([...junk, ...frameBytes(), ...frameBytes()]));
    expect(frames).toHaveLength(2);
    expect(frames[0]?.offset).toBe(6);
  });

  it('takes the frame whose neighbour agrees, not the first thing that looks like a header', () => {
    // Four bytes that parse as a header, followed by a real pair. A
    // splitter that locked onto the impostor would read the first real
    // frame at the wrong offset and return two frames of nonsense.
    const impostor = [0xff, 0xfb, 0x90, 0x00];
    const { frames } = splitMp3Frames(Uint8Array.from([...impostor, ...frameBytes({ fill: 7 }), ...frameBytes()]));
    expect(frames).toHaveLength(2);
    expect(frames[0]?.offset).toBe(4);
    expect(frames[0]?.bytes[4]).toBe(7);
  });

  it('reports what a Xing header says and does not return its frame', () => {
    const stream = [...xingFrame(9000, 4_700_000), ...frameBytes({ fill: 1 }), ...frameBytes({ fill: 2 })];
    const { format, frames } = splitMp3Frames(Uint8Array.from(stream));

    expect(format).toMatchObject({ totalFrames: 9000, totalBytes: 4_700_000 });
    expect(frames).toHaveLength(2);
    // The dropped frame carries no audio, so the first real frame is
    // still sample zero even though it is not byte zero.
    expect(frames[0]).toMatchObject({ offset: 417, sampleOffset: 0, timestampUs: 0 });
  });

  it('leaves a truncated final frame out rather than returning noise', () => {
    const stream = [...frameBytes(), ...frameBytes(), ...frameBytes({ cut: 100 })];
    const { frames } = splitMp3Frames(Uint8Array.from(stream));
    expect(frames).toHaveLength(2);
  });

  it('finds nothing in bytes that are not MPEG audio', () => {
    const { format, frames } = splitMp3Frames(Uint8Array.from(Array.from<number>({ length: 4096 }).fill(0x41)));
    expect(format).toBeNull();
    expect(frames).toEqual([]);
  });
});

describe('Mp3Frames, arriving in pieces', () => {
  const stream = [
    ...id3(300),
    ...xingFrame(4, 2000),
    ...frameBytes({ fill: 1 }),
    ...frameBytes({ fill: 2 }),
    ...frameBytes({ fill: 3 })
  ];
  const whole = splitMp3Frames(Uint8Array.from(stream));

  // Sizes chosen to end chunks inside the tag, inside a header, inside
  // a body, and exactly on a frame boundary.
  for (const size of [1, 3, 7, 64, 310, 417, 500, 1024, 4096]) {
    it(`returns the same frames in chunks of ${size} bytes`, () => {
      const { splitter, frames } = pushInChunks(stream, size);
      expect(frames.map(frame => frame.offset)).toEqual(whole.frames.map(frame => frame.offset));
      expect(frames.map(frame => frame.timestampUs)).toEqual(whole.frames.map(frame => frame.timestampUs));
      expect(frames.map(frame => frame.bytes[4])).toEqual([1, 2, 3]);
      expect(splitter.format).toEqual(whole.format);
    });
  }

  it('returns each frame as soon as its last byte arrives', () => {
    const splitter = new Mp3Frames();
    const source = Uint8Array.from([...frameBytes(), ...frameBytes(), ...frameBytes()]);
    // The first frame is held until a second one confirms it, and from
    // then on a frame is returned the moment it completes.
    expect(splitter.push(source.subarray(0, 417))).toHaveLength(0);
    expect(splitter.push(source.subarray(417, 834))).toHaveLength(2);
    expect(splitter.push(source.subarray(834))).toHaveLength(1);
  });

  it('holds a tag that spans several chunks', () => {
    const { frames } = pushInChunks([...id3(5000), ...frameBytes(), ...frameBytes()], 128);
    expect(frames).toHaveLength(2);
    expect(frames[0]?.offset).toBe(5010);
  });

  it('takes a lone frame on trust at the end of the stream', () => {
    const splitter = new Mp3Frames();
    expect(splitter.push(Uint8Array.from(frameBytes()))).toHaveLength(0);
    expect(splitter.flush()).toHaveLength(1);
  });

  it('ignores an empty chunk', () => {
    const splitter = new Mp3Frames();
    expect(splitter.push(new Uint8Array(0))).toEqual([]);
  });

  it('counts what it has read', () => {
    const { splitter } = pushInChunks(stream, 100);
    expect(splitter.frameCount).toBe(3);
    expect(splitter.sampleCount).toBe(3456);
    expect(splitter.seconds).toBeCloseTo(0.0784, 4);
  });
});
