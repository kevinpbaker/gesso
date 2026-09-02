/**
 * Just enough ISO base media file format to feed a `VideoDecoder`.
 *
 * WebCodecs decodes; it does not demux. `VideoDecoder` takes
 * `EncodedVideoChunk`s and a `VideoDecoderConfig`, and getting those
 * out of an `.mp4` means walking the sample tables yourself. That is
 * what this does, and the reason it is here rather than a dependency
 * is that `@gesso/core`'s only dependency is `@webgpu/types`: a
 * renderer that pulls in a general-purpose container parser to play a
 * demo video has bought a great deal it does not use.
 *
 * **What it understands.** Progressive (non-fragmented) MP4 with a
 * `moov` and a `mdat`: `stsd` (with `avcC` or `hvcC`), `stts`, `ctts`,
 * `stsc`, `stsz`/`stz2`, `stco`/`co64` and `stss`. That is what every
 * encoder writes by default and what the `-movflags +faststart` files
 * on the web are.
 *
 * **What it does not.** Fragmented MP4 (`moof`/`traf`/`trun`), which
 * is what DASH and HLS segments are, and which is a different parse
 * rather than a harder one. It is detected and named rather than
 * mis-parsed into silence — a demuxer that returns zero samples for a
 * file the browser plays fine is a bug that takes an afternoon to
 * find. Audio is skipped entirely: there is nothing on this side of
 * the framework that could play it.
 *
 * **The whole file is parsed at once**, from one `ArrayBuffer`. Byte
 * ranges and progressive parsing are what you want for an hour of
 * video and are pure cost for the fifteen-second loops this exists
 * for; the seam is `VideoResolver`, which decides what to fetch.
 */

/** One encoded frame: where it is in the file, and when it is shown. */
export interface Mp4Sample {
  /** Byte offset into the file. */
  readonly offset: number;
  readonly size: number;
  /** Presentation time in microseconds, which is what WebCodecs takes. */
  readonly timestampUs: number;
  readonly durationUs: number;
  /** A sync sample: decoding may start here. */
  readonly isKey: boolean;
}

export interface Mp4VideoTrack {
  readonly codec: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
  /**
   * The codec's own configuration record (`avcC`, `hvcC`), which
   * `VideoDecoder.configure` needs for length-prefixed streams. Absent
   * for codecs that carry their configuration in-band.
   */
  readonly description?: Uint8Array;
  readonly samples: readonly Mp4Sample[];
  /** The whole track, in microseconds; where a loop wraps. */
  readonly durationUs: number;
  /**
   * The shortest frame interval in the track, in microseconds — the
   * fastest the picture ever changes.
   *
   * What paces playback: a caller that samples this often never misses
   * a frame, and one that samples faster only discovers that nothing
   * changed. For constant-rate video, which is nearly all of it, this
   * is simply the frame interval. For variable-rate video the shortest
   * is the safe choice over the average, because sampling too often
   * costs a wake-up and sampling too rarely drops a picture.
   */
  readonly frameDurationUs: number;
}

class Reader {
  private at = 0;

  constructor(private readonly view: DataView) {}

  get offset(): number {
    return this.at;
  }

  set offset(value: number) {
    this.at = value;
  }

  get remaining(): number {
    return this.view.byteLength - this.at;
  }

  u8(): number {
    const value = this.view.getUint8(this.at);
    this.at += 1;
    return value;
  }

  u16(): number {
    const value = this.view.getUint16(this.at);
    this.at += 2;
    return value;
  }

  u32(): number {
    const value = this.view.getUint32(this.at);
    this.at += 4;
    return value;
  }

  i32(): number {
    const value = this.view.getInt32(this.at);
    this.at += 4;
    return value;
  }

  u64(): number {
    const high = this.u32();
    const low = this.u32();
    // Beyond 2^53 an MP4 is not a thing this plays, and Number keeps
    // every offset arithmetic below honest.
    return high * 0x1_0000_0000 + low;
  }

  ascii(length: number): string {
    let text = '';
    for (let index = 0; index < length; index++) {
      text += String.fromCharCode(this.view.getUint8(this.at + index));
    }
    this.at += length;
    return text;
  }

  bytes(length: number): Uint8Array {
    const start = this.view.byteOffset + this.at;
    this.at += length;
    return new Uint8Array(this.view.buffer.slice(start, start + length));
  }

  skip(length: number): void {
    this.at += length;
  }
}

interface BoxHeader {
  readonly type: string;
  /** Where the box's payload starts. */
  readonly start: number;
  /** One past the box's last byte. */
  readonly end: number;
}

