/**
 * A very small MP4 writer, and a decoder that decodes nothing.
 *
 * Both exist for the same reason the demuxer's spec gives for building
 * its files by hand: a fixture `.mp4` is a better test of reality and
 * a worse test of this code, because when it fails you do not know
 * which of forty boxes was misread. Building the file means a spec can
 * name the exact field it is about, and construct the awkward cases —
 * a chunk holding several samples, composition offsets reordering
 * them, a track with no `stss` — rather than hunting for a file that
 * has one.
 *
 * In `gesso-core/testing` rather than beside a spec because two specs
 * now want it: the demuxer's, which reads these files, and the
 * resolver's, which plays them.
 */

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
export function box(type: string, ...payload: number[][]): number[] {
  const body = payload.flat();
  return [...u32(body.length + 8), ...ascii(type), ...body];
}

/** A full box: a version and three flag bytes before the payload. */
export function fullBox(type: string, version: number, ...payload: number[][]): number[] {
  return box(type, [version, 0, 0, 0], ...payload);
}

/** An AAC audio track, for a file that has sound as well as pictures. */
export interface AudioTrackSpec {
  timescale: number;
  deltas: { count: number; delta: number }[];
  sizes: number[];
  chunkOffsets: number[];
  chunkRuns: { firstChunk: number; samplesPerChunk: number }[];
  channels: number;
  sampleRate: number;
  /**
   * The `AudioSpecificConfig`, whose top five bits are the audio
   * object type. The default is AAC-LC at 44.1kHz stereo, which is
   * `mp4a.40.2` and what nearly every file on the web carries.
   */
  config?: number[];
}

export interface TrackSpec {
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
  /** The sample entry's four character code. `avc1` unless said otherwise. */
  codec?: 'avc1' | 'av01' | 'vp09';
  /** The bytes of the configuration record after any fixed header; see `configurationBox`. */
  configBytes?: number[];
}

/**
 * The codec configuration box, which differs per codec and is where a
 * codec string comes from.
 */
function configurationBox(spec: TrackSpec): number[] {
  if (spec.codec === 'av01') {
    // marker+version, then seq_profile/seq_level_idx, then the tier
    // and bit depth flags.
    return box('av1C', [0x81, ...(spec.configBytes ?? [0x04, 0x00])]);
  }
  if (spec.codec === 'vp09') {
    // A full box: version and flags, then profile, level and a byte
    // whose top nibble is the bit depth.
    return fullBox('vpcC', 1, spec.configBytes ?? [0x00, 0x1f, 0x80]);
  }
  // `avc1`: length, profile, compat, level, then whatever follows.
  return box('avcC', [1, 0x64, 0x00, 0x1f, 0xff, 0xe1]);
}

function visualSampleEntry(spec: TrackSpec): number[] {
  return box(
    spec.codec ?? 'avc1',
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
    configurationBox(spec)
  );
}

/** `esds`: the descriptor tree down to the two numbers a codec string needs. */
function esds(spec: AudioTrackSpec): number[] {
  const config = spec.config ?? [0x12, 0x10];
  // DecoderSpecificInfo (tag 5)
  const dsi = [0x05, config.length, ...config];
  // DecoderConfigDescriptor (tag 4): object type 0x40 is MPEG-4 audio,
  // then a stream type, a buffer size and two bitrates.
  // Thirteen bytes of header: an object type indication, a stream
  // type, three bytes of buffer size, and two four-byte bitrates.
  const dcd = [0x04, 13 + dsi.length, 0x40, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...dsi];
  // ES_Descriptor (tag 3): an id and a flags byte with nothing set.
  const esd = [0x03, 3 + dcd.length, 0, 1, 0, ...dcd];
  return fullBox('esds', 0, esd);
}

function audioSampleEntry(spec: AudioTrackSpec): number[] {
  return box(
    'mp4a',
    [0, 0, 0, 0, 0, 0], // reserved
    u16(1), // data_reference_index
    u16(0), // version
    [0, 0, 0, 0, 0, 0], // revision and vendor
    u16(spec.channels),
    u16(16), // sample size
    u16(0), // pre_defined
    u16(0), // reserved
    u16(spec.sampleRate), // 16.16 fixed, whole part
    u16(0),
    esds(spec)
  );
}

function audioSampleTable(spec: AudioTrackSpec): number[] {
  return box(
    'stbl',
    fullBox('stsd', 0, u32(1), audioSampleEntry(spec)),
    fullBox('stts', 0, u32(spec.deltas.length), ...spec.deltas.map(run => [...u32(run.count), ...u32(run.delta)])),
    fullBox(
      'stsc',
      0,
      u32(spec.chunkRuns.length),
      ...spec.chunkRuns.map(run => [...u32(run.firstChunk), ...u32(run.samplesPerChunk), ...u32(1)])
    ),
    fullBox('stsz', 0, u32(0), u32(spec.sizes.length), ...spec.sizes.map(size => u32(size))),
    fullBox('stco', 0, u32(spec.chunkOffsets.length), ...spec.chunkOffsets.map(offset => u32(offset)))
  );
}

