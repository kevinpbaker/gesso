/**
 * Just enough MPEG audio to feed an `AudioDecoder`, one arriving chunk
 * at a time.
 *
 * The sibling of `Mp4Demuxer`, and here for the same reason: WebCodecs
 * decodes and does not demux, so `AudioDecoder` takes
 * `EncodedAudioChunk`s and getting those out of an `.mp3` means
 * splitting the frames yourself. An `.mp3` has no container to walk,
 * only a run of self-describing frames, so this is a header parse
 * rather than a box tree.
 *
 * **It splits as the bytes arrive.** `Mp4Demuxer` parses a whole file
 * at once because a fifteen-second loop is small and its sample tables
 * live at the end. An `.mp3` is the opposite on both counts: a track
 * is megabytes, every frame describes itself, and
 * the bytes take longer to arrive than anything done with them takes
 * to run. So `push` takes whatever a stream reader just handed you,
 * returns the whole frames it can make from that and what it was
 * holding, and holds the partial tail for next time. Splitting the
 * whole of a five-minute track costs about 3 ms, so the incremental
 * shape is for latency rather than for throughput: it exists so the
 * first frames can be decoded while the rest is still on the wire.
 *
 * **What it understands.** MPEG-1, MPEG-2 and MPEG-2.5, layers I, II
 * and III, constant or variable bitrate, with an ID3v2 tag at the
 * front and junk anywhere. A Xing, Info or VBRI header frame is read
 * for what it knows about the file and then dropped, because it
 * carries no audio.
 *
 * **What it does not.** Free-format streams, whose frames declare no
 * bitrate and must be measured by finding the next header. They are
 * skipped as junk rather than mis-parsed into noise.
 */

/** How a stream's frames are shaped, read from the first one. */
export interface Mp3Format {
  readonly version: 'mpeg1' | 'mpeg2' | 'mpeg2.5';
  /** 1, 2 or 3. Nearly always 3. */
  readonly layer: 1 | 2 | 3;
  readonly sampleRate: number;
  /** 1 for mono, 2 for every stereo mode. */
  readonly channels: number;
  /** The first frame's bitrate in bits per second; a variable bitrate stream's later frames differ. */
  readonly bitrate: number;
  /** What one frame decodes to: 1152, or 576 for layer III below MPEG-1, or 384 for layer I. */
  readonly samplesPerFrame: number;
  /**
   * Frames in the whole stream, when a Xing, Info or VBRI header said
   * so. The only way to know a variable bitrate file's duration
   * without reading all of it, and absent from most constant bitrate
   * files, which do not need one.
   */
  readonly totalFrames?: number;
  /** Bytes in the whole stream, when the same header said so. */
  readonly totalBytes?: number;
}

/** One frame, ready to become an `EncodedAudioChunk`. */
export interface Mp3Frame {
  /** The frame's own bytes, header included. A view into memory this splitter no longer touches. */
  readonly bytes: Uint8Array;
  /** Where the frame began, in bytes from the first byte pushed. */
  readonly offset: number;
  /** What this frame decodes to. */
  readonly samples: number;
  /** Where the frame begins, in samples from the first audio frame. */
  readonly sampleOffset: number;
  /** The same position in microseconds, which is what WebCodecs takes. */
  readonly timestampUs: number;
  readonly durationUs: number;
}

// ---------------------------------------------------------------------------
// The header
// ---------------------------------------------------------------------------

