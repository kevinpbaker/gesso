import type { UiVideoSurface } from '../properties/UiVideo';
import { bufferSource, DEFAULT_BLOCK_SIZE, rangeSource, type ByteSource } from './ByteSource';
import { demuxMp4Video, type Mp4Sample, type Mp4VideoTrack } from './Mp4Demuxer';

/**
 * A playing video: one surface, and the controls over it.
 *
 * `surface` is the same object for the whole life of the playback, and
 * that is load-bearing — see `UiVideo.ts` for what the WebGPU texture
 * cache does with it.
 */
export interface VideoPlayback {
  readonly surface: UiVideoSurface;
  readonly width: number;
  readonly height: number;
  /** Seconds. Zero until the container has been read. */
  readonly duration: number;
  /**
   * How often the picture can change, in milliseconds.
   *
   * Playback is driven by whoever owns time, and this is what that
   * driver needs to pace itself: sampling this often never misses a
   * frame, and sampling faster only discovers that nothing changed.
   * Without it a playing video has to ask for *every* frame the clock
   * will give — which on a display-paced runtime means a 30fps clip
   * waking a 165Hz app 165 times a second to present the same picture
   * five times running.
   */
  readonly frameDurationMs: number;
  /**
   * How far into the video this playback has got, in milliseconds.
   *
   * What an arriving element needs in order to pick up where a
   * departing one left off. The reference counting keeps the decoder
   * alive across a navigation, but the *position* belongs to whoever
   * is driving, and a node that has just been built has no idea where
   * that is — so without this it starts at zero, which on a shared
   * playback is a seek backwards and a decoder reset.
   */
  readonly positionMs: number;
  /**
   * Shows the frame due at `positionMs` into the video, and says
   * whether that changed the picture.
   *
   * A pure function of a position rather than something that runs on a
   * clock of its own: whoever is driving owns time. In an app that is
   * the animation driver, through `videoSource`, which means a video
   * is scheduled and paced by exactly the machinery every other
   * animated thing here uses. Going backwards is a seek, and a seek to
   * zero is what looping is.
   */
  present(positionMs: number): boolean;
  /**
   * Whether the decoder is still working towards the position it was
   * last given.
   *
   * A seek lands on the sync sample *before* where it was aimed, and
   * everything between the two has to be decoded and thrown away
   * before the wanted picture exists. On a two-second GOP that is a
   * handful of frames and invisible; on a long one it is long enough
   * that an interface wanting to say so — a scrubber that dims, a
   * spinner over the poster — needs to be told. False while playing
   * forwards, because then every decoded frame is one that will be
   * shown.
   *
   * Optional, and absent means false. A playback that produces its
   * pictures on demand — the generated ones the documentation is built
   * on, a canvas, a stream of bitmaps — never waits for a keyframe it
   * has no concept of, and should not have to say so.
   */
  readonly seeking?: boolean;
  /** Called when the video fails, with what went wrong. */
  onError(listener: (error: unknown) => void): () => void;
  /**
   * Called when a decoded frame arrived and changed the picture
   * without anyone having asked for it.
   *
   * Which sounds like a contradiction of everything `present` says
   * about who owns time, and is not: the position is still driven from
   * outside, and this fires only for a position that has *already*
   * been asked for and could not be answered yet. A seek is the case.
   * `present(3.5s)` resets the decoder and returns with nothing to
   * show, because the frame for 3.5s will not exist for another few
   * milliseconds; when it lands, the driver is not going to call again
   * — a paused clip has no next frame — so the picture would stay on
   * whatever was there before the seek, forever.
   *
   * So the playback presents it and says so, and a caller repaints.
   * Optional for the same reason `seeking` is: a playback that
   * produces its pictures on demand answers every `present` on the
   * spot and has nothing to announce.
   */
  onFrame?(listener: () => void): () => void;
}

/**
 * Turns a source into something a renderer can draw, frame by frame.
 *
 * Deliberately the same shape as `ImageResolver`, including the
 * reference counting, and the reference counting is worth more here
 * than it is for a still. The demo this was written against keeps a
 * video playing across a navigation, and does it in the DOM by
 * physically moving the `<video>` element into the new document —
 * because a second `<video>` on the same source would start from the
 * beginning. Here the arriving node resolves the same source the
 * departing one is holding, gets the playback that is already running,
 * and picks it up mid-stream. There is no trick to reproduce.
 */
