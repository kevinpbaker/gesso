import { describe, expect, it } from 'vitest';

import { demuxMp4Video } from './Mp4Demuxer';

/**
 * The demuxer, against files built here byte by byte.
 *
 * A fixture `.mp4` would be a better test of reality and a worse test
 * of this code: when it failed you would not know which of forty boxes
 * was misread. Building the file means every assertion below names the
 * exact field it is about, and the awkward cases — a chunk holding
 * several samples, composition offsets reordering them, a track with
 * no `stss` — can be constructed rather than hunted for.
 *
 * What this cannot check is that the byte layout matches what encoders
 * actually write. That is checked against a real file, in a browser,
 * by the transitions example playing.
 */

// ---------------------------------------------------------------------------
// A very small MP4 writer
// ---------------------------------------------------------------------------

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function ascii(text: string): number[] {
  return [...text].map(character => character.charCodeAt(0));
}

/** `size type payload`, which is every box in the format. */
function box(type: string, ...payload: number[][]): number[] {
  const body = payload.flat();
  return [...u32(body.length + 8), ...ascii(type), ...body];
}

/** A full box: a version and three flag bytes before the payload. */
function fullBox(type: string, version: number, ...payload: number[][]): number[] {
  return box(type, [version, 0, 0, 0], ...payload);
}

interface TrackSpec {
  timescale: number;
  /** One `stts` run per entry. */
  deltas: { count: number; delta: number }[];
  compositionOffsets?: { count: number; offset: number }[];
  sizes: number[];
  chunkOffsets: number[];
  chunkRuns: { firstChunk: number; samplesPerChunk: number }[];
  /** Omitted means no `stss` at all, which means every sample is a sync sample. */
  syncSamples?: number[];
  width: number;
  height: number;
  handler?: string;
}

function visualSampleEntry(spec: TrackSpec): number[] {
  return box(
    'avc1',
    [0, 0, 0, 0, 0, 0], // reserved
    u16(1), // data_reference_index
    Array.from({ length: 16 }, () => 0), // pre_defined + reserved
    u16(spec.width),
    u16(spec.height),
    u32(0x0048_0000), // horizresolution
    u32(0x0048_0000), // vertresolution
    u32(0), // reserved
    u16(1), // frame_count
    Array.from({ length: 32 }, () => 0), // compressorname
    u16(24), // depth
    [0xff, 0xff], // pre_defined = -1
    // The configuration record: length, profile, compat, level, then
    // whatever the codec puts after them.
    box('avcC', [1, 0x64, 0x00, 0x1f, 0xff, 0xe1])
  );
}

function sampleTable(spec: TrackSpec): number[] {
  const boxes: number[][] = [
    fullBox('stsd', 0, u32(1), visualSampleEntry(spec)),
    fullBox('stts', 0, u32(spec.deltas.length), ...spec.deltas.map(run => [...u32(run.count), ...u32(run.delta)])),
    fullBox(
      'stsc',
      0,
      u32(spec.chunkRuns.length),
      ...spec.chunkRuns.map(run => [...u32(run.firstChunk), ...u32(run.samplesPerChunk), ...u32(1)])
    ),
    fullBox('stsz', 0, u32(0), u32(spec.sizes.length), ...spec.sizes.map(size => u32(size))),
    fullBox('stco', 0, u32(spec.chunkOffsets.length), ...spec.chunkOffsets.map(offset => u32(offset)))
  ];
  if (spec.compositionOffsets !== undefined) {
    boxes.splice(
      2,
      0,
      fullBox(
        'ctts',
        0,
        u32(spec.compositionOffsets.length),
        ...spec.compositionOffsets.map(run => [...u32(run.count), ...u32(run.offset)])
      )
    );
  }
  if (spec.syncSamples !== undefined) {
    boxes.push(fullBox('stss', 0, u32(spec.syncSamples.length), ...spec.syncSamples.map(number => u32(number))));
  }
  return box('stbl', ...boxes);
}