/** Indexed by layer, then by the header's four bitrate bits, in kbps. */
const MPEG1_BITRATES: readonly (readonly number[])[] = [
  [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
  [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
  [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
];

const MPEG2_BITRATES: readonly (readonly number[])[] = [
  [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
  [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
];

/** Indexed by the header's two version bits, then its two rate bits. */
const SAMPLE_RATES: Readonly<Record<number, readonly number[]>> = {
  0: [11025, 12000, 8000],
  2: [22050, 24000, 16000],
  3: [44100, 48000, 32000]
};

const VERSIONS: Readonly<Record<number, Mp3Format['version']>> = {
  0: 'mpeg2.5',
  2: 'mpeg2',
  3: 'mpeg1'
};

/** The longest a frame can be: MPEG-1 layer II at 384 kbps and 32 kHz, with padding. */
const MAX_FRAME_BYTES = 1729;

/** A frame's four header bytes, read. */
export interface Mp3Header {
  readonly version: Mp3Format['version'];
  readonly layer: 1 | 2 | 3;
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitrate: number;
  readonly samples: number;
  /** The whole frame, header included. */
  readonly length: number;
  /** True when the mode bits say something other than mono, which is where a Xing header sits. */
  readonly stereo: boolean;
}

/**
 * The four bytes at `at`, read as a frame header, or null when they
 * are not one.
 *
 * Every reserved combination is a rejection rather than a guess: with
 * eleven sync bits, roughly one position in two thousand of arbitrary
 * data looks like the start of a header, and the reserved values are
 * most of what rules the impostors out.
 */
export function readMp3Header(bytes: Uint8Array, at: number): Mp3Header | null {
  if (at < 0 || at + 4 > bytes.length) {
    return null;
  }
  if (bytes[at] !== 0xff || (bytes[at + 1]! & 0xe0) !== 0xe0) {
    return null;
  }
  const versionBits = (bytes[at + 1]! >> 3) & 0x03;
  const layerBits = (bytes[at + 1]! >> 1) & 0x03;
  if (versionBits === 1 || layerBits === 0) {
    return null;
  }
  const rateBits = (bytes[at + 2]! >> 2) & 0x03;
  const bitrateBits = (bytes[at + 2]! >> 4) & 0x0f;
  // A bitrate of zero is the free format, whose frame length is not
  // declared anywhere; fifteen is reserved outright.
  if (rateBits === 3 || bitrateBits === 0 || bitrateBits === 15) {
    return null;
  }

  const version = VERSIONS[versionBits]!;
  const layer = (4 - layerBits) as 1 | 2 | 3;
  const mpeg1 = version === 'mpeg1';
  const bitrate = (mpeg1 ? MPEG1_BITRATES : MPEG2_BITRATES)[layer - 1]![bitrateBits]! * 1000;
  const sampleRate = SAMPLE_RATES[versionBits]![rateBits]!;
  const padding = (bytes[at + 2]! >> 1) & 0x01;
  const stereo = ((bytes[at + 3]! >> 6) & 0x03) !== 3;

  const samples = layer === 1 ? 384 : layer === 2 || mpeg1 ? 1152 : 576;
  const length =
    layer === 1
      ? (Math.floor((12 * bitrate) / sampleRate) + padding) * 4
      : Math.floor((samples / 8) * (bitrate / sampleRate)) + padding;
  if (length < 4 || length > MAX_FRAME_BYTES) {
    return null;
  }

  return { version, layer, sampleRate, channels: stereo ? 2 : 1, bitrate, samples, length, stereo };
}

/** Two headers describe the same stream when everything but the bitrate agrees. */
function alike(one: Mp3Header, other: Mp3Header): boolean {
  return one.version === other.version && one.layer === other.layer && one.sampleRate === other.sampleRate;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/**
 * The length of an ID3v2 tag beginning at byte zero, or zero when
 * there is none, or -1 when the first ten bytes have not arrived and
 * the question cannot be answered yet.
 */
function id3Length(bytes: Uint8Array): number {
  if (bytes.length < 3) {
    return bytes.length === 0 || bytes[0] === 0x49 ? -1 : 0;
  }
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return 0;
  }
  if (bytes.length < 10) {
    return -1;
  }
  // A syncsafe integer: seven bits per byte, so no byte can look like a sync word.
  const size =
    (bytes[6]! & 0x7f) * 0x200000 + (bytes[7]! & 0x7f) * 0x4000 + (bytes[8]! & 0x7f) * 0x80 + (bytes[9]! & 0x7f);
  // A footer, when the flags say there is one, is ten bytes more.
  return 10 + size + ((bytes[5]! & 0x10) !== 0 ? 10 : 0);
}

function ascii(bytes: Uint8Array, at: number, text: string): boolean {
  if (at + text.length > bytes.length) {
    return false;
  }
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[at + i] !== text.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

function u32(bytes: Uint8Array, at: number): number {
  return bytes[at]! * 0x1000000 + bytes[at + 1]! * 0x10000 + bytes[at + 2]! * 0x100 + bytes[at + 3]!;
}

/**
 * What a Xing, Info or VBRI header in this frame says about the whole
 * stream, or null when the frame carries audio like any other.
 *
 * Encoders put one in the first frame of a variable bitrate file so
 * that a player can know the duration without reading to the end, and
 * many put one in a constant bitrate file too, where it is called Info
 * instead. The frame decodes to silence either way, so a caller wants
 * the numbers and not the frame.
 */
function vbrHeader(frame: Uint8Array, head: Mp3Header): { totalFrames?: number; totalBytes?: number } | null {
  // Xing sits immediately after the side information, whose size is
  // fixed by the version and the channel mode.
  const sideInfo = head.version === 'mpeg1' ? (head.stereo ? 32 : 17) : head.stereo ? 17 : 9;
  const at = 4 + sideInfo;
  if (ascii(frame, at, 'Xing') || ascii(frame, at, 'Info')) {
    if (at + 8 > frame.length) {
      return {};
    }
    const flags = u32(frame, at + 4);
    let field = at + 8;
    const found: { totalFrames?: number; totalBytes?: number } = {};
    if ((flags & 0x01) !== 0) {
      if (field + 4 > frame.length) return found;
      found.totalFrames = u32(frame, field);
      field += 4;
    }
    if ((flags & 0x02) !== 0) {
      if (field + 4 > frame.length) return found;
      found.totalBytes = u32(frame, field);
    }
    return found;
  }
  // VBRI is Fraunhofer's, and always sits 32 bytes after the header.
  if (ascii(frame, 36, 'VBRI')) {
    if (frame.length < 54) {
      return {};
    }
    return { totalBytes: u32(frame, 44), totalFrames: u32(frame, 48) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The splitter
// ---------------------------------------------------------------------------

const EMPTY: readonly Mp3Frame[] = [];

/**
 * A stream of MPEG audio, split into frames as it arrives.
 *
 * ```ts
 * const frames = new Mp3Frames();
 * const reader = response.body.getReader();
 * for (;;) {
 *   const { done, value } = await reader.read();
 *   if (done) break;
 *   for (const frame of frames.push(value)) {
 *     decoder.decode(new EncodedAudioChunk({ type: 'key', ...frame }));
 *   }
 * }
 * ```
 *
 * Every frame of layer III is a key frame as WebCodecs counts them,
 * even though the bit reservoir means a frame may lean on up to 511
 * bytes of its predecessors. That is why decoding must begin at the
 * start of the stream rather than in the middle of it: the first
 * frames after an arbitrary offset decode to noise.
 */
export class Mp3Frames {
  /** Bytes pushed but not yet made into frames. */
  private carry: Uint8Array = new Uint8Array(0);
  /** Bytes consumed from the stream, which is what makes an offset absolute. */
  private consumed = 0;
  /** Still to skip from an ID3v2 tag that ran past the end of a chunk. */
  private skipping = 0;
  /** Nothing has been read yet, so the front of the stream may be a tag. */
  private atStart = true;
  /** A first frame has been confirmed by a second one behind it. */
  private locked = false;
  private shape: Mp3Format | null = null;
  private frames = 0;
  private samples = 0;

  /** How the stream is shaped, once its first frame has been read. */
  get format(): Mp3Format | null {
    return this.shape;
  }

  /** Audio frames returned so far, the dropped header frame not counted. */
  get frameCount(): number {
    return this.frames;
  }

  /** Samples those frames decode to, which is the duration read so far. */
  get sampleCount(): number {
    return this.samples;
  }

  /** Seconds of audio returned so far, or zero before the first frame. */
  get seconds(): number {
    return this.shape === null ? 0 : this.samples / this.shape.sampleRate;
  }

  /**
   * Take the next bytes of the stream and return every whole frame
   * they complete. The partial tail is held until the rest of it
   * arrives, so a caller may hand over chunks of any size, including
   * ones that end in the middle of a header.
   */
  push(bytes: Uint8Array): readonly Mp3Frame[] {
    if (bytes.length === 0) {
      return EMPTY;
    }
    this.append(bytes);
    return this.split(false);
  }

  /**
   * The stream has ended: return anything the tail still holds.
   *
   * Usually nothing, because `push` returns each frame the moment its
   * last byte arrives. It matters for a stream so short that no second
   * frame ever confirmed the first, which is otherwise held back
   * forever rather than risk locking onto an impostor.
   */
  flush(): readonly Mp3Frame[] {
    const rest = this.split(true);
    this.carry = new Uint8Array(0);
    return rest;
  }

  private append(bytes: Uint8Array): void {
    if (this.skipping > 0) {
      const skipped = Math.min(this.skipping, bytes.length);
      this.skipping -= skipped;
      this.consumed += skipped;
      bytes = bytes.subarray(skipped);
      if (bytes.length === 0) {
        return;
      }
    }
    if (this.carry.length === 0) {
      this.carry = bytes;
      return;
    }
    const joined = new Uint8Array(this.carry.length + bytes.length);
    joined.set(this.carry);
    joined.set(bytes, this.carry.length);
    this.carry = joined;
  }

  /**
   * Walk the carry, emitting frames, and leave behind whatever could
   * not be finished. `ending` allows a first frame to be taken on
   * trust, because there will be no later chunk to confirm it with.
   */
  private split(ending: boolean): readonly Mp3Frame[] {
    if (this.atStart) {
      const tag = id3Length(this.carry);
      if (tag === -1) {
        return EMPTY;
      }
      this.atStart = false;
      if (tag > 0) {
        const skipped = Math.min(tag, this.carry.length);
        this.skipping = tag - skipped;
        this.consumed += skipped;
        this.carry = this.carry.subarray(skipped);
        if (this.skipping > 0) {
          this.carry = new Uint8Array(0);
          return EMPTY;
        }
      }
    }

    const found: Mp3Frame[] = [];
    let at = 0;
    for (;;) {
      const head = readMp3Header(this.carry, at);
      if (head === null) {
        if (at + 4 > this.carry.length) {
          break;
        }
        at += 1;
        continue;
      }
      if (at + head.length > this.carry.length) {
        break;
      }
      if (!this.locked) {
        const next = readMp3Header(this.carry, at + head.length);
        if (next !== null && alike(head, next)) {
          this.locked = true;
        } else if (next === null && at + head.length + 4 > this.carry.length) {
          // Out of bytes rather than out of luck. Wait for the chunk
          // carrying the confirming header; only when the stream has
          // ended, and none is coming, is the frame taken on trust.
          if (!ending) {
            break;
          }
          this.locked = true;
        } else {
          at += 1;
          continue;
        }
      }

      const bytes = this.carry.subarray(at, at + head.length);
      const vbr = this.shape === null ? vbrHeader(bytes, head) : null;
      if (this.shape === null) {
        this.shape = {
          version: head.version,
          layer: head.layer,
          sampleRate: head.sampleRate,
          channels: head.channels,
          bitrate: head.bitrate,
          samplesPerFrame: head.samples,
          ...(vbr?.totalFrames === undefined ? {} : { totalFrames: vbr.totalFrames }),
          ...(vbr?.totalBytes === undefined ? {} : { totalBytes: vbr.totalBytes })
        };
      }
      if (vbr === null) {
        found.push({
          bytes,
          offset: this.consumed + at,
          samples: head.samples,
          sampleOffset: this.samples,
          timestampUs: Math.round((this.samples / head.sampleRate) * 1e6),
          durationUs: Math.round((head.samples / head.sampleRate) * 1e6)
        });
        this.frames += 1;
        this.samples += head.samples;
      }
      at += head.length;
    }

    if (at > 0) {
      this.consumed += at;
      this.carry = this.carry.subarray(at);
    }
    return found;
  }
}

/**
 * Split a whole `.mp3` at once, for a caller that already holds all of
 * it. The same walk `Mp3Frames` does, without the streaming.
 */
export function splitMp3Frames(bytes: Uint8Array): { format: Mp3Format | null; frames: readonly Mp3Frame[] } {
  const splitter = new Mp3Frames();
  const frames = [...splitter.push(bytes), ...splitter.flush()];
  return { format: splitter.format, frames };
}