export interface VideoResolver {
  resolve(source: string): Promise<VideoPlayback>;
  release(source: string): void;
  dispose(): void;
}

/** Part of a file, and how long the whole of it is. */
export interface RangeResponse {
  readonly data: ArrayBuffer;
  /**
   * The file's total length in bytes.
   *
   * Asked for alongside the bytes because an HTTP range response
   * already carries it, in `Content-Range`, and a separate `HEAD`
   * request to learn the same thing is a round trip for nothing.
   */
  readonly total: number;
}

export interface DefaultVideoResolverOptions {
  /** How many finished playbacks to keep after their last holder let go. */
  capacity?: number;
  /** Injectable for specs, and for an app that fetches through its own stack. */
  fetch?: (source: string) => Promise<ArrayBuffer>;
  /**
   * Fetches `[start, end)` of a file, for playing one without holding
   * all of it.
   *
   * Given this, the resolver finds the `moov` with a few small
   * requests and then reads media as the decoder asks for it, which is
   * what makes an hour of video possible; given only `fetch`, it reads
   * the whole file at once, which is right for the looping clips this
   * framework is usually asked for and is what it has always done.
   * Neither is a default the other should be silently upgraded to — a
   * ranged read of a two megabyte loop is three round trips where one
   * would do — so an application says which it wants.
   */
  fetchRange?: (source: string, start: number, end: number) => Promise<RangeResponse>;
}

/** Whether this thread can decode video at all. */
export function canDecodeVideo(): boolean {
  return typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined';
}

const DEFAULT_CAPACITY = 4;
/**
 * How many decoded frames to keep in flight, queued plus submitted.
 *
 * A `VideoFrame` holds decoded pixels — often in GPU memory — and a
 * decoder will happily run seconds ahead if you let it, so this is
 * deliberately small. But it cannot be *too* small, and the arithmetic
 * is worth writing down because the first value chosen was.
 *
 * The floor is three things multiplied out. A stream with B-frames
 * cannot emit its first picture until the decoder holds its reorder
 * depth — two for the clip this was built against, so three inputs
 * before one output. `fill` runs once per *presentation*, and a source
 * at 60 fps presented by a renderer running at 30 needs two frames
 * decoded per fill to keep up. And a frame or two of slack absorbs a
 * decode that arrives late without the queue ever reaching empty.
 *
 * Twelve covers that with room. Four — the first value here — did not:
 * it left barely more than the reorder depth, so delivery came in
 * bursts and `presentDue`, which shows only the newest frame that is
 * due, threw the rest away.
 */
const FRAME_QUEUE_LIMIT = 12;
/**
 * How far the position may go backwards before it counts as a seek.
 *
 * A driver writing a position from a linear tween is monotonic within
 * a pass, but a frame's timing jitters by a millisecond either way and
 * a repeating tween wraps by a whole duration. A tenth of a second
 * tells those apart with room to spare.
 */
const SEEK_BACK_TOLERANCE_US = 100_000;