function buildMp4(spec: TrackSpec, options: { fragmented?: boolean } = {}): ArrayBuffer {
  const trak = box(
    'trak',
    box(
      'mdia',
      fullBox('mdhd', 0, u32(0), u32(0), u32(spec.timescale), u32(1000)),
      fullBox(
        'hdlr',
        0,
        u32(0),
        ascii(spec.handler ?? 'vide'),
        Array.from({ length: 12 }, () => 0),
        [0]
      ),
      box('minf', sampleTable(spec))
    )
  );
  const bytes = [
    ...box('ftyp', ascii('isom'), u32(512), ascii('isomiso2avc1mp41')),
    ...box(
      'moov',
      fullBox(
        'mvhd',
        0,
        Array.from({ length: 100 }, () => 0)
      ),
      trak
    ),
    ...(options.fragmented === true ? box('moof', box('mfhd', u32(1))) : []),
    // A `mdat` big enough for every offset the tables name.
    ...box(
      'mdat',
      Array.from({ length: 512 }, () => 0x41)
    )
  ];
  return new Uint8Array(bytes).buffer;
}

/** The offset `mdat`'s payload lands at, for a table that must point into it. */
function mdatStart(data: ArrayBuffer): number {
  const view = new DataView(data);
  let at = 0;
  while (at + 8 <= data.byteLength) {
    const size = view.getUint32(at);
    const type = String.fromCharCode(
      view.getUint8(at + 4),
      view.getUint8(at + 5),
      view.getUint8(at + 6),
      view.getUint8(at + 7)
    );
    if (type === 'mdat') {
      return at + 8;
    }
    at += size;
  }
  throw new Error('no mdat');
}

const BASE: TrackSpec = {
  timescale: 1000,
  deltas: [{ count: 4, delta: 100 }],
  sizes: [10, 20, 30, 40],
  chunkOffsets: [0],
  chunkRuns: [{ firstChunk: 1, samplesPerChunk: 4 }],
  width: 640,
  height: 480
};

/** Builds once to learn where `mdat` is, then rebuilds pointing at it. */
function withMdatOffsets(spec: TrackSpec): { data: ArrayBuffer; base: number } {
  const probe = buildMp4(spec);
  const base = mdatStart(probe);
  const aimed = { ...spec, chunkOffsets: spec.chunkOffsets.map(offset => offset + base) };
  const data = buildMp4(aimed);
  return { data, base: mdatStart(data) };
}

