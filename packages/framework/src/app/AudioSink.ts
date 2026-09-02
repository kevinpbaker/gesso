import type { AudioAction, AudioMetadata, AudioRequest, AudioSample, AudioStatus } from './AudioService';
import { epochNow } from './worker/RenderWorkerProtocol';

/**
 * The part of `HTMLAudioElement` the sink drives. Narrow so a spec can
 * stand one in with a plain `EventTarget`.
 */
export interface AudioElementLike extends EventTarget {
  src: string;
  currentTime: number;
  volume: number;
  preload: string;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  readonly buffered: { readonly length: number; start(index: number): number; end(index: number): number };
  readonly error: { readonly code: number; readonly message?: string } | null;
  play(): Promise<void>;
  pause(): void;
  load(): void;
}

/** The part of the Media Session API the sink uses; absent on browsers without it. */
export interface MediaSessionLike {
  metadata: unknown;
  playbackState: 'none' | 'paused' | 'playing';
  setActionHandler(action: string, handler: ((details: { seekTime?: number }) => void) | null): void;
}

export interface AudioSinkOutput {
  /** The element's state, whenever it changes and about once a second while playing. */
  sample(sample: AudioSample): void;
  /** What the platform's media controls asked for. */
  action(action: AudioAction): void;
}

export interface AudioSinkOptions {
  /** Injectable for specs; `new Audio()` by default. */
  readonly createElement?: () => AudioElementLike;
  /** Injectable for specs; `navigator.mediaSession` by default, when the browser has one. */
  readonly mediaSession?: MediaSessionLike | null;
  /** Milliseconds between samples while playing. */
  readonly sampleEveryMs?: number;
}

const DEFAULT_SAMPLE_EVERY_MS = 1000;

/** The element events that change what a sample would say. */
const SAMPLED_EVENTS = [
  'loadstart',
  'loadedmetadata',
  'durationchange',
  'canplay',
  'playing',
  'play',
  'pause',
  'seeking',
  'seeked',
  'waiting',
  'stalled',
  'ended',
  'error',
  'progress',
  'emptied'
] as const;

/**
 * The shell's audio element, behind the `AudioRequest` messages.
 *
 * This is the one piece of sound that genuinely cannot run anywhere
 * else: an element that plays needs a window. Everything that could be
 * a decision is not here. The sink loads what it is told, plays and
 * pauses when told, and reports what the element is doing; which track
 * that is, and what comes next, is the render thread's `AudioService`
 * and the application above it. `decisions/0030` holds the shell to
 * "what genuinely cannot run anywhere else", and this is the audio
 * equivalent of forwarding a pointer event.
 *
 * Media Session is here for the same reason: `navigator.mediaSession`
 * is main-thread only, and it is what puts the title on the OS overlay
 * and makes the hardware keys work. Play and pause from those keys act
 * on the element directly and come back as samples; next and previous
 * are forwarded as actions, because an element has no idea what a
 * playlist is.
 */
export class AudioSink {
  private readonly element: AudioElementLike;
  private readonly session: MediaSessionLike | null;
  private readonly sampleEveryMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private waiting = false;
  /** Why the last play() was refused, reported on the next sample and then forgotten. */
  private refused: string | undefined;
  private readonly onEvent = (event: Event): void => this.handleEvent(event.type);

  constructor(
    private readonly out: AudioSinkOutput,
    options: AudioSinkOptions = {}
  ) {
    this.element = options.createElement?.() ?? (new Audio() as unknown as AudioElementLike);
    this.element.preload = 'auto';
    this.session =
      options.mediaSession !== undefined
        ? options.mediaSession
        : typeof navigator !== 'undefined' && 'mediaSession' in navigator
          ? (navigator.mediaSession as unknown as MediaSessionLike)
          : null;
    this.sampleEveryMs = options.sampleEveryMs ?? DEFAULT_SAMPLE_EVERY_MS;
    for (const type of SAMPLED_EVENTS) {
      this.element.addEventListener(type, this.onEvent);
    }
    this.bindSession();
  }