async function defaultFetch(source: string): Promise<ArrayBuffer> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Fetching '${source}' failed with ${response.status} ${response.statusText}.`);
  }
  return response.arrayBuffer();
}

interface Entry {
  readonly source: string;
  readonly playback: Promise<VideoPlayback>;
  holders: number;
  settled: Mp4Playback | null;
}

/**
 * Fetch, demux, decode, present, loop.
 *
 * Everything happens on the thread this is constructed on, which for a
 * Gesso app is the render worker: `VideoDecoder` is available there,
 * the demuxer is arithmetic, and a decoded `VideoFrame` is drawn where
 * it was produced rather than transferred anywhere. That is the whole
 * reason the decode is not on the main thread behind a `<video>`
 * element — the shell stays a shell.
 */
export class DefaultVideoResolver implements VideoResolver {
  private readonly entries = new Map<string, Entry>();
  private readonly evictable: string[] = [];
  private readonly capacity: number;
  private readonly fetchBuffer: (source: string) => Promise<ArrayBuffer>;
  private readonly fetchRange: DefaultVideoResolverOptions['fetchRange'];
  private disposed = false;

  constructor(options: DefaultVideoResolverOptions = {}) {
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
    this.fetchBuffer = options.fetch ?? defaultFetch;
    this.fetchRange = options.fetchRange;
  }

  /** Live or in-flight sources, for specs and the inspector. */
  get size(): number {
    return this.entries.size;
  }

  resolve(source: string): Promise<VideoPlayback> {
    if (this.disposed) {
      return Promise.reject(new Error('The video resolver has been disposed.'));
    }
    const existing = this.entries.get(source);
    if (existing !== undefined) {
      existing.holders++;
      const index = this.evictable.indexOf(source);
      if (index !== -1) {
        this.evictable.splice(index, 1);
      }
      return existing.playback;
    }
    const entry: Entry = {
      source,
      holders: 1,
      settled: null,
      playback: this.open(source).then(playback => {
        const current = this.entries.get(source);
        if (current === undefined) {
          // Released and evicted while it was in flight.
          playback.close();
          return playback;
        }
        current.settled = playback;
        return playback;
      })
    };
    // A rejection must not become an unhandled one just because nobody
    // has awaited it yet; the caller's own `.catch` still sees it.
    entry.playback.catch(() => {});
    this.entries.set(source, entry);
    return entry.playback;
  }

  release(source: string): void {
    const entry = this.entries.get(source);
    if (entry === undefined) {
      return;
    }
    entry.holders--;
    if (entry.holders > 0) {
      return;
    }
    // Nobody is watching it, but keep it: the usual reason a source
    // loses its last holder is a navigation that is about to give it
    // another, and that is the whole trick that keeps a video running
    // across a route change. It costs nothing to hold — nothing is
    // driving its position, so no frame is decoded until someone asks
    // for one again.
    this.evictable.push(source);
    while (this.evictable.length > this.capacity) {
      const evicted = this.evictable.shift()!;
      const stale = this.entries.get(evicted);
      if (stale !== undefined && stale.holders === 0) {
        this.entries.delete(evicted);
        stale.settled?.close();
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.settled?.close();
    }
    this.entries.clear();
    this.evictable.length = 0;
  }

  private async open(source: string): Promise<Mp4Playback> {
    if (!canDecodeVideo()) {
      throw new Error(
        'This thread has no WebCodecs VideoDecoder, so video cannot be played here. ' +
          'It is available in Chrome 94+ and in a worker; Safari and Firefox support varies.'
      );
    }
    const bytes = this.fetchRange === undefined ? await this.openWhole(source) : await this.openRanged(source);
    const playback = new Mp4Playback(bytes.track, bytes.data);
    await playback.start();
    return playback;
  }

  private async openWhole(source: string): Promise<{ track: Mp4VideoTrack; data: ByteSource }> {
    const data = await this.fetchBuffer(source);
    return { track: demuxMp4Video(data), data: bufferSource(data) };
  }

  /**
   * Finds the `moov`, reads it, and leaves the media where it is.
   *
   * The top-level structure of an MP4 is a flat list of boxes, each of
   * which states its own length, so the whole of it can be walked by
   * reading eight bytes at a time and jumping — which means finding
   * the `moov` costs a couple of small requests whether it is at the
   * front of the file (`-movflags +faststart`, and every file served
   * for streaming) or at the back (the default, and every file written
   * by a camera).
   *
   * The `moov` is then demuxed *on its own*, which works because the
   * offsets in a sample table are absolute positions in the file
   * rather than relative to anything: the tables are as correct read
   * out of a two hundred kilobyte buffer as out of a gigabyte one.
   */
  private async openRanged(source: string): Promise<{ track: Mp4VideoTrack; data: ByteSource }> {
    const fetchRange = this.fetchRange!;
    const first = await fetchRange(source, 0, HEADER_PROBE_BYTES);
    const total = first.total;
    if (!Number.isFinite(total) || total <= 0) {
      throw new Error(`Fetching a range of '${source}' did not report how long the file is.`);
    }
    const plain = (start: number, end: number): Promise<ArrayBuffer> =>
      fetchRange(source, start, end).then(response => response.data);
    const bytes = rangeSource(source, {
      fetchRange: (_source, start, end) => plain(start, end),
      size: total,
      // The probe is not thrown away. Without this the front of the
      // file is fetched twice -- once to find the `moov` and once
      // again as the first block -- which on a short file is most of
      // the transfer, and makes a ranged read cost more than simply
      // fetching the whole thing.
      prefetched: { start: 0, data: first.data }
    });
    const moov = await findTopLevelBox(bytes, 'moov', total);
    if (moov === null) {
      throw new Error(
        `'${source}' has no moov box, so there is no sample table to read. ` +
          'A ranged read walks the top-level boxes; a file this cannot walk is not an MP4.'
      );
    }
    // Already here, for a faststart file whose `moov` fits in the
    // probe, which is most of them. Copied rather than viewed because
    // the block it sits in can be evicted.
    const held = bytes.read(moov.start, moov.end - moov.start);
    const header = held === null ? await plain(moov.start, moov.end) : held.slice().buffer;
    return { track: demuxMp4Video(header), data: bytes };
  }
}

/**
 * How much of the front of the file to ask for first.
 *
 * Exactly one block, and that is the whole point of the constant
 * rather than a number here: a probe that does not land on a block
 * boundary cannot be kept, so the front of the file would be fetched
 * once to find the header and again as the first block. It is also
 * enough to hold the `ftyp` and, in a faststart file, the whole `moov`
 * for a clip of ordinary length, so the common case is a single
 * request for the whole header.
 */
const HEADER_PROBE_BYTES = DEFAULT_BLOCK_SIZE;

/**
 * Walks the top-level boxes looking for one, reading only their
 * headers.
 *
 * A box states its own length, so the walk is a jump per box and the
 * bytes it touches are sixteen at a time. `size === 1` means the real
 * length is a 64-bit number after the type, and `size === 0` means the
 * box runs to the end of the file — both of which `mdat` is written
 * with often enough to matter.
 */
async function findTopLevelBox(
  bytes: ByteSource,
  wanted: string,
  total: number
): Promise<{ start: number; end: number } | null> {
  let at = 0;
  while (at + 8 <= total) {
    await bytes.request(at, 16);
    const header = bytes.read(at, Math.min(16, total - at));
    if (header === null || header.length < 8) {
      return null;
    }
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    let size = view.getUint32(0);
    let payload = at + 8;
    if (size === 1) {
      if (header.length < 16) {
        return null;
      }
      size = view.getUint32(8) * 0x1_0000_0000 + view.getUint32(12);
      payload = at + 16;
    } else if (size === 0) {
      size = total - at;
    }
    if (size < 8 || at + size > total) {
      return null;
    }
    const type = String.fromCharCode(header[4]!, header[5]!, header[6]!, header[7]!);
    if (type === wanted) {
      return { start: payload - 8, end: at + size };
    }
    at += size;
  }
  return null;
}

/**
 * One MP4, decoded and presented against the runtime's frame clock.
 *
 * The clock matters. Nothing here uses `setInterval` or the decoder's
 * own pacing: `present(now)` is called from the modifier once a frame,
 * and it advances to whichever decoded frame is due at that moment. So
 * a video runs at the speed of the app's frames, drops frames under
 * load rather than falling behind, and stops entirely when the runtime
 * stops — which is the same contract every other animated thing in
 * this framework has.
 */
class Mp4Playback implements VideoPlayback {
  readonly surface: MutableVideoSurface;
  private decoder: VideoDecoder;
  private config: VideoDecoderConfig | null = null;
  /** Decoded and waiting, in presentation order. */
  private readonly queue: VideoFrame[] = [];
  private nextSample = 0;
  /** Where the last `present` put us, in microseconds. */
  private positionUs = 0;
  private closed = false;
  private readonly errorListeners = new Set<(error: unknown) => void>();
  private readonly frameListeners = new Set<() => void>();
  /**
   * The sync samples, by presentation time, so a seek can find where
   * to start decoding with a binary search rather than a scan.
   *
   * Built once, because `samples` never changes and a scrub drags
   * across it many times a second. Sorted by `timestampUs` rather than
   * left in decode order: a keyframe carries a composition offset like
   * any other sample, so the order they are *shown* in is the order a
   * seek searches, and it is not quite the order they are decoded in.
   */
  private readonly syncPoints: readonly SyncPoint[];
  /**
   * Where a seek is aiming, in microseconds, or null when playing
   * forwards.
   *
   * Frames that arrive before this are decoded only because the
   * pictures after them refer to them, and are closed on arrival
   * instead of being queued — see `receive`. Cleared as soon as a
   * frame at or past it has been decoded.
   */
  private seekTargetUs: number | null = null;
  /** Whether a fetch for missing bytes is already out; see `await`. */
  private pendingBytes = false;

  constructor(
    private readonly track: Mp4VideoTrack,
    private readonly data: ByteSource
  ) {
    // The surface tells us when a picture actually reaches it, which
    // is not the same moment as presenting one: converting a decoded
    // frame to a bitmap is asynchronous, so `present` can return
    // having chosen a frame that is not drawable yet. A playing clip
    // never notices, because the next tick repaints anyway. A paused
    // one has no next tick, so without this its first frame is chosen,
    // converted, and never drawn.
    this.surface = new MutableVideoSurface(track.codedWidth, track.codedHeight, () => this.announcePicture());
    this.syncPoints = buildSyncPoints(track.samples);
    this.decoder = new VideoDecoder({
      output: frame => this.receive(frame),
      error: error => this.fail(error)
    });
  }

  get width(): number {
    return this.track.codedWidth;
  }

  get height(): number {
    return this.track.codedHeight;
  }

  get duration(): number {
    return this.track.durationUs / 1_000_000;
  }

  get frameDurationMs(): number {
    return this.track.frameDurationUs / 1000;
  }

  get positionMs(): number {
    return this.positionUs / 1000;
  }

  get seeking(): boolean {
    return this.seekTargetUs !== null;
  }

  async start(): Promise<void> {
    const config: VideoDecoderConfig = {
      codec: this.track.codec,
      codedWidth: this.track.codedWidth,
      codedHeight: this.track.codedHeight,
      description: this.track.description,
      // `hardwareAcceleration` is deliberately not set, which means
      // 'no-preference' and lets the browser choose. Asking for
      // 'prefer-hardware' is a *requirement*, not a preference:
      // `isConfigSupported` answers false wherever there is no hardware
      // decoder for the codec — which on a Linux box without VA-API is
      // every codec — and the video then silently never plays. Found
      // exactly that way.
      optimizeForLatency: true
    };
    const support = await VideoDecoder.isConfigSupported(config);
    if (support.supported !== true) {
      throw new Error(
        `No decoder for '${this.track.codec}' at ${this.track.codedWidth}x${this.track.codedHeight} on this platform.`
      );
    }
    this.config = config;
    this.decoder.configure(config);
    this.fill();
  }

  /**
   * Shows whichever frame is due at `positionMs`, and says whether
   * that changed the picture.
   *
   * Frames already behind the position are dropped rather than shown,
   * so an app that stalled catches up instead of replaying the last
   * half second in fast-forward.
   */
  present(positionMs: number): boolean {
    if (this.closed) {
      return false;
    }
    const wanted = Math.max(0, positionMs * 1000);
    if (wanted === this.positionUs) {
      // Two elements can share one playback — a card and the page it
      // opens into, both on screen while a transition runs — and each
      // presents on its own tick. The second one to arrive on a given
      // position has nothing to do, and doing it anyway means a second
      // `fill()` and a second walk of the frame queue per frame.
      return false;
    }
    if (this.needsSeek(wanted)) {
      this.seekTo(wanted);
    }
    this.positionUs = wanted;
    const changed = this.presentDue();
    this.fill();
    return changed;
  }

  onError(listener: (error: unknown) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onFrame(listener: () => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Frees the decoder and every frame still queued. */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const frame of this.queue) {
      frame.close();
    }
    this.queue.length = 0;
    this.surface.clear();
    if (this.decoder.state !== 'closed') {
      this.decoder.close();
    }
    this.errorListeners.clear();
    this.frameListeners.clear();
    this.data.close();
  }

  private presentDue(): boolean {
    let shown = false;
    while (this.queue.length > 0) {
      const frame = this.queue[0]!;
      if (frame.timestamp > this.positionUs) {
        break;
      }
      this.queue.shift();
      // Everything still queued behind a frame that is also due is a
      // dropped frame: only the last one is worth uploading.
      const next = this.queue[0];
      if (next !== undefined && next.timestamp <= this.positionUs) {
        frame.close();
        continue;
      }
      this.surface.show(frame);
      shown = true;
    }
    return shown;
  }

  /**
   * Keeps the decoder a few frames ahead, and no further.
   *
   * **Stops at the first sample whose bytes are not here yet**, which
   * is the whole of what a ranged source costs this loop. `read`
   * answers synchronously or not at all — see `ByteSource` for why it
   * must — so a sample that is still on the wire ends the fill, a
   * request goes out for the region around it, and that request
   * calls `fill` again when it lands. In the ordinary case, a file
   * already in memory, `read` never answers null and none of this
   * runs.
   */
  private fill(): void {
    if (this.closed || this.decoder.state !== 'configured') {
      return;
    }
    while (
      this.nextSample < this.track.samples.length &&
      this.queue.length + this.decoder.decodeQueueSize < FRAME_QUEUE_LIMIT
    ) {
      const sample = this.track.samples[this.nextSample]!;
      const bytes = this.data.read(sample.offset, sample.size);
      if (bytes === null) {
        this.await(sample);
        return;
      }
      this.nextSample++;
      try {
        this.decoder.decode(new EncodedVideoChunk(chunkOf(sample, bytes)));
      } catch (error) {
        this.fail(error);
        return;
      }
    }
  }

  /**
   * Asks for the bytes around a sample, and resumes when they arrive.
   *
   * The window is deliberately wider than the one sample: a request
   * per frame would be a request every sixteen milliseconds, and the
   * point of reading a file in pieces is to read it in *few* pieces.
   * So it asks for everything from this sample to the end of the
   * decoder's lookahead, which the block size below it will round up
   * to something worth a round trip anyway.
   */
  private await(sample: Mp4Sample): void {
    if (this.pendingBytes) {
      return;
    }
    const last = this.track.samples[Math.min(this.nextSample + FRAME_QUEUE_LIMIT, this.track.samples.length - 1)];
    const through = last === undefined ? sample.offset + sample.size : last.offset + last.size;
    this.pendingBytes = true;
    this.data
      .request(sample.offset, Math.max(sample.size, through - sample.offset))
      .then(() => {
        this.pendingBytes = false;
        if (this.closed) {
          return;
        }
        this.fill();
        // The position has not moved, but a frame that was missing
        // may now exist — a clip that stalled mid-seek, most of all.
        this.announceFrame();
      })
      .catch((error: unknown) => {
        this.pendingBytes = false;
        this.fail(error);
      });
  }

  /**
   * Whether reaching `wanted` means starting the decoder somewhere
   * else.
   *
   * Two cases, and they are not symmetric. **Backwards** past the
   * tolerance is always a seek: a decoder cannot run in reverse, so
   * every frame in flight belongs to where we no longer are. It is
   * also what a loop is, which is why looping costs a keyframe.
   *
   * **Forwards** is a seek only when the jump clears the samples
   * already submitted. During ordinary playback the decoder runs a few
   * frames ahead of the picture, so the keyframe covering the position
   * is always one it has long since passed — `sample <= nextSample`,
   * and nothing happens. A jump far enough ahead to land beyond the
   * decoder's own head is the only forward case worth a reset, and
   * without this test it would instead decode every frame in between
   * at playback speed, which is a scrub that crawls.
   */
  private needsSeek(wanted: number): boolean {
    if (wanted + SEEK_BACK_TOLERANCE_US < this.positionUs) {
      return true;
    }
    if (wanted <= this.positionUs) {
      return false;
    }
    return syncSampleFor(this.syncPoints, wanted) > this.nextSample;
  }

  /**
   * Starts the decoder again at the sync sample covering `wanted`.
   *
   * The decoder is reset and reconfigured rather than merely refilled,
   * because a decoder mid-GOP holds reference frames for where it was
   * and the sample it is about to be given is a keyframe for where it
   * is going.
   *
   * What lands is the keyframe *at or before* the wanted position,
   * never after: a seek that jumped forward to the next keyframe would
   * show a picture from later than the moment asked for, and a scrubber
   * that overshoots its own thumb is worse than one that is coarse.
   * The frames between the keyframe and the target are decoded — the
   * ones after it refer to them — and closed on arrival rather than
   * queued, which is what `seekTargetUs` is for. So the cost of a seek
   * is the GOP length, paid in decodes nobody sees, and the reason a
   * clip encoded with two-second keyframes scrubs well and one encoded
   * with ten-second keyframes does not.
   */
  private seekTo(wanted: number): void {
    for (const frame of this.queue) {
      frame.close();
    }
    this.queue.length = 0;
    this.nextSample = syncSampleFor(this.syncPoints, wanted);
    // Nothing to throw away when the seek lands on its own keyframe,
    // which is what a loop back to the start always does.
    this.seekTargetUs = wanted > 0 ? wanted : null;
    if (this.config !== null && this.decoder.state !== 'closed') {
      this.decoder.reset();
      this.decoder.configure(this.config);
    }
  }

  private receive(frame: VideoFrame): void {
    if (this.closed) {
      frame.close();
      return;
    }
    const target = this.seekTargetUs;
    if (target !== null) {
      if (frame.timestamp + this.track.frameDurationUs < target) {
        // Decoded only because the pictures after it refer to it.
        // Closing it here rather than queueing it is what keeps the
        // queue free for `fill` to keep submitting, so the gap between
        // the keyframe and the target is crossed as fast as the
        // decoder will go instead of one frame per presentation.
        frame.close();
        this.fill();
        return;
      }
      this.enqueue(frame);
      // Held, not shown. The frame *before* the target is kept because
      // it may well be the one the target position wants — a seek to
      // 3.45s is answered by the frame at 3.4s — but showing it the
      // moment it arrives would put the wrong picture up for a
      // millisecond and then correct it. So nothing is presented until
      // a frame at or past the target lands, or until the file runs
      // out, and `presentDue` then picks whichever of them is right.
      const arrived = frame.timestamp >= target || this.nextSample >= this.track.samples.length;
      if (!arrived) {
        this.fill();
        return;
      }
      this.seekTargetUs = null;
      this.announceFrame();
      return;
    }
    this.enqueue(frame);
    // Due already, which means the position asked for it before it
    // existed. During ordinary playback every frame here is ahead of
    // the position and this does nothing.
    this.announceFrame();
  }

  /** Queued in presentation order; see `presentDue` for why that matters. */
  private enqueue(frame: VideoFrame): void {
    this.queue.push(frame);
    // The decoder emits in presentation order within a run, but a
    // frame may arrive after the position has already moved past it;
    // keeping the queue sorted means `presentDue` can stop at the
    // first frame that is not due yet.
    this.queue.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Presents whatever is due, and lets the surface say if that put a
   * picture up: see the constructor for why the two are not the same
   * moment.
   */
  private announceFrame(): void {
    this.presentDue();
  }

  private announcePicture(): void {
    for (const listener of this.frameListeners) {
      listener();
    }
  }

  private fail(error: unknown): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
    this.close();
  }
}

/** A sync sample: when it is shown, and where in the decode order it sits. */
interface SyncPoint {
  readonly timestampUs: number;
  /** Its index in the track's decode-ordered samples, which is where `fill` resumes. */
  readonly sample: number;
}

/**
 * The track's sync samples, in the order they are shown.
 *
 * `samples` is in decode order and stays that way — feeding a decoder
 * anything else is how you submit a frame before the one it refers to
 * — so the search a seek does needs its own view. Only the sync
 * samples are in it, which for a two-second GOP is one entry per two
 * seconds: a fifteen-minute film indexes in a few hundred numbers.
 */
function buildSyncPoints(samples: readonly Mp4Sample[]): readonly SyncPoint[] {
  const points: SyncPoint[] = [];
  for (const [sample, entry] of samples.entries()) {
    if (entry.isKey) {
      points.push({ timestampUs: entry.timestampUs, sample });
    }
  }
  points.sort((a, b) => a.timestampUs - b.timestampUs);
  return points;
}

/**
 * Which sample to start decoding at to have a picture for `wanted`.
 *
 * The last sync sample at or before the position, by binary search.
 * Zero when the position is before the first one, or when the track
 * declared no sync samples at all — an all-intra track, where every
 * sample is one and `buildSyncPoints` returned all of them anyway.
 */
function syncSampleFor(points: readonly SyncPoint[], wantedUs: number): number {
  let low = 0;
  let high = points.length - 1;
  let found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const point = points[middle]!;
    if (point.timestampUs <= wantedUs) {
      found = point.sample;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

function chunkOf(sample: Mp4Sample, bytes: Uint8Array): EncodedVideoChunkInit {
  return {
    type: sample.isKey ? 'key' : 'delta',
    timestamp: sample.timestampUs,
    duration: sample.durationUs,
    data: bytes
  };
}

/**
 * The surface the renderers see, written from inside.
 *
 * `UiVideoSurface` is readonly to everything downstream, which is the
 * point: a renderer must not be able to change what it is drawing. The
 * playback holds this side of it.
 */
class MutableVideoSurface implements UiVideoSurface {
  frame: VideoFrame | ImageBitmap | null = null;
  version = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    /** Called once a picture is actually on the surface and drawable. */
    private readonly onPicture: () => void = () => {}
  ) {}

  /**
   * Which conversion is the newest, so a slower one that finishes
   * after it can be thrown away rather than shown out of order.
   */
  private pending = 0;

  /**
   * Takes a decoded frame, and shows it once it is something cheap to
   * draw.
   *
   * A `VideoFrame` from a software decoder holds planar YUV in CPU
   * memory, and `drawImage` has to convert it to RGB before it can
   * put it anywhere. Whether that is visible depends on the engine:
   * Chromium uploads the frame and converts it in a shader, while
   * Gecko converts on whichever thread issued the draw, which is the
   * render worker, inside the frame. Measured on Firefox 154 in the
   * transitions example, one 1280x992 frame drawn into a 0.42
   * megapixel box cost **4.6ms**, against a whole-frame budget of
   * 6ms on a 165Hz display. It was two thirds of the frame, and it
   * was paid again on every draw.
   *
   * `createImageBitmap` is specified to do its work in parallel, so
   * converting here rather than at the draw takes that cost off the
   * render thread and pays it once per decoded frame instead of once
   * per drawn frame. The same measurement then reads **1.7ms**, and
   * a display faster than the video no longer multiplies it.
   *
   * The frame is closed as soon as the bitmap exists, and the bitmap
   * is what `UiVideoSurface.frame` was already allowed to be.
   */
  show(frame: VideoFrame): void {
    const conversion = ++this.pending;
    if (typeof createImageBitmap !== 'function') {
      this.replace(frame);
      return;
    }
    createImageBitmap(frame)
      .then(bitmap => {
        frame.close();
        if (conversion !== this.pending) {
          // A newer frame has already been shown. Presenting this one
          // would run the video backwards for a frame.
          bitmap.close();
          return;
        }
        this.replace(bitmap);
      })
      .catch(() => {
        // No `createImageBitmap` here, or it refused this frame. The
        // frame itself is still drawable, which is what every renderer
        // did before this conversion existed.
        if (conversion !== this.pending) {
          frame.close();
          return;
        }
        this.replace(frame);
      });
  }

  private replace(frame: VideoFrame | ImageBitmap): void {
    // What is being replaced is closed here rather than left to the
    // collector: a `VideoFrame` holds decoded pixels, often in GPU
    // memory, and Chrome warns loudly when one is collected unclosed.
    (this.frame as { close?: () => void } | null)?.close?.();
    this.frame = frame;
    this.version++;
    this.onPicture();
  }

  clear(): void {
    // Also abandons any conversion still in flight: it will find its
    // sequence number stale and close what it made.
    this.pending++;
    (this.frame as { close?: () => void } | null)?.close?.();
    this.frame = null;
    this.version++;
  }
}
