/**
 * Just enough ISO base media file format to feed a `VideoDecoder`.
 *
 * WebCodecs decodes; it does not demux. `VideoDecoder` takes
 * `EncodedVideoChunk`s and a `VideoDecoderConfig`, and getting those
 * out of an `.mp4` means walking the sample tables yourself. That is
 * what this does, and the reason it is here rather than a dependency
 * is that `gesso-core`'s only dependency is `@webgpu/types`: a
 * renderer that pulls in a general-purpose container parser to play a
 * demo video has bought a great deal it does not use.
 *
 * **What it understands.** Progressive (non-fragmented) MP4 with a
 * `moov` and a `mdat`: `stsd` (with `avcC` or `hvcC`), `stts`, `ctts`,
 * `stsc`, `stsz`/`stz2`, `stco`/`co64` and `stss`. That is what every
 * encoder writes by default and what the `-movflags +faststart` files
 * on the web are. Video tracks through `demuxMp4Video`, and audio
 * tracks through `demuxMp4Audio` — which reads the same tables and
 * differs only in which sample entry it understands.
 *
 * **What it does not.** Fragmented MP4 (`moof`/`traf`/`trun`), which
 * is what DASH and HLS segments are, and which is a different parse
 * rather than a harder one. It is detected and named rather than
 * mis-parsed into silence — a demuxer that returns zero samples for a
 * file the browser plays fine is a bug that takes an afternoon to
 * find.
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

/**
 * The audio track of an MP4, as far as this reads it.
 *
 * Deliberately the same shape as `Mp4VideoTrack` where the two agree,
 * because the sample tables they come out of are the same tables: only
 * the sample *entry* differs, and only in which fields it carries.
 *
 * **Nothing in this framework plays it, and that is not this file's
 * problem.** `AudioContext` does not exist on a worker, so sound is
 * the shell's to play — see `VideoClock` for the arrangement and why
 * it inverts which of the two owns time. What the demuxer is for here
 * is the question that comes *before* that one: whether this clip has
 * sound at all, and what it would take to decode it. A player that
 * cannot answer that has to guess whether to show a mute button.
 */