  handle(request: AudioRequest): void {
    switch (request.type) {
      case 'load':
        this.element.src = request.src;
        this.element.load();
        this.waiting = true;
        if (request.autoplay) {
          this.play();
        } else {
          this.emit();
        }
        return;
      case 'play':
        this.play();
        return;
      case 'pause':
        this.element.pause();
        return;
      case 'seek':
        this.element.currentTime = request.seconds;
        return;
      case 'volume':
        this.element.volume = request.level;
        return;
      case 'metadata':
        this.setMetadata(request.metadata);
        return;
    }
  }

  dispose(): void {
    this.stopTimer();
    for (const type of SAMPLED_EVENTS) {
      this.element.removeEventListener(type, this.onEvent);
    }
    this.element.pause();
    this.element.src = '';
    if (this.session !== null) {
      for (const action of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto']) {
        try {
          this.session.setActionHandler(action, null);
        } catch {
          // A browser that does not know the action throws; nothing to undo.
        }
      }
      this.session.metadata = null;
      this.session.playbackState = 'none';
    }
  }

  private play(): void {
    this.refused = undefined;
    const started = this.element.play();
    // A browser may refuse a play that no gesture authorised; the
    // element stays paused and the sample says why, so the screen can
    // show a paused player rather than one that claims to be playing.
    started?.catch((error: unknown) => {
      this.waiting = false;
      this.refused = error instanceof Error ? error.name : String(error);
      this.emit();
    });
  }

  private handleEvent(type: string): void {
    switch (type) {
      case 'loadstart':
      case 'waiting':
      case 'stalled':
        this.waiting = true;
        break;
      case 'canplay':
      case 'playing':
      case 'pause':
      case 'ended':
      case 'error':
      case 'emptied':
        this.waiting = false;
        break;
      default:
        break;
    }
    this.emit();
  }

  private status(): AudioStatus {
    const element = this.element;
    if (element.error !== null) {
      return 'error';
    }
    if (element.src === '' || element.src === undefined) {
      return 'idle';
    }
    if (element.ended) {
      return 'ended';
    }
    if (element.paused) {
      return this.waiting && this.refused === undefined ? 'loading' : 'paused';
    }
    return this.waiting ? 'loading' : 'playing';
  }

  private emit(): void {
    const element = this.element;
    const status = this.status();
    const error =
      status === 'error' ? (element.error?.message ?? `media error ${element.error?.code ?? ''}`.trim()) : this.refused;
    this.out.sample({
      status,
      position: element.currentTime,
      duration: element.duration,
      buffered: bufferedEnd(element),
      at: epochNow(),
      ...(error === undefined ? {} : { error })
    });
    if (this.session !== null) {
      this.session.playbackState = status === 'playing' ? 'playing' : status === 'idle' ? 'none' : 'paused';
    }
    if (status === 'playing') {
      this.startTimer();
    } else {
      this.stopTimer();
    }
  }

  private startTimer(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => this.emit(), this.sampleEveryMs);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private setMetadata(metadata: AudioMetadata | null): void {
    if (this.session === null) {
      return;
    }
    if (metadata === null || typeof MediaMetadata === 'undefined') {
      this.session.metadata = null;
      return;
    }
    this.session.metadata = new MediaMetadata({
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album ?? '',
      artwork: metadata.artwork === undefined ? [] : [{ src: metadata.artwork }]
    });
  }

  private bindSession(): void {
    const session = this.session;
    if (session === null) {
      return;
    }
    const bind = (action: string, handler: (details: { seekTime?: number }) => void): void => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Not every browser knows every action.
      }
    };
    bind('play', () => {
      this.play();
      this.out.action('play');
    });
    bind('pause', () => {
      this.element.pause();
      this.out.action('pause');
    });
    bind('previoustrack', () => this.out.action('previous'));
    bind('nexttrack', () => this.out.action('next'));
    bind('seekto', details => {
      if (details.seekTime !== undefined) {
        this.element.currentTime = details.seekTime;
      }
    });
  }
}

/** The end of the buffered range the play head is in, or the head itself when nothing is buffered there. */
function bufferedEnd(element: AudioElementLike): number {
  const ranges = element.buffered;
  const at = element.currentTime;
  for (let index = 0; index < ranges.length; index++) {
    if (ranges.start(index) <= at && at <= ranges.end(index)) {
      return ranges.end(index);
    }
  }
  return at;
}