function readBoxHeader(reader: Reader, limit: number): BoxHeader | null {
  if (reader.remaining < 8 || reader.offset + 8 > limit) {
    return null;
  }
  const boxStart = reader.offset;
  let size = reader.u32();
  const type = reader.ascii(4);
  if (size === 1) {
    size = reader.u64();
  } else if (size === 0) {
    size = limit - boxStart;
  }
  const end = boxStart + size;
  if (size < 8 || end > limit) {
    return null;
  }
  return { type, start: reader.offset, end };
}

/** Walks the boxes directly inside `[from, to)`, calling back for each. */
function walkBoxes(reader: Reader, from: number, to: number, visit: (box: BoxHeader) => void): void {
  reader.offset = from;
  for (;;) {
    const box = readBoxHeader(reader, to);
    if (box === null) {
      return;
    }
    const resume = box.end;
    visit(box);
    reader.offset = resume;
    if (resume >= to) {
      return;
    }
  }
}

/** Version and flags of a full box, which most of the sample tables are. */
function readFullBoxVersion(reader: Reader): number {
  const version = reader.u8();
  reader.skip(3);
  return version;
}

interface SampleTable {
  timescale: number;
  /** Decode deltas, expanded per sample. */
  deltas: number[];
  /** Composition offsets, per sample; empty when there is no `ctts`. */
  compositionOffsets: number[];
  sizes: number[];
  chunkOffsets: number[];
  /** `(firstChunk, samplesPerChunk)` runs. */
  chunkRuns: { firstChunk: number; samplesPerChunk: number }[];
  /** 1-based sample numbers that are sync samples; empty means all are. */
  syncSamples: number[];
  codec: string;
  description?: Uint8Array;
  codedWidth: number;
  codedHeight: number;
}

/**
 * Reads the first video track out of an MP4.
 *
 * Throws with a description of what it found rather than returning
 * something empty: a caller that asked for a video and got no samples
 * cannot tell "this file has no video track" from "this parser does
 * not understand this file", and those want different fixes.
 */
export function demuxMp4Video(data: ArrayBuffer): Mp4VideoTrack {
  const reader = new Reader(new DataView(data));
  const limit = data.byteLength;
  let moov: BoxHeader | null = null;
  let sawFragment = false;
  let sawFtyp = false;

  walkBoxes(reader, 0, limit, box => {
    if (box.type === 'ftyp') {
      sawFtyp = true;
    } else if (box.type === 'moov') {
      moov = box;
    } else if (box.type === 'moof' || box.type === 'sidx') {
      sawFragment = true;
    }
  });

  if (!sawFtyp && moov === null) {
    throw new Error('Not an MP4: no ftyp or moov box at the top level of the file.');
  }
  if (moov === null) {
    throw new Error('This MP4 has no moov box, so there is no sample table to read.');
  }

  const table = findVideoTrack(reader, moov);
  if (table === null) {
    if (sawFragment) {
      throw new Error(
        'This is a fragmented MP4 (it has moof boxes), which this demuxer does not read. ' +
          'Remux it to a progressive file: `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`.'
      );
    }
    throw new Error('This MP4 has no video track, or none this demuxer recognises.');
  }

  const samples = buildSamples(table);
  if (samples.length === 0) {
    throw new Error(
      sawFragment
        ? 'This MP4 has an empty sample table and moof boxes: it is fragmented, which this demuxer does not read.'
        : 'This MP4 video track has no samples.'
    );
  }
  // The furthest any frame is shown, not the last one submitted: with
  // B-frames those are different samples, and this is where a loop
  // wraps.
  let durationUs = 0;
  let frameDurationUs = Infinity;
  for (const sample of samples) {
    durationUs = Math.max(durationUs, sample.timestampUs + sample.durationUs);
    if (sample.durationUs > 0 && sample.durationUs < frameDurationUs) {
      frameDurationUs = sample.durationUs;
    }
  }
  return {
    codec: table.codec,
    codedWidth: table.codedWidth,
    codedHeight: table.codedHeight,
    description: table.description,
    samples,
    durationUs,
    // A track whose every sample claims zero duration says nothing
    // about its rate, so it is paced as sixty rather than as infinity.
    frameDurationUs: Number.isFinite(frameDurationUs) ? frameDurationUs : Math.round(1_000_000 / 60)
  };
}

function findVideoTrack(reader: Reader, moov: BoxHeader): SampleTable | null {
  let found: SampleTable | null = null;
  walkBoxes(reader, moov.start, moov.end, trak => {
    if (trak.type !== 'trak' || found !== null) {
      return;
    }
    const table = readTrack(reader, trak);
    if (table !== null) {
      found = table;
    }
  });
  return found;
}