describe('demuxMp4Video', () => {
  it('reads the codec, the size and the configuration record', () => {
    const { data } = withMdatOffsets(BASE);
    const track = demuxMp4Video(data);
    // `avc1.PPCCLL` out of the record's profile, compatibility and
    // level bytes — the string `VideoDecoder.configure` is given.
    expect(track.codec).toBe('avc1.64001F');
    expect(track.codedWidth).toBe(640);
    expect(track.codedHeight).toBe(480);
    expect(track.description).toBeInstanceOf(Uint8Array);
    expect([...track.description!]).toEqual([1, 0x64, 0x00, 0x1f, 0xff, 0xe1]);
  });

  it('lays samples end to end inside their chunk', () => {
    const { data, base } = withMdatOffsets(BASE);
    const track = demuxMp4Video(data);
    expect(track.samples.map(sample => sample.size)).toEqual([10, 20, 30, 40]);
    // Four samples in one chunk: each starts where the last one ended.
    expect(track.samples.map(sample => sample.offset - base)).toEqual([0, 10, 30, 60]);
  });

  it('converts the timescale to microseconds and finds the duration', () => {
    const { data } = withMdatOffsets(BASE);
    const track = demuxMp4Video(data);
    // 100 ticks at 1000 per second is a tenth of a second.
    expect(track.samples.map(sample => sample.timestampUs)).toEqual([0, 100_000, 200_000, 300_000]);
    expect(track.samples[0]!.durationUs).toBe(100_000);
    expect(track.durationUs).toBe(400_000);
  });

  it('reports the shortest frame interval, which is what paces playback', () => {
    const { data } = withMdatOffsets(BASE);
    // 100 ticks at 1000 per second: a tenth of a second, so 10fps.
    expect(demuxMp4Video(data).frameDurationUs).toBe(100_000);
  });

  it('takes the shortest interval of a variable-rate track, not the average', () => {
    // Sampling too often costs a wake-up that finds nothing changed;
    // sampling too rarely drops a picture. So the fastest the track
    // ever moves is the safe number to pace by.
    const spec: TrackSpec = {
      ...BASE,
      deltas: [
        { count: 2, delta: 100 },
        { count: 2, delta: 25 }
      ]
    };
    const { data } = withMdatOffsets(spec);
    const track = demuxMp4Video(data);
    expect(track.frameDurationUs).toBe(25_000);
  });

  it('walks several chunks with different sample counts', () => {
    const spec: TrackSpec = {
      ...BASE,
      sizes: [10, 20, 30, 40, 50],
      chunkOffsets: [0, 200],
      // Chunk 1 holds two samples; chunk 2 onwards hold three.
      chunkRuns: [
        { firstChunk: 1, samplesPerChunk: 2 },
        { firstChunk: 2, samplesPerChunk: 3 }
      ],
      deltas: [{ count: 5, delta: 100 }]
    };
    const { data, base } = withMdatOffsets(spec);
    const track = demuxMp4Video(data);
    // Chunk 1: 10 then 20, from 0. Chunk 2: 30, 40, 50, from 200.
    expect(track.samples.map(sample => sample.offset - base)).toEqual([0, 10, 200, 230, 270]);
  });

  it('applies composition offsets without reordering the samples', () => {
    const spec: TrackSpec = {
      ...BASE,
      // The classic IPBB pattern: decode order is not display order.
      compositionOffsets: [
        { count: 1, offset: 0 },
        { count: 1, offset: 300 },
        { count: 2, offset: 100 }
      ]
    };
    const { data } = withMdatOffsets(spec);
    const track = demuxMp4Video(data);
    expect(track.samples.map(sample => sample.timestampUs)).toEqual([0, 400_000, 300_000, 400_000]);
    // Still in decode order: a decoder is fed in the order the file
    // stores, and reorders on the way out. Sorting here would submit a
    // frame before the one it references.
    expect(track.samples[1]!.offset).toBeLessThan(track.samples[2]!.offset);
    // And the duration is how far the furthest frame reaches.
    expect(track.durationUs).toBe(500_000);
  });

  it('treats a track with no stss as all keyframes', () => {
    const { data } = withMdatOffsets(BASE);
    expect(demuxMp4Video(data).samples.every(sample => sample.isKey)).toBe(true);
  });

  it('reads stss as the list of sync samples, one-based', () => {
    const { data } = withMdatOffsets({ ...BASE, syncSamples: [1, 3] });
    expect(demuxMp4Video(data).samples.map(sample => sample.isKey)).toEqual([true, false, true, false]);
  });

  it('names a fragmented file rather than returning nothing', () => {
    // The failure worth designing for: a file the browser plays
    // perfectly, that this returns zero samples for. Saying which kind
    // of file it is turns an afternoon into a minute.
    const spec: TrackSpec = { ...BASE, sizes: [], chunkOffsets: [], chunkRuns: [], deltas: [] };
    const probe = buildMp4(spec, { fragmented: true });
    expect(() => demuxMp4Video(probe)).toThrow(/fragmented/i);
  });

  it('says so when there is no video track', () => {
    const { data } = withMdatOffsets({ ...BASE, handler: 'soun' });
    expect(() => demuxMp4Video(data)).toThrow(/no video track/i);
  });

  it('rejects something that is not an MP4 at all', () => {
    expect(() => demuxMp4Video(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer)).toThrow(/Not an MP4/i);
  });
});