function audioTrak(spec: AudioTrackSpec): number[] {
  return box(
    'trak',
    box(
      'mdia',
      fullBox('mdhd', 0, u32(0), u32(0), u32(spec.timescale), u32(1000)),
      fullBox(
        'hdlr',
        0,
        u32(0),
        ascii('soun'),
        Array.from({ length: 12 }, () => 0),
        [0]
      ),
      box('minf', audioSampleTable(spec))
    )
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

export function buildMp4(spec: TrackSpec, options: { fragmented?: boolean; audio?: AudioTrackSpec } = {}): ArrayBuffer {
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
      trak,
      ...(options.audio === undefined ? [] : [audioTrak(options.audio)])
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

/** One run of samples inside a fragment. */
export interface FragmentSpec {
  /** Decode time the fragment starts at, in the track's timescale. Omitted means "carry on". */
  baseMediaDecodeTime?: number;
  samples: { duration: number; size: number; isKey: boolean }[];
}

export interface FragmentedSpec {
  trackId: number;
  timescale: number;
  width: number;
  height: number;
  fragments: FragmentSpec[];
  /** Written into `trex`, and used by any sample whose `trun` omits the field. */
  defaultSampleDuration?: number;
  defaultSampleSize?: number;
  /** Leave a field out of the `trun` so the default has to supply it. */
  omit?: { duration?: boolean; size?: boolean };
}

function tkhd(trackId: number): number[] {
  return fullBox(
    'tkhd',
    0,
    u32(0), // creation time
    u32(0), // modification time
    u32(trackId),
    Array.from({ length: 68 }, () => 0)
  );
}

/**
 * A fragmented MP4: a `moov` that describes the track and promises
 * fragments, then the fragments.
 *
 * The `stbl` is a shell — `stsd` and four empty tables — which is what
 * a fragmenter writes and is exactly the shape that used to make this
 * demuxer return zero samples for a file the browser played.
 */
export function buildFragmentedMp4(spec: FragmentedSpec): ArrayBuffer {
  const shellSpec: TrackSpec = {
    timescale: spec.timescale,
    deltas: [],
    sizes: [],
    chunkOffsets: [],
    chunkRuns: [],
    width: spec.width,
    height: spec.height
  };
  const trak = box(
    'trak',
    tkhd(spec.trackId),
    box(
      'mdia',
      fullBox('mdhd', 0, u32(0), u32(0), u32(spec.timescale), u32(1000)),
      fullBox(
        'hdlr',
        0,
        u32(0),
        ascii('vide'),
        Array.from({ length: 12 }, () => 0),
        [0]
      ),
      box('minf', sampleTable(shellSpec))
    )
  );
  const mvex = box(
    'mvex',
    fullBox(
      'trex',
      0,
      u32(spec.trackId),
      u32(1), // default_sample_description_index
      u32(spec.defaultSampleDuration ?? 0),
      u32(spec.defaultSampleSize ?? 0),
      u32(0) // default_sample_flags
    )
  );
  const moov = box(
    'moov',
    fullBox(
      'mvhd',
      0,
      Array.from({ length: 100 }, () => 0)
    ),
    trak,
    mvex
  );

  const bytes = [...box('ftyp', ascii('isom'), u32(512), ascii('isomiso6avc1mp41')), ...moov];

  for (const fragment of spec.fragments) {
    const payloadSize = fragment.samples.reduce((total, sample) => total + sample.size, 0);
    // Built twice: the `trun`'s data offset is relative to the start
    // of the `moof` box, and is not known until the `moof` has been
    // sized. The first pass is only for its length.
    const build = (dataOffset: number): number[] => {
      const trunFlags =
        0x000001 | // data-offset-present
        (spec.omit?.duration === true ? 0 : 0x000100) |
        (spec.omit?.size === true ? 0 : 0x000200) |
        0x000400; // sample-flags-present
      const entries = fragment.samples.flatMap(sample => [
        ...(spec.omit?.duration === true ? [] : u32(sample.duration)),
        ...(spec.omit?.size === true ? [] : u32(sample.size)),
        // Bit 16 set means "not a sync sample".
        ...u32(sample.isKey ? 0 : 0x00010000)
      ]);
      const trun = box(
        'trun',
        [0, (trunFlags >> 16) & 0xff, (trunFlags >> 8) & 0xff, trunFlags & 0xff],
        u32(fragment.samples.length),
        u32(dataOffset),
        entries
      );
      const tfhdFlags = 0x020000; // default-base-is-moof
      const traf = box(
        'traf',
        box('tfhd', [0, (tfhdFlags >> 16) & 0xff, (tfhdFlags >> 8) & 0xff, tfhdFlags & 0xff], u32(spec.trackId)),
        ...(fragment.baseMediaDecodeTime === undefined ? [] : [fullBox('tfdt', 0, u32(fragment.baseMediaDecodeTime))]),
        trun
      );
      return box('moof', fullBox('mfhd', 0, u32(1)), traf);
    };
    const sized = build(0);
    // The `mdat` payload begins eight bytes past the end of the `moof`.
    const moof = build(sized.length + 8);
    bytes.push(
      ...moof,
      ...box(
        'mdat',
        Array.from({ length: payloadSize }, () => 0x42)
      )
    );
  }
  return new Uint8Array(bytes).buffer;
}

/** The offset `mdat`'s payload lands at, for a table that must point into it. */
export function mdatStart(data: ArrayBuffer): number {
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

/** One chunk as the fake decoder saw it. */
export interface DecodedChunk {
  readonly timestamp: number;
  readonly type: 'key' | 'delta';
}

/**
 * A `VideoDecoder` that records what it was asked to decode and hands
 * back a frame for each.
 *
 * What the resolver's spec is about is *which samples are submitted*:
 * a seek that starts at the wrong keyframe, or one that decodes the
 * whole clip to get somewhere, is a bug in arithmetic that has nothing
 * to do with pixels. So this decodes nothing and the frames it emits
 * carry a timestamp and a `close` and no image at all.
 *
 * Emission is synchronous, which a real decoder's never is. That makes
 * the specs readable and is the one way this lies: the ordering
 * hazards a real decoder creates — a frame arriving after the position
 * has moved past it — are `Mp4Playback`'s to handle and are asserted
 * by pushing frames in by hand rather than by waiting for a thread.
 */
export class FakeVideoDecoder {
  static readonly submitted: DecodedChunk[] = [];
  /** How many times a decoder was configured: a seek costs one. */
  static configures = 0;
  static resets = 0;
  /** Set to stop frames being emitted, for a spec about a queue filling up. */
  static emit = true;

  static install(): () => void {
    const scope = globalThis as Record<string, unknown>;
    const previous = {
      VideoDecoder: scope.VideoDecoder,
      EncodedVideoChunk: scope.EncodedVideoChunk,
      VideoFrame: scope.VideoFrame,
      createImageBitmap: scope.createImageBitmap
    };
    FakeVideoDecoder.reset();
    scope.VideoDecoder = FakeVideoDecoder;
    scope.EncodedVideoChunk = class {
      readonly timestamp: number;
      readonly type: 'key' | 'delta';
      constructor(init: { timestamp: number; type: 'key' | 'delta' }) {
        this.timestamp = init.timestamp;
        this.type = init.type;
      }
    };
    scope.VideoFrame = class {};
    // Left undefined so `MutableVideoSurface` takes the path that keeps
    // the frame itself: converting to a bitmap is asynchronous and
    // would put every assertion behind a microtask for no gain.
    scope.createImageBitmap = undefined;
    return () => Object.assign(scope, previous);
  }

  static reset(): void {
    FakeVideoDecoder.submitted.length = 0;
    FakeVideoDecoder.configures = 0;
    FakeVideoDecoder.resets = 0;
    FakeVideoDecoder.emit = true;
  }

  /** Every timestamp submitted since the last configure, in order. */
  static get sinceConfigure(): number[] {
    return FakeVideoDecoder.submitted.map(chunk => chunk.timestamp);
  }

  static isConfigSupported(): Promise<{ supported: boolean }> {
    return Promise.resolve({ supported: true });
  }

  state: 'unconfigured' | 'configured' | 'closed' = 'unconfigured';
  decodeQueueSize = 0;
  private readonly output: (frame: { timestamp: number; close(): void }) => void;

  constructor(init: { output: (frame: { timestamp: number; close(): void }) => void; error: (e: unknown) => void }) {
    this.output = init.output;
  }

  configure(): void {
    this.state = 'configured';
    FakeVideoDecoder.configures++;
  }

  decode(chunk: DecodedChunk): void {
    FakeVideoDecoder.submitted.push({ timestamp: chunk.timestamp, type: chunk.type });
    if (!FakeVideoDecoder.emit) {
      this.decodeQueueSize++;
      return;
    }
    this.output({ timestamp: chunk.timestamp, close: () => {} });
  }

  reset(): void {
    FakeVideoDecoder.resets++;
    this.decodeQueueSize = 0;
    this.state = 'unconfigured';
  }

  close(): void {
    this.state = 'closed';
  }
}