export interface Mp4AudioTrack {
  /** A codec string for `AudioDecoder.configure`, e.g. `mp4a.40.2`. */
  readonly codec: string;
  readonly sampleRate: number;
  readonly channels: number;
  /** Bits per sample as the container declares them; 16 for nearly everything. */
  readonly sampleSize: number;
  /**
   * The decoder configuration, where the codec keeps one out of band.
   * For AAC this is the `AudioSpecificConfig` out of the `esds`, which
   * `AudioDecoder` takes as its `description`.
   */
  readonly description?: Uint8Array;
  readonly samples: readonly Mp4Sample[];
  readonly durationUs: number;
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

/** The same, for the boxes whose flags say which fields are present. */
function readFullBox(reader: Reader): { version: number; flags: number } {
  const version = reader.u8();
  const flags = (reader.u8() << 16) | (reader.u8() << 8) | reader.u8();
  return { version, flags };
}

/**
 * The per-track defaults a fragmented file states once, in `trex`.
 *
 * A fragment that omits a sample's duration, size or flags means "the
 * default", and the default is here rather than in the fragment —
 * which is the whole economy of the format: a `trun` for two hundred
 * samples of constant-bitrate video can be a header and nothing else.
 */
interface TrackExtends {
  readonly trackId: number;
  readonly defaultSampleDuration: number;
  readonly defaultSampleSize: number;
  readonly defaultSampleFlags: number;
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
  /** From `tkhd`; what a fragment's `tfhd` names to say which track it belongs to. */
  trackId: number;
  /** Audio only; zero on a video track. */
  sampleRate: number;
  channels: number;
  sampleSize: number;
}

/** Which handler a track declares: the one field that says what it is. */
type TrackKind = 'vide' | 'soun';

/**
 * Reads the first video track out of an MP4.
 *
 * Throws with a description of what it found rather than returning
 * something empty: a caller that asked for a video and got no samples
 * cannot tell "this file has no video track" from "this parser does
 * not understand this file", and those want different fixes.
 */
export function demuxMp4Video(data: ArrayBuffer): Mp4VideoTrack {
  const { reader, moov, moofs, sawFtyp } = openMp4(data);
  if (!sawFtyp && moov === null) {
    throw new Error('Not an MP4: no ftyp or moov box at the top level of the file.');
  }
  if (moov === null) {
    throw new Error('This MP4 has no moov box, so there is no sample table to read.');
  }

  const table = findTrack(reader, moov, 'vide');
  if (table === null) {
    throw new Error('This MP4 has no video track, or none this demuxer recognises.');
  }

  const samples = samplesOf(reader, table, moov, moofs);
  if (samples.length === 0) {
    throw new Error(
      moofs.length > 0
        ? 'This fragmented MP4 has no samples for its video track. Its fragments may be in other files: ' +
            'this reads the fragments in the buffer it was given, not an index of segments to fetch.'
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

/** The top-level walk both entry points start from. */
function openMp4(data: ArrayBuffer): {
  reader: Reader;
  moov: BoxHeader | null;
  moofs: BoxHeader[];
  sawFtyp: boolean;
} {
  const reader = new Reader(new DataView(data));
  const limit = data.byteLength;
  let moov: BoxHeader | null = null;
  const moofs: BoxHeader[] = [];
  let sawFtyp = false;
  walkBoxes(reader, 0, limit, box => {
    if (box.type === 'ftyp') {
      sawFtyp = true;
    } else if (box.type === 'moov') {
      moov = box;
    } else if (box.type === 'moof') {
      moofs.push(box);
    }
  });
  return { reader, moov, moofs, sawFtyp };
}

/**
 * Moves a track's presentation times so the first picture is at zero.
 *
 * **A file's earliest presentation timestamp is not required to be
 * zero, and for anything encoded with B-frames it is not.** A `ctts`
 * shifts each sample's composition time forward of its decode time,
 * and the shift applied to the first sample is the reorder depth: two
 * frames, for the clips x264 writes by default. So a plain six second
 * clip at 24fps has its first picture at 83333us and its last ending
 * at 6.083s, and a player that believed those numbers would report a
 * duration 83ms too long and, far worse, have no picture at all to
 * show for position zero.
 *
 * That last part is not hypothetical. It is exactly what a paused
 * clip looked like before this existed: `present(0)` found nothing
 * due, because nothing *was* due, and since a paused clip never asks
 * again the still stayed blank forever. A playing one hid it by
 * advancing past 83ms within two frames.
 *
 * Subtracting a constant keeps every sample's order, duration and
 * relationship to its neighbours; all it changes is where the clock
 * starts. Which is what an edit list would usually be doing, and is
 * the part of one worth having.
 */
function rebaseToZero(samples: Mp4Sample[]): Mp4Sample[] {
  if (samples.length === 0) {
    return samples;
  }
  let earliest = Infinity;
  for (const sample of samples) {
    earliest = Math.min(earliest, sample.timestampUs);
  }
  if (earliest <= 0 || !Number.isFinite(earliest)) {
    return samples;
  }
  return samples.map(sample => ({ ...sample, timestampUs: sample.timestampUs - earliest }));
}

/**
 * A track's samples, from wherever this file keeps them.
 *
 * The two shapes are not a spectrum: a progressive file's samples are
 * in tables in the `moov` and a fragmented file's are described inline
 * in each `moof`, and a file is one or the other. `mvex` is the
 * declaration — a file that has it is fragmented even if this buffer
 * happens to hold no fragments yet — and the sample tables are the
 * fallback, so a file with neither comes back empty rather than
 * half-read.
 */
function samplesOf(reader: Reader, table: SampleTable, moov: BoxHeader, moofs: readonly BoxHeader[]): Mp4Sample[] {
  const defaults = readTrackExtends(reader, moov);
  const samples =
    defaults.size === 0 && moofs.length === 0
      ? buildSamples(table)
      : buildFragmentedSamples(reader, moofs, table, defaults);
  return rebaseToZero(samples);
}

function findTrack(reader: Reader, moov: BoxHeader, kind: TrackKind): SampleTable | null {
  let found: SampleTable | null = null;
  walkBoxes(reader, moov.start, moov.end, trak => {
    if (trak.type !== 'trak' || found !== null) {
      return;
    }
    const table = readTrack(reader, trak, kind);
    if (table !== null) {
      found = table;
    }
  });
  return found;
}

function readTrack(reader: Reader, trak: BoxHeader, kind: TrackKind): SampleTable | null {
  let mdia: BoxHeader | null = null;
  let trackId = 0;
  walkBoxes(reader, trak.start, trak.end, box => {
    if (box.type === 'tkhd') {
      const version = readFullBoxVersion(reader);
      // Creation and modification times, which are two words in
      // version 0 and two long words in version 1; the track id
      // follows them either way.
      reader.skip(version === 1 ? 16 : 8);
      trackId = reader.u32();
      return;
    }
    if (box.type === 'mdia') {
      mdia = box;
    }
  });
  if (mdia === null) {
    return null;
  }
  const media = mdia as BoxHeader;
  let timescale = 0;
  let matches = false;
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
      matches = reader.ascii(4) === kind;
      return;
    }
    if (box.type === 'minf') {
      minf = box;
    }
  });
  if (!matches || minf === null || timescale <= 0) {
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
  const table = readSampleTable(reader, stbl as BoxHeader, timescale, kind);
  if (table !== null) {
    table.trackId = trackId;
  }
  return table;
}

function readSampleTable(reader: Reader, stbl: BoxHeader, timescale: number, kind: TrackKind): SampleTable | null {
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
    codedHeight: 0,
    trackId: 0,
    sampleRate: 0,
    channels: 0,
    sampleSize: 0
  };

  walkBoxes(reader, stbl.start, stbl.end, box => {
    switch (box.type) {
      case 'stsd':
        if (kind === 'soun') {
          readAudioSampleDescription(reader, box, table);
        } else {
          readSampleDescription(reader, box, table);
        }
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
    if (child.type === 'av1C') {
      const record = reader.bytes(child.end - child.start);
      // Deliberately *not* kept as a description: AV1 carries its
      // sequence header in-band, and `VideoDecoder` rejects a config
      // that supplies one as well.
      table.codec = av1CodecString(format, record);
      return;
    }
    if (child.type === 'vpcC') {
      const record = reader.bytes(child.end - child.start);
      table.codec = vp9CodecString(format, record);
    }
  });
  if (table.codec === '') {
    // No configuration box: an in-band codec, or one this does not
    // know. The format alone is a legitimate codec string for some of
    // them, and `VideoDecoder.isConfigSupported` is the right judge.
    table.codec = format;
  }
}

/**
 * The audio sample entry, and the codec configuration inside it.
 *
 * The fixed fields are `AudioSampleEntry`'s: six reserved bytes and a
 * data reference index, then eight bytes that were a version, a
 * revision and a vendor in QuickTime and are reserved here, the
 * channel count, the sample size, two pre-defined and two reserved,
 * and a sample rate written as 16.16 fixed point — of which only the
 * whole part is ever meaningful, because no encoder writes a
 * fractional sample rate.
 *
 * **Version 1 and 2 entries are not read past their fixed fields.**
 * A version 1 `AudioSampleEntry` carries four extra fields and a
 * version 2 carries a different layout entirely; both are rare outside
 * QuickTime, and the child boxes this actually wants are found by
 * walking from the end of whichever header was read. Getting the
 * header length wrong would make that walk start mid-box and find
 * nothing, which is why the version is read rather than assumed.
 */
function readAudioSampleDescription(reader: Reader, stsd: BoxHeader, table: SampleTable): void {
  readFullBoxVersion(reader);
  const entries = reader.u32();
  if (entries === 0) {
    return;
  }
  const entry = readBoxHeader(reader, stsd.end);
  if (entry === null) {
    return;
  }
  reader.skip(6); // reserved
  reader.skip(2); // data_reference_index
  const version = reader.u16();
  reader.skip(6); // revision level and vendor, both reserved here
  table.channels = reader.u16();
  table.sampleSize = reader.u16();
  reader.skip(2); // pre_defined (compression id)
  reader.skip(2); // reserved (packet size)
  // 16.16 fixed point; the fraction is always zero in practice.
  table.sampleRate = reader.u16();
  reader.skip(2);
  if (version === 1) {
    // samples_per_packet, bytes_per_packet, bytes_per_frame, bytes_per_sample.
    reader.skip(16);
  } else if (version === 2) {
    // A wholly different layout whose length is written into it.
    reader.skip(36);
  }
  const format = entry.type;
  table.codec = format;
  walkBoxes(reader, reader.offset, entry.end, child => {
    if (child.type === 'esds') {
      readElementaryStreamDescriptor(reader, child, table, format);
      return;
    }
    if (child.type === 'dOps' || child.type === 'alac' || child.type === 'dfLa') {
      // Opus, ALAC and FLAC keep their configuration in a box of their
      // own rather than in an ES descriptor, and `AudioDecoder` takes
      // it as the description unchanged.
      table.description = reader.bytes(child.end - child.start);
    }
  });
}

/**
 * The `esds` box, for the two numbers a codec string needs.
 *
 * An ES descriptor is a little tag-length-value tree, and this walks
 * exactly as far into it as `mp4a.40.2` requires: the
 * `DecoderConfigDescriptor` for the object type indication (`40` for
 * MPEG-4 audio), and the `DecoderSpecificInfo` inside it, whose first
 * five bits are the audio object type (`2` for AAC-LC). That inner
 * payload is also the `AudioSpecificConfig` that `AudioDecoder` wants
 * as its description, so it is kept whole.
 *
 * Lengths are written in a variable-length form where the top bit of
 * each byte says another follows — the same encoding MIDI uses for
 * delta times and MP4 inherited from MPEG-4 systems.
 */
function readElementaryStreamDescriptor(reader: Reader, esds: BoxHeader, table: SampleTable, format: string): void {
  readFullBoxVersion(reader);
  const end = esds.end;

  const readLength = (): number => {
    let length = 0;
    for (let index = 0; index < 4; index++) {
      const byte = reader.u8();
      length = (length << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) {
        break;
      }
    }
    return length;
  };

  while (reader.offset < end) {
    const tag = reader.u8();
    const length = readLength();
    const payloadEnd = reader.offset + length;
    if (payloadEnd > end) {
      return;
    }
    if (tag === 0x03) {
      // ES_Descriptor: an id, then flags that decide what follows.
      reader.skip(2);
      const flags = reader.u8();
      if ((flags & 0x80) !== 0) {
        reader.skip(2); // dependsOn_ES_ID
      }
      if ((flags & 0x40) !== 0) {
        reader.skip(reader.u8()); // a URL, length-prefixed
      }
      if ((flags & 0x20) !== 0) {
        reader.skip(2); // OCR_ES_Id
      }
      // Its children follow in place, so do not skip to payloadEnd.
      continue;
    }
    if (tag === 0x04) {
      const objectType = reader.u8();
      reader.skip(12); // stream type, buffer size, max and average bitrate
      table.codec = `${format}.${objectType.toString(16)}`;
      continue;
    }
    if (tag === 0x05) {
      const config = reader.bytes(length);
      table.description = config;
      const first = config[0];
      if (first !== undefined) {
        const audioObjectType = first >> 3;
        // Only the five-bit form: an object type of 31 means the real
        // one is six more bits further in, and nothing that writes one
        // of those is playing in a browser.
        if (audioObjectType !== 0 && audioObjectType !== 31) {
          table.codec = `${table.codec}.${audioObjectType}`;
        }
      }
      return;
    }
    reader.offset = payloadEnd;
  }
}

/**
 * Reads the first audio track out of an MP4.
 *
 * Null rather than a throw for a file that simply has no audio, which
 * is the ordinary case for the clips this framework plays and is not
 * an error in any sense. A file that *has* an audio track this cannot
 * read still throws, for the reason `demuxMp4Video` gives: "no audio
 * track" and "an audio track I do not understand" want different
 * fixes.
 */
export function demuxMp4Audio(data: ArrayBuffer): Mp4AudioTrack | null {
  const { reader, moov, moofs } = openMp4(data);
  if (moov === null) {
    return null;
  }
  const table = findTrack(reader, moov, 'soun');
  if (table === null) {
    return null;
  }
  const samples = samplesOf(reader, table, moov, moofs);
  if (samples.length === 0) {
    throw new Error('This MP4 has an audio track with no samples this demuxer can read.');
  }
  let durationUs = 0;
  for (const sample of samples) {
    durationUs = Math.max(durationUs, sample.timestampUs + sample.durationUs);
  }
  return {
    codec: table.codec,
    sampleRate: table.sampleRate,
    channels: table.channels,
    sampleSize: table.sampleSize,
    description: table.description,
    samples,
    durationUs
  };
}

/**
 * `av01.0.04M.08`, out of the `av1C` record.
 *
 * The bare format is not a codec string for AV1 — `VideoDecoder`
 * answers `supported: false` for `av01` alone — so a file whose codec
 * was reported as just the format never played at all. Every field
 * below is in the record's first three bytes, which is the whole of
 * the fixed part of an `AV1CodecConfigurationRecord`:
 *
 *   byte 0: a marker bit and a version
 *   byte 1: seq_profile (3 bits), seq_level_idx_0 (5 bits)
 *   byte 2: seq_tier_0, high_bitdepth, twelve_bit, monochrome,
 *           chroma subsampling and sample position
 *
 * The string wants the profile, the level as two decimal digits, the
 * tier as `M` or `H`, and the bit depth as two decimal digits. Falls
 * back to the format for a record too short to read, where claiming a
 * precise string would be worse than claiming none.
 */
function av1CodecString(format: string, record: Uint8Array): string {
  const second = record[1];
  const third = record[2];
  if (second === undefined || third === undefined) {
    return format;
  }
  const profile = second >> 5;
  const level = second & 0x1f;
  const tier = (third & 0x80) !== 0 ? 'H' : 'M';
  const highBitDepth = (third & 0x40) !== 0;
  const twelveBit = (third & 0x20) !== 0;
  // Profile 2 is the only one where `high_bitdepth` can mean twelve;
  // everywhere else it means ten.
  const depth = twelveBit && profile === 2 ? 12 : highBitDepth ? 10 : 8;
  return `${format}.${profile}.${pad2(level)}${tier}.${pad2(depth)}`;
}

/**
 * `vp09.00.10.08`, out of the `vpcC` record.
 *
 * Here for the same reason the AV1 one is, and simpler: `vpcC` is a
 * full box, so a version and three flag bytes come first, and then the
 * profile, the level and a byte whose top four bits are the bit depth.
 */
function vp9CodecString(format: string, record: Uint8Array): string {
  const profile = record[4];
  const level = record[5];
  const packed = record[6];
  if (profile === undefined || level === undefined || packed === undefined) {
    return format;
  }
  return `${format}.${pad2(profile)}.${pad2(level)}.${pad2(packed >> 4)}`;
}

function pad2(value: number): string {
  return value.toString(10).padStart(2, '0');
}

function hex2(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * The `trex` defaults, one per track, out of `moov`/`mvex`.
 *
 * `mvex`'s presence is also the honest test for a fragmented file. The
 * `moof` boxes are the fragments, but a file may legitimately have its
 * first fragment far enough in that a parser has not reached one yet,
 * whereas `mvex` is in the `moov` and says up front that fragments are
 * how this file is built.
 */
function readTrackExtends(reader: Reader, moov: BoxHeader): Map<number, TrackExtends> {
  const defaults = new Map<number, TrackExtends>();
  walkBoxes(reader, moov.start, moov.end, box => {
    if (box.type !== 'mvex') {
      return;
    }
    walkBoxes(reader, box.start, box.end, child => {
      if (child.type !== 'trex') {
        return;
      }
      readFullBoxVersion(reader);
      const trackId = reader.u32();
      reader.skip(4); // default_sample_description_index
      defaults.set(trackId, {
        trackId,
        defaultSampleDuration: reader.u32(),
        defaultSampleSize: reader.u32(),
        defaultSampleFlags: reader.u32()
      });
    });
  });
  return defaults;
}

/**
 * Builds a track's samples out of the file's fragments.
 *
 * A fragmented MP4 says nothing up front about where its samples are:
 * there is no `stco`, no `stsz` and no `stts`, and the `stbl` in the
 * `moov` is a shell holding only the `stsd`. Instead each `moof`
 * carries a `traf` per track, and each `traf` a `trun` per run of
 * samples, describing sizes and durations inline — with anything
 * omitted falling back to a default from `tfhd`, and failing that from
 * `trex`. So this is a walk rather than a table lookup, and it is why
 * the two shapes could not share `buildSamples`.
 *
 * **Offsets are the part that goes wrong.** A sample's position is
 * `base_data_offset` plus the `trun`'s own `data_offset` plus the
 * sizes of the samples before it in that run, and `base_data_offset`
 * is one of three things: written into the `tfhd`, or the start of
 * the enclosing `moof` when `default-base-is-moof` is set, or — for
 * the first `traf` — the `moof` again by the specification's older
 * rule. The second of those is what every fragmenter writes today and
 * what makes a fragment self-contained; taking the first `traf` rule
 * as the general one puts every fragment after the first at the wrong
 * offset, which decodes as noise rather than as an error.
 *
 * **Times accumulate across fragments.** `tfdt` states the decode time
 * a fragment starts at, and where it is absent the fragment continues
 * from wherever the last one ended.
 */
function buildFragmentedSamples(
  reader: Reader,
  moofs: readonly BoxHeader[],
  table: SampleTable,
  defaults: Map<number, TrackExtends>
): Mp4Sample[] {
  const samples: Mp4Sample[] = [];
  const trex = defaults.get(table.trackId);
  let decodeTime = 0;

  for (const moof of moofs) {
    // `moof.start` is the payload; the box itself begins eight bytes
    // earlier, and that is what the offsets are relative to.
    const moofStart = moof.start - 8;
    walkBoxes(reader, moof.start, moof.end, traf => {
      if (traf.type !== 'traf') {
        return;
      }
      let trackId = 0;
      let baseDataOffset = moofStart;
      let defaultDuration = trex?.defaultSampleDuration ?? 0;
      let defaultSize = trex?.defaultSampleSize ?? 0;
      let defaultFlags = trex?.defaultSampleFlags ?? 0;
      const runs: { header: BoxHeader; at: number }[] = [];
      let fragmentTime: number | null = null;

      walkBoxes(reader, traf.start, traf.end, child => {
        if (child.type === 'tfhd') {
          const { flags } = readFullBox(reader);
          trackId = reader.u32();
          if ((flags & 0x000001) !== 0) {
            baseDataOffset = reader.u64();
          }
          if ((flags & 0x000002) !== 0) {
            reader.skip(4); // sample_description_index
          }
          if ((flags & 0x000008) !== 0) {
            defaultDuration = reader.u32();
          }
          if ((flags & 0x000010) !== 0) {
            defaultSize = reader.u32();
          }
          if ((flags & 0x000020) !== 0) {
            defaultFlags = reader.u32();
          }
          return;
        }
        if (child.type === 'tfdt') {
          const version = readFullBoxVersion(reader);
          fragmentTime = version === 1 ? reader.u64() : reader.u32();
          return;
        }
        if (child.type === 'trun') {
          runs.push({ header: child, at: child.start });
        }
      });

      if (trackId !== table.trackId) {
        return;
      }
      if (fragmentTime !== null) {
        decodeTime = fragmentTime;
      }

      for (const run of runs) {
        reader.offset = run.at;
        const { version, flags } = readFullBox(reader);
        const count = reader.u32();
        let offset = baseDataOffset;
        if ((flags & 0x000001) !== 0) {
          offset += reader.i32();
        }
        const firstFlags = (flags & 0x000004) !== 0 ? reader.u32() : null;
        for (let index = 0; index < count; index++) {
          const duration = (flags & 0x000100) !== 0 ? reader.u32() : defaultDuration;
          const size = (flags & 0x000200) !== 0 ? reader.u32() : defaultSize;
          const sampleFlags =
            (flags & 0x000400) !== 0 ? reader.u32() : index === 0 && firstFlags !== null ? firstFlags : defaultFlags;
          // Signed from version 1 on, and written signed by every
          // fragmenter even in version 0 — the same reading `ctts`
          // takes, and for the same reason.
          const composition = (flags & 0x000800) !== 0 ? (version === 0 ? reader.i32() : reader.i32()) : 0;
          samples.push({
            offset,
            size,
            timestampUs: Math.round(((decodeTime + composition) * 1_000_000) / table.timescale),
            durationUs: Math.round((duration * 1_000_000) / table.timescale),
            // Bit 16 of the sample flags is `sample_is_non_sync_sample`,
            // so a keyframe is the one with it clear.
            isKey: (sampleFlags & 0x00010000) === 0
          });
          offset += size;
          decodeTime += duration;
        }
      }
    });
  }
  return samples;
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