function readTrack(reader: Reader, trak: BoxHeader): SampleTable | null {
  let mdia: BoxHeader | null = null;
  walkBoxes(reader, trak.start, trak.end, box => {
    if (box.type === 'mdia') {
      mdia = box;
    }
  });
  if (mdia === null) {
    return null;
  }
  const media = mdia as BoxHeader;
  let timescale = 0;
  let isVideo = false;
  let minf: BoxHeader | null = null;
  walkBoxes(reader, media.start, media.end, box => {
    if (box.type === 'mdhd') {
      const version = readFullBoxVersion(reader);
      if (version === 1) {
        reader.skip(16);
        timescale = reader.u32();
      } else {
        reader.skip(8);
        timescale = reader.u32();
      }
      return;
    }
    if (box.type === 'hdlr') {
      readFullBoxVersion(reader);
      reader.skip(4);
      isVideo = reader.ascii(4) === 'vide';
      return;
    }
    if (box.type === 'minf') {
      minf = box;
    }
  });
  if (!isVideo || minf === null || timescale <= 0) {
    return null;
  }
  let stbl: BoxHeader | null = null;
  walkBoxes(reader, (minf as BoxHeader).start, (minf as BoxHeader).end, box => {
    if (box.type === 'stbl') {
      stbl = box;
    }
  });
  if (stbl === null) {
    return null;
  }
  return readSampleTable(reader, stbl as BoxHeader, timescale);
}

function readSampleTable(reader: Reader, stbl: BoxHeader, timescale: number): SampleTable | null {
  const table: SampleTable = {
    timescale,
    deltas: [],
    compositionOffsets: [],
    sizes: [],
    chunkOffsets: [],
    chunkRuns: [],
    syncSamples: [],
    codec: '',
    codedWidth: 0,
    codedHeight: 0
  };

  walkBoxes(reader, stbl.start, stbl.end, box => {
    switch (box.type) {
      case 'stsd':
        readSampleDescription(reader, box, table);
        break;
      case 'stts': {
        readFullBoxVersion(reader);
        const entries = reader.u32();
        for (let index = 0; index < entries; index++) {
          const count = reader.u32();
          const delta = reader.u32();
          for (let n = 0; n < count; n++) {
            table.deltas.push(delta);
          }
        }
        break;
      }
      case 'ctts': {
        const version = readFullBoxVersion(reader);
        const entries = reader.u32();
        for (let index = 0; index < entries; index++) {
          const count = reader.u32();
          // Version 1 offsets are signed; version 0's are specified
          // unsigned but written signed by plenty of encoders, and
          // reading them signed is what every player does.
          const offset = version === 1 ? reader.i32() : reader.i32();
          for (let n = 0; n < count; n++) {
            table.compositionOffsets.push(offset);
          }
        }
        break;
      }
      case 'stsz': {
        readFullBoxVersion(reader);
        const uniform = reader.u32();
        const count = reader.u32();
        for (let index = 0; index < count; index++) {
          table.sizes.push(uniform === 0 ? reader.u32() : uniform);
        }
        break;
      }
      case 'stz2': {
        readFullBoxVersion(reader);
        reader.skip(3);
        const fieldSize = reader.u8();
        const count = reader.u32();
        for (let index = 0; index < count; index++) {
          if (fieldSize === 16) {
            table.sizes.push(reader.u16());
          } else if (fieldSize === 8) {
            table.sizes.push(reader.u8());
          } else {
            // 4-bit sizes pack two samples per byte.
            const pair = reader.u8();
            table.sizes.push(pair >> 4);
            if (index + 1 < count) {
              table.sizes.push(pair & 0x0f);
              index++;
            }
          }
        }
        break;
      }
      case 'stsc': {
        readFullBoxVersion(reader);
        const entries = reader.u32();
        for (let index = 0; index < entries; index++) {
          const firstChunk = reader.u32();
          const samplesPerChunk = reader.u32();
          reader.skip(4);
          table.chunkRuns.push({ firstChunk, samplesPerChunk });
        }
        break;
      }
      case 'stco': {
        readFullBoxVersion(reader);
        const entries = reader.u32();
        for (let index = 0; index < entries; index++) {
          table.chunkOffsets.push(reader.u32());
        }
        break;
      }
      case 'co64': {
        readFullBoxVersion(reader);
        const entries = reader.u32();
        for (let index = 0; index < entries; index++) {
          table.chunkOffsets.push(reader.u64());
        }
        break;
      }
      case 'stss': {
        readFullBoxVersion(reader);
        const entries = reader.u32();
        for (let index = 0; index < entries; index++) {
          table.syncSamples.push(reader.u32());
        }
        break;
      }
      default:
        break;
    }
  });

  return table.codec === '' ? null : table;
}

