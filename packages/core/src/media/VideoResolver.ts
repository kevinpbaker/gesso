import type { UiVideoSurface } from '../properties/UiVideo';
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
  /** Called when the video fails, with what went wrong. */
  onError(listener: (error: unknown) => void): () => void;
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

export interface DefaultVideoResolverOptions {
  /** How many finished playbacks to keep after their last holder let go. */
  capacity?: number;
  /** Injectable for specs, and for an app that fetches through its own stack. */
  fetch?: (source: string) => Promise<ArrayBuffer>;
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
  private disposed = false;

  constructor(options: DefaultVideoResolverOptions = {}) {
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
    this.fetchBuffer = options.fetch ?? defaultFetch;
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
    const data = await this.fetchBuffer(source);
    const track = demuxMp4Video(data);
    const playback = new Mp4Playback(track, data);
    await playback.start();
    return playback;
  }
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

  constructor(
    private readonly track: Mp4VideoTrack,
    private readonly data: ArrayBuffer
  ) {
    this.surface = new MutableVideoSurface(track.codedWidth, track.codedHeight);
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
    if (wanted + SEEK_BACK_TOLERANCE_US < this.positionUs) {
      // Backwards: a loop wrapping, or a deliberate seek. Either way
      // every frame in flight belongs to where we no longer are.
      this.rewind();
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

  /** Keeps the decoder a few frames ahead, and no further. */
  private fill(): void {
    if (this.closed || this.decoder.state !== 'configured') {
      return;
    }
    while (
      this.nextSample < this.track.samples.length &&
      this.queue.length + this.decoder.decodeQueueSize < FRAME_QUEUE_LIMIT
    ) {
      const sample = this.track.samples[this.nextSample]!;
      this.nextSample++;
      try {
        this.decoder.decode(new EncodedVideoChunk(chunkOf(sample, this.data)));
      } catch (error) {
        this.fail(error);
        return;
      }
    }
  }

  /**
   * Back to the start of the stream.
   *
   * The decoder is reset and reconfigured rather than merely refilled,
   * because a decoder mid-GOP holds reference frames for where it was
   * and the first sample of the file is a keyframe for where it is
   * going. That costs one keyframe decode at the loop point — a
   * measurable hitch on a long GOP, invisible on the two-second ones
   * a looping clip is usually encoded with — and it is the honest
   * price of looping a progressive file rather than a fragmented one.
   */
  private rewind(): void {
    for (const frame of this.queue) {
      frame.close();
    }
    this.queue.length = 0;
    this.nextSample = 0;
    this.positionUs = 0;
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
    this.queue.push(frame);
    // The decoder emits in presentation order within a run, but a
    // frame may arrive after the position has already moved past it;
    // keeping the queue sorted means `presentDue` can stop at the
    // first frame that is not due yet.
    this.queue.sort((a, b) => a.timestamp - b.timestamp);
  }

  private fail(error: unknown): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
    this.close();
  }
}

function chunkOf(sample: Mp4Sample, data: ArrayBuffer): EncodedVideoChunkInit {
  return {
    type: sample.isKey ? 'key' : 'delta',
    timestamp: sample.timestampUs,
    duration: sample.durationUs,
    data: new Uint8Array(data, sample.offset, sample.size)
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
    readonly height: number
  ) {}

  show(frame: VideoFrame): void {
    // The frame being replaced is closed here rather than left to the
    // collector: a `VideoFrame` holds decoded pixels, often in GPU
    // memory, and Chrome warns loudly when one is collected unclosed.
    (this.frame as VideoFrame | null)?.close?.();
    this.frame = frame;
    this.version++;
  }

  clear(): void {
    (this.frame as VideoFrame | null)?.close?.();
    this.frame = null;
    this.version++;
  }
}
