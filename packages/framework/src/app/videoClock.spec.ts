import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Box, Column } from 'gesso-core';

import { AudioService, type AudioSample } from './AudioService';
import { mountRuntime } from './RuntimeTestUtils';
import { audioClock } from './videoClock';
import { epochNow } from './worker/RenderWorkerProtocol';

/**
 * The clock a clip follows when something else owns time.
 *
 * What is being checked is the *adapter*, not the synchronisation: a
 * picture that actually keeps step with a sound is something only a
 * browser with a speaker can show. What a spec can pin down is that
 * the position comes from the right playback, that it stops claiming
 * to run when the sound stops, and that a second source loaded over
 * the top does not silently start driving this clip.
 */

function sample(overrides: Partial<AudioSample> = {}): AudioSample {
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
  return { mounted, audio };
}

describe('audioClock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads the position of the playback it was told to follow', () => {
    const { audio } = setup();
    const clock = audioClock(audio, 'clip.mp4');
    audio.load('clip.mp4');
    audio.applySample(sample({ position: 12 }));

    expect(clock.positionSeconds()).toBeCloseTo(12, 1);
    expect(clock.running).toBe(true);
  });

  it('stops running when the sound does', () => {
    const { audio } = setup();
    const clock = audioClock(audio, 'clip.mp4');
    audio.load('clip.mp4');
    audio.applySample(sample({ position: 4 }));
    expect(clock.running).toBe(true);

    audio.applySample(sample({ status: 'paused', position: 4 }));

    // A paused clock presents no new frames, so the picture holds
    // where the sound stopped rather than running on without it.
    expect(clock.running).toBe(false);
    expect(clock.positionSeconds()).toBeCloseTo(4, 1);
  });

  it('refuses to be driven by a different source', () => {
    const { audio } = setup();
    const clock = audioClock(audio, 'clip.mp4');
    audio.load('clip.mp4');
    audio.applySample(sample({ position: 9 }));
    const held = clock.positionSeconds();

    // One `AudioService` serves the whole application, so a screen
    // that starts a podcast while this clip is mounted would otherwise
    // drive the picture from the podcast's position.
    audio.load('a-podcast.mp3');
    audio.applySample(sample({ position: 2000 }));

    expect(clock.running).toBe(false);
    expect(clock.positionSeconds()).toBeCloseTo(held, 1);
  });

  it('tells a listener when the sound starts and stops, and not on every sample', () => {
    const { audio } = setup();
    const clock = audioClock(audio, 'clip.mp4');
    let changes = 0;
    const stop = clock.onChange(() => changes++);

    audio.load('clip.mp4');
    audio.applySample(sample({ position: 0 }));
    const afterStart = changes;
    expect(afterStart).toBeGreaterThan(0);

    // The position moves constantly and is read rather than pushed;
    // what a listener waits for is the clip starting or stopping.
    audio.applySample(sample({ position: 1 }));
    audio.applySample(sample({ position: 2 }));
    expect(changes).toBe(afterStart);

    audio.applySample(sample({ status: 'paused', position: 2 }));
    expect(changes).toBe(afterStart + 1);

    stop();
    audio.applySample(sample({ position: 3 }));
    expect(changes).toBe(afterStart + 1);
  });
});