/**
 * The visual sample entry, and the codec configuration inside it.
 *
 * The 78 bytes skipped are `VisualSampleEntry`'s fixed fields, which
 * nothing here needs beyond the width and height: six reserved bytes
 * and a data reference index, then sixteen pre-defined/reserved, the
 * dimensions, two resolutions, a reserved word, a frame count, a
 * thirty-two byte compressor name, a depth and a pre-defined.
 */
function readSampleDescription(reader: Reader, stsd: BoxHeader, table: SampleTable): void {
  readFullBoxVersion(reader);
  const entries = reader.u32();
  if (entries === 0) {
    return;
  }
  const entry = readBoxHeader(reader, stsd.end);
  if (entry === null) {
    return;
  }
  reader.skip(6);
  reader.skip(2);
  reader.skip(16);
  table.codedWidth = reader.u16();
  table.codedHeight = reader.u16();
  reader.skip(4 + 4 + 4 + 2 + 32 + 2 + 2);
  const format = entry.type;
  walkBoxes(reader, reader.offset, entry.end, child => {
    if (child.type === 'avcC') {
      const record = reader.bytes(child.end - child.start);
      table.description = record;
      // `avc1.PPCCLL`: profile, constraint flags and level, straight
      // out of the record's second, third and fourth bytes.
      const profile = record[1] ?? 0;
      const compat = record[2] ?? 0;
      const level = record[3] ?? 0;
      table.codec = `${format}.${hex2(profile)}${hex2(compat)}${hex2(level)}`;
      return;
    }
    if (child.type === 'hvcC') {
      table.description = reader.bytes(child.end - child.start);
      // A full HEVC codec string needs the general profile space,
      // tier, compatibility flags and six constraint bytes assembled
      // in a particular order. Chrome accepts the bare format with a
      // description, and getting it subtly wrong is worse than not
      // claiming it.
      table.codec = format;
      return;
    }
    if (child.type === 'av1C' || child.type === 'vpcC') {
      table.description = reader.bytes(child.end - child.start);
      table.codec = format;
    }
  });
  if (table.codec === '') {
    // No configuration box: an in-band codec, or one this does not
    // know. The format alone is a legitimate codec string for some of
    // them, and `VideoDecoder.isConfigSupported` is the right judge.
    table.codec = format;
  }
}

function hex2(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Walks the sample tables into a flat list.
 *
 * The one piece of real arithmetic in this file: `stsc` describes runs
 * of chunks that share a sample count, `stco` says where each chunk
 * begins, and a sample's offset is its chunk's offset plus the sizes
 * of the samples before it *in that chunk*. Everything else is
 * accumulating deltas.
 */
function buildSamples(table: SampleTable): Mp4Sample[] {
  const { sizes, chunkOffsets, chunkRuns, deltas, compositionOffsets, syncSamples, timescale } = table;
  if (sizes.length === 0 || chunkOffsets.length === 0 || chunkRuns.length === 0) {
    return [];
  }
  const sync = syncSamples.length === 0 ? null : new Set(syncSamples);
  const samples: Mp4Sample[] = [];
  let sampleIndex = 0;
  let decodeTime = 0;

  for (const [runIndex, run] of chunkRuns.entries()) {
    const nextRun = chunkRuns[runIndex + 1];
    const lastChunk = nextRun === undefined ? chunkOffsets.length : nextRun.firstChunk - 1;
    for (let chunk = run.firstChunk; chunk <= lastChunk; chunk++) {
      let offset = chunkOffsets[chunk - 1];
      if (offset === undefined) {
        continue;
      }
      for (let n = 0; n < run.samplesPerChunk && sampleIndex < sizes.length; n++) {
        const size = sizes[sampleIndex]!;
        const delta = deltas[sampleIndex] ?? deltas[deltas.length - 1] ?? 0;
        const composition = compositionOffsets[sampleIndex] ?? 0;
        samples.push({
          offset,
          size,
          timestampUs: Math.round(((decodeTime + composition) * 1_000_000) / timescale),
          durationUs: Math.round((delta * 1_000_000) / timescale),
          // No `stss` at all means every sample is a sync sample, which
          // is what an all-intra track looks like.
          isKey: sync === null || sync.has(sampleIndex + 1)
        });
        offset += size;
        decodeTime += delta;
        sampleIndex++;
      }
    }
  }
  // Left in **decode** order, deliberately. A stream with B-frames
  // presents its frames out of the order they must be decoded in, and
  // `VideoDecoder` is fed in decode order and hands frames back in
  // presentation order — sorting here would submit a frame before the
  // one it references and the decoder would reject it.
  return samples;
}
