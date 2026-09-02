import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioSink, type AudioElementLike, type MediaSessionLike } from './AudioSink';
import type { AudioAction, AudioSample } from './AudioService';

/** An audio element with the state an `AudioSink` reads, and none of the sound. */
class FakeAudio extends EventTarget implements AudioElementLike {
  src = '';
  currentTime = 0;
  volume = 1;
  preload = '';
  duration = NaN;
  paused = true;
  ended = false;
  error: { code: number; message?: string } | null = null;
  ranges: [number, number][] = [];
  playResult: Promise<void> = Promise.resolve();
  readonly play = vi.fn((): Promise<void> => {
    return this.playResult.then(() => {
      this.paused = false;
      this.fire('play');
      this.fire('playing');
    });
  });
  readonly pause = vi.fn((): void => {
    this.paused = true;
    this.fire('pause');
  });
  readonly load = vi.fn((): void => {
    this.fire('loadstart');
  });
  get buffered() {
    const ranges = this.ranges;
    return { length: ranges.length, start: (i: number) => ranges[i]![0], end: (i: number) => ranges[i]![1] };
  }
  fire(type: string): void {
    this.dispatchEvent(new Event(type));
  }
}

class FakeSession implements MediaSessionLike {
  metadata: unknown = null;
  playbackState: 'none' | 'paused' | 'playing' = 'none';
  readonly handlers = new Map<string, ((details: { seekTime?: number }) => void) | null>();
  setActionHandler(action: string, handler: ((details: { seekTime?: number }) => void) | null): void {
    if (action === 'unsupported') {
      throw new TypeError('unsupported');
    }
    this.handlers.set(action, handler);
  }
}

function setup(options: { session?: FakeSession | null } = {}) {
  const element = new FakeAudio();
  const session = options.session === undefined ? new FakeSession() : options.session;
  const samples: AudioSample[] = [];
  const actions: AudioAction[] = [];
  const sink = new AudioSink(
    { sample: s => samples.push(s), action: a => actions.push(a) },
    { createElement: () => element, mediaSession: session, sampleEveryMs: 1000 }
  );
  return { element, session, samples, actions, sink, last: () => samples[samples.length - 1]! };
}

describe('AudioSink', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads and plays a source, and reports loading, then playing, then once a second', async () => {
    const { element, samples, sink, last } = setup();

    sink.handle({ type: 'load', src: 'song.mp3', autoplay: true });
    expect(element.src).toBe('song.mp3');
    expect(element.preload).toBe('auto');
    expect(last().status).toBe('loading');

    await vi.advanceTimersByTimeAsync(0);
    element.duration = 200;
    element.fire('durationchange');
    expect(last()).toMatchObject({ status: 'playing', duration: 200 });

    const before = samples.length;
    element.currentTime = 3;
    await vi.advanceTimersByTimeAsync(2000);
    expect(samples.length).toBe(before + 2);
    expect(last().position).toBe(3);

    element.pause();
    const paused = samples.length;
    await vi.advanceTimersByTimeAsync(3000);
    // No more samples once it stopped.
    expect(samples.length).toBe(paused);
    expect(last().status).toBe('paused');
  });

  it('reports a refused play as paused with the reason, and a later play clears it', async () => {
    const { element, sink, last } = setup();
    element.playResult = Promise.reject(new DOMException('gesture needed', 'NotAllowedError'));

    sink.handle({ type: 'load', src: 'song.mp3', autoplay: true });
    await vi.advanceTimersByTimeAsync(0);

    expect(last()).toMatchObject({ status: 'paused', error: 'NotAllowedError' });

    element.playResult = Promise.resolve();
    sink.handle({ type: 'play' });
    await vi.advanceTimersByTimeAsync(0);
    expect(last().status).toBe('playing');
    expect(last().error).toBeUndefined();
  });

  it('reports stalls as loading, ends as ended, and errors with the message', async () => {
    const { element, sink, last } = setup();
    sink.handle({ type: 'load', src: 'song.mp3', autoplay: true });
    await vi.advanceTimersByTimeAsync(0);

    element.fire('waiting');
    expect(last().status).toBe('loading');
    element.fire('playing');
    expect(last().status).toBe('playing');

    element.paused = true;
    element.ended = true;
    element.fire('ended');
    expect(last().status).toBe('ended');

    element.error = { code: 2, message: 'network' };
    element.fire('error');
    expect(last()).toMatchObject({ status: 'error', error: 'network' });
  });

  it('seeks, sets the volume, and reports the buffered range the head is in', () => {
    const { element, sink, last } = setup();
    sink.handle({ type: 'load', src: 'song.mp3', autoplay: false });
    element.ranges = [
      [0, 10],
      [40, 60]
    ];

    sink.handle({ type: 'seek', seconds: 45 });
    expect(element.currentTime).toBe(45);
    element.fire('seeked');
    expect(last()).toMatchObject({ position: 45, buffered: 60 });

    sink.handle({ type: 'volume', level: 0.25 });
    expect(element.volume).toBe(0.25);
  });

  it('drives the media session: metadata, playback state, and the hardware keys', async () => {
    const { element, session, actions, sink } = setup();
    (globalThis as { MediaMetadata?: unknown }).MediaMetadata = class {
      constructor(readonly init: unknown) {}
    };
    try {
      sink.handle({ type: 'metadata', metadata: { title: 'Song', artist: 'Band', artwork: 'a.jpg' } });
      expect((session!.metadata as { init: unknown }).init).toEqual({
        title: 'Song',
        artist: 'Band',
        album: '',
        artwork: [{ src: 'a.jpg' }]
      });

      sink.handle({ type: 'load', src: 'song.mp3', autoplay: true });
      await vi.advanceTimersByTimeAsync(0);
      expect(session!.playbackState).toBe('playing');

      session!.handlers.get('nexttrack')!({});
      session!.handlers.get('previoustrack')!({});
      session!.handlers.get('pause')!({});
      expect(actions).toEqual(['next', 'previous', 'pause']);
      expect(element.paused).toBe(true);
      expect(session!.playbackState).toBe('paused');

      session!.handlers.get('seekto')!({ seekTime: 33 });
      expect(element.currentTime).toBe(33);

      sink.handle({ type: 'metadata', metadata: null });
      expect(session!.metadata).toBeNull();
    } finally {
      delete (globalThis as { MediaMetadata?: unknown }).MediaMetadata;
    }
  });

  it('works without a media session, and releases everything on dispose', async () => {
    const { element, sink, samples } = setup({ session: null });
    sink.handle({ type: 'load', src: 'song.mp3', autoplay: true });
    await vi.advanceTimersByTimeAsync(0);

    sink.dispose();
    const count = samples.length;
    element.fire('playing');
    await vi.advanceTimersByTimeAsync(3000);

    expect(samples.length).toBe(count);
    expect(element.pause).toHaveBeenCalled();
    expect(element.src).toBe('');
  });
});
