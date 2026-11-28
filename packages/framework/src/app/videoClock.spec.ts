import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Box, Column } from 'gesso-core';

import { AudioService, type AudioRequest, type AudioSample } from './AudioService';
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

  it('runs on between the steps the service writes, and not far past them', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    try {
      const { audio } = setup();
      const clock = audioClock(audio, 'clip.mp4');
      audio.load('clip.mp4');
      audio.applySample(sample({ position: 12, rate: 2 }));
      expect(clock.positionSeconds()).toBeCloseTo(12, 3);

      // 40 ms of real time at double speed, with no new position written.
      now.mockReturnValue(1040);
      expect(clock.positionSeconds()).toBeCloseTo(12.08, 3);

      // A position that has stopped arriving means the sound has stopped.
      now.mockReturnValue(3000);
      expect(clock.positionSeconds()).toBeCloseTo(12.15, 3);

      audio.applySample(sample({ status: 'paused', position: 12.5 }));
      expect(clock.positionSeconds()).toBeCloseTo(12.5, 3);
    } finally {
      now.mockRestore();
    }
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

  describe('as the transport of the clip it follows', () => {
    function recording(audio: AudioService): AudioRequest[] {
      const sent: AudioRequest[] = [];
      audio.setHandler(request => sent.push(request));
      return sent;
    }

    it('plays, pauses and seeks the sound of its own source', () => {
      const { audio } = setup();
      const clock = audioClock(audio, 'clip.mp4');
      audio.load('clip.mp4', { autoplay: false });
      const sent = recording(audio);

      clock.play?.();
      clock.seek?.(5);
      clock.pause?.();

      expect(sent).toEqual([{ type: 'play' }, { type: 'seek', seconds: 5 }, { type: 'pause' }]);
    });

    it('leaves another source alone on a pause or a seek', () => {
      const { audio } = setup();
      const clock = audioClock(audio, 'clip.mp4');
      audio.load('a-podcast.mp3');
      const sent = recording(audio);

      clock.pause?.();
      clock.seek?.(5);

      expect(sent).toEqual([]);
      expect(clock.positionSeconds()).toBe(5);
    });

    it('takes the sound back on play, from where the picture was held', () => {
      const { audio } = setup();
      const clock = audioClock(audio, 'clip.mp4');
      audio.load('clip.mp4');
      audio.applySample(sample({ position: 7 }));
      clock.positionSeconds();
      audio.load('a-podcast.mp3');
      const sent = recording(audio);

      clock.play?.();

      expect(sent[0]).toEqual({ type: 'load', src: 'clip.mp4', autoplay: true });
      expect(sent.at(-1)?.type).toBe('seek');
      expect(audio.state.value.src).toBe('clip.mp4');
    });
  });

  describe('with the settings of the clip it follows', () => {
    function recording(audio: AudioService): AudioRequest[] {
      const sent: AudioRequest[] = [];
      audio.setHandler(request => sent.push(request));
      return sent;
    }

    it('gives the rate, the loop and the level to its own source', () => {
      const { audio } = setup();
      const clock = audioClock(audio, 'clip.mp4');
      audio.load('clip.mp4');
      const sent = recording(audio);

      clock.setRate?.(1.5);
      clock.setLoop?.(true);
      clock.setVolume?.(0.4, false);
      clock.setVolume?.(0.4, true);

      expect(sent).toEqual([
        { type: 'rate', rate: 1.5 },
        { type: 'loop', loop: true },
        { type: 'volume', level: 0.4 },
        // Muted is silence, and the level is kept for the unmute.
        { type: 'volume', level: 0 }
      ]);
    });

    it('keeps them from another source, and gives them when its source is loaded', () => {
      const { audio } = setup();
      const clock = audioClock(audio, 'clip.mp4');
      const stop = clock.onChange(() => {});
      audio.load('a-podcast.mp3');
      const sent = recording(audio);

      clock.setRate?.(2);
      clock.setLoop?.(true);
      expect(sent).toEqual([]);

      // A load resets the rate and the loop, so they follow it, every
      // time the application loads this source.
      audio.load('clip.mp4');
      audio.applySample(sample({ position: 3 }));
      audio.load('clip.mp4');

      expect(sent).toEqual([
        { type: 'load', src: 'clip.mp4', autoplay: true },
        { type: 'loop', loop: true },
        { type: 'rate', rate: 2 },
        { type: 'load', src: 'clip.mp4', autoplay: true },
        { type: 'loop', loop: true },
        { type: 'rate', rate: 2 }
      ]);
      stop();
    });
  });
});
