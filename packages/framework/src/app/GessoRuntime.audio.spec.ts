import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Box, Column } from '@gesso/core';
import { AudioService, type AudioRequest, type AudioSample, type AudioState } from './AudioService';
import { mountRuntime } from './RuntimeTestUtils';
import { epochNow } from './worker/RenderWorkerProtocol';

function sample(overrides: Partial<AudioSample>): AudioSample {
  return { status: 'playing', position: 0, duration: 100, buffered: 0, at: epochNow(), ...overrides };
}

function setup() {
  const mounted = mountRuntime(Column({}, Box({ width: 20, height: 20 })));
  let time = 0;
  while (mounted.clock.isPending) {
    time += 16;
    mounted.clock.tick(time);
  }
  const audio = mounted.runtime.services.get(AudioService);
  const requests: AudioRequest[] = [];
  mounted.runtime.onAudioRequest(request => requests.push(request));
  const states: AudioState[] = [];
  audio.state.subscribe(state => states.push(state));
  // Ticks the frame clock like a display would, 16 ms at a time, and
  // moves the timers with it: a tween with `stepMs` does not hold a
  // frame open between steps, it arms a timeout that asks for the next
  // one (see `GessoRuntime.scheduleAnimationTick`).
  const advance = (ms: number): void => {
    const end = time + ms;
    while (time < end) {
      time += 16;
      vi.advanceTimersByTime(16);
      if (mounted.clock.isPending) {
        mounted.clock.tick(time);
      }
    }
  };
  return { mounted, audio, requests, states, advance };
}

describe('AudioService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is registered by the runtime, idle, and forwards what it is asked', () => {
    const { audio, requests } = setup();

    expect(audio.current).toMatchObject({ status: 'idle', position: 0, src: null });

    audio.load('song.mp3');
    audio.pause();
    audio.play();
    audio.seek(12.5);
    audio.setVolume(2);
    audio.setMetadata({ title: 'T', artist: 'A' });

    expect(requests).toEqual([
      { type: 'load', src: 'song.mp3', autoplay: true },
      { type: 'pause' },
      { type: 'play' },
      { type: 'seek', seconds: 12.5 },
      { type: 'volume', level: 1 },
      { type: 'metadata', metadata: { title: 'T', artist: 'A' } }
    ]);
    // Loading is reported at once, and the seek was written locally.
    expect(audio.current).toMatchObject({ status: 'loading', src: 'song.mp3', position: 12.5 });
  });

  it('moves the position on between samples while playing, and holds it when paused', () => {
    const { mounted, audio, advance } = setup();

    mounted.runtime.applyAudioSample(sample({ status: 'playing', position: 10, duration: 100 }));
    expect(audio.current.position).toBeCloseTo(10, 1);
    // The tween armed a frame by itself.
    expect(mounted.clock.isPending).toBe(true);

    advance(1000);
    expect(audio.current.position).toBeGreaterThan(10.9);
    expect(audio.current.position).toBeLessThan(11.2);

    mounted.runtime.applyAudioSample(sample({ status: 'paused', position: 30, duration: 100 }));
    expect(audio.current.position).toBe(30);
    advance(1000);
    expect(audio.current.position).toBe(30);
    expect(audio.current.status).toBe('paused');
  });

  it('accounts for the time a sample spent in flight, and never runs past the end', () => {
    const { mounted, audio, advance } = setup();

    mounted.runtime.applyAudioSample(sample({ position: 5, duration: 6, at: epochNow() - 500 }));
    expect(audio.current.position).toBeCloseTo(5.5, 1);

    advance(2000);
    expect(audio.current.position).toBe(6);
    expect(mounted.clock.isPending).toBe(false);
  });

  it('keeps moving when the duration is not yet known', () => {
    const { mounted, audio, advance } = setup();

    mounted.runtime.applyAudioSample(sample({ position: 0, duration: NaN }));
    advance(500);

    expect(audio.current.position).toBeGreaterThan(0.4);
    expect(Number.isNaN(audio.current.duration)).toBe(true);
  });

  it('publishes the platform actions and carries an error through', () => {
    const { mounted, audio } = setup();
    const actions: string[] = [];
    audio.actions.subscribe(action => actions.push(action));

    mounted.runtime.applyAudioAction('next');
    mounted.runtime.applyAudioAction('pause');
    mounted.runtime.applyAudioSample(sample({ status: 'error', error: 'MEDIA_ERR_NETWORK' }));

    expect(actions).toEqual(['next', 'pause']);
    expect(audio.current).toMatchObject({ status: 'error', error: 'MEDIA_ERR_NETWORK' });
  });

  it('drops requests when no host is listening, rather than throwing', () => {
    const { mounted, audio } = setup();
    mounted.runtime.onAudioRequest(null);
    expect(() => audio.play()).not.toThrow();
  });

  it('a second runtime in the same worker gets its own service', () => {
    const a = setup();
    const b = setup();
    const spy = vi.fn();
    b.audio.state.subscribe(spy);
    a.mounted.runtime.applyAudioSample(sample({ position: 42 }));
    expect(b.audio.current.position).toBe(0);
    expect(a.audio.current.position).toBeCloseTo(42, 0);
  });
});
