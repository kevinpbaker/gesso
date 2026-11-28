import { describe, expect, it } from 'vitest';
import { map } from 'rxjs';

import {
  Box,
  Column,
  videoSource,
  type UiVideoSurface,
  type VideoClock,
  type VideoPlayback,
  type VideoResolver,
  type VideoTransport
} from 'gesso-core';
import { internalState } from '../InternalState';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';

/**
 * Two elements on one playback, which is what a route transition is.
 *
 * The resolver reference-counts by source, so a card and the page it
 * opens into share one decoder — that part always worked. What did not
 * is the position: it is driven by a tween that belongs to the *node*,
 * and a node built for the arriving screen starts its tween at zero.
 * Both screens are mounted at once for the length of the exit, so two
 * tweens drove one playback from two different places, every
 * disagreement was a seek backwards, and a seek drops the frame queue
 * and reconfigures the decoder.
 */

/** A playback that records what it was asked to show. */
class FakePlayback implements VideoPlayback {
  readonly surface: UiVideoSurface = { frame: null, version: 0, width: 4, height: 4 };
  readonly width = 4;
  readonly height = 4;
  readonly duration = 8;
  // Zero so the driving tween asks for every frame: with a real
  // interval the scheduler arms a timer rather than a frame and the
  // manual clock never advances. Pacing is `UiAnimation.spec.ts`'s
  // subject; this file's is where the position comes from.
  readonly frameDurationMs = 0;
  /** Every position presented, in order. */
  readonly shown: number[] = [];
  /** How many times a backwards jump would have reset the decoder. */
  seeks = 0;
  private at = 0;

  get positionMs(): number {
    return this.at;
  }

  present(positionMs: number): boolean {
    if (positionMs === this.at) {
      return false;
    }
    // The real one tolerates 100ms of backwards drift before treating
    // it as a seek; anything beyond that drops the queue.
    if (positionMs + 100 < this.at) {
      this.seeks++;
    }
    this.at = positionMs;
    this.shown.push(positionMs);
    return true;
  }

  onError(): () => void {
    return () => {};
  }
}

class FakeResolver implements VideoResolver {
  readonly playback = new FakePlayback();
  holders = 0;

  async resolve(): Promise<VideoPlayback> {
    this.holders++;
    return this.playback;
  }

  release(): void {
    this.holders--;
  }

  dispose(): void {}
}

/** Lets the resolver's promise chain settle before frames are run. */
async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

function drain(mounted: MountedRuntime, limit = 400): void {
  let frames = 0;
  while (mounted.clock.isPending && frames < limit) {
    frames++;
    mounted.frame();
  }
}

describe('videoSource', () => {
  it('picks a shared playback up where it is, not at the start', async () => {
    const resolver = new FakeResolver();
    const showSecond = internalState(false);
    const mounted = mountRuntime(
      Column(
        { width: 100, height: 100 },
        showSecond.pipe(
          map(second =>
            second
              ? Box({ key: 'b', width: 10, height: 10, modifiers: [videoSource({ resolver, source: 'clip.mp4' })] })
              : Box({ key: 'a', width: 10, height: 10, modifiers: [videoSource({ resolver, source: 'clip.mp4' })] })
          )
        )
      )
    );
    // `resolve` is a promise, so the modifier only starts once it settles.
    await flush();
    for (let i = 0; i < 40; i++) {
      mounted.frame();
    }
    const before = resolver.playback.positionMs;
    expect(before).toBeGreaterThan(0);
    expect(resolver.playback.seeks).toBe(0);

    // The second element arrives while the first is still mounted, which
    // is the state a transition holds for the length of its exit.
    showSecond.value = true;
    mounted.frame();
    await flush();
    for (let i = 0; i < 20; i++) {
      mounted.frame();
    }

    // It joined where the clip already was rather than seeking it back
    // to zero, so the decoder was never reset.
    expect(resolver.playback.seeks).toBe(0);
    expect(resolver.playback.positionMs).toBeGreaterThanOrEqual(before);
  });

  it('shows a paused video where the playback is, not the first frame', async () => {
    // A still joining a playing holder must not drag it back to zero
    // either: `autoplay: false` presents the position rather than 0.
    const resolver = new FakeResolver();
    resolver.playback.present(2000);
    const mounted = mountRuntime(
      Column(
        { width: 100, height: 100 },
        Box({
          width: 10,
          height: 10,
          modifiers: [videoSource({ resolver, source: 'clip.mp4', autoplay: false })]
        })
      )
    );
    await flush();
    drain(mounted);
    expect(resolver.playback.seeks).toBe(0);
    expect(resolver.playback.positionMs).toBe(2000);
  });

  it('does nothing when asked for a position it is already showing', async () => {
    // Two holders present on their own ticks. The second one to reach a
    // given position has no work to do, and doing it anyway costs a
    // walk of the frame queue and a decode top-up per frame.
    const resolver = new FakeResolver();
    resolver.playback.present(500);
    const shown = resolver.playback.shown.length;
    expect(resolver.playback.present(500)).toBe(false);
    expect(resolver.playback.shown.length).toBe(shown);
  });
});

/** A clock a spec starts and stops by hand, recording what it was asked. */
class FakeClock implements VideoClock {
  position = 0;
  running = false;
  readonly asked: string[] = [];
  private readonly listeners = new Set<() => void>();

  positionSeconds(): number {
    return this.position;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** What the sound reporting back does: says it started or stopped. */
  report(running: boolean): void {
    this.running = running;
    for (const listener of this.listeners) {
      listener();
    }
  }

  play(): void {
    this.asked.push('play');
  }

  pause(): void {
    this.asked.push('pause');
  }

  seek(seconds: number): void {
    this.asked.push(`seek ${seconds}`);
  }

  /** The settings it was given, apart from the requests, in order. */
  readonly given: string[] = [];

  setRate(rate: number): void {
    this.given.push(`rate ${rate}`);
  }

  setLoop(loop: boolean): void {
    this.given.push(`loop ${loop}`);
  }

  setVolume(volume: number, muted: boolean): void {
    this.given.push(`volume ${volume}${muted ? ' muted' : ''}`);
  }
}

async function mountOnClock(clock: VideoClock, options: { loop?: boolean; rate?: number; volume?: number } = {}) {
  const resolver = new FakeResolver();
  let transport: VideoTransport | null = null;
  const mounted = mountRuntime(
    Column(
      { width: 100, height: 100 },
      Box({
        width: 10,
        height: 10,
        modifiers: [
          videoSource({
            resolver,
            source: 'clip.mp4',
            autoplay: false,
            clock,
            ...options,
            onReady: next => (transport = next)
          })
        ]
      })
    )
  );
  await flush();
  drain(mounted);
  if (transport === null) {
    throw new Error('the clip never became ready');
  }
  return { mounted, resolver, transport: transport as VideoTransport };
}

describe('videoSource on a clock that owns time', () => {
  it('asks the clock to play, and moves only when the clock says it is running', async () => {
    const clock = new FakeClock();
    const { mounted, resolver, transport } = await mountOnClock(clock);

    transport.play();
    drain(mounted);

    // A sound the browser refused to start must not leave the picture
    // running on in silence.
    expect(clock.asked).toEqual(['play']);
    expect(transport.paused).toBe(true);
    expect(resolver.playback.positionMs).toBe(0);

    clock.report(true);
    for (let i = 0; i < 10; i++) {
      mounted.frame();
    }

    expect(transport.paused).toBe(false);
    expect(resolver.playback.positionMs).toBeGreaterThan(0);
  });

  it('asks the clock to pause, and stops when the clock says it stopped', async () => {
    const clock = new FakeClock();
    const { mounted, resolver, transport } = await mountOnClock(clock);
    clock.report(true);
    for (let i = 0; i < 10; i++) {
      mounted.frame();
    }

    transport.pause();
    expect(clock.asked).toEqual(['pause']);
    expect(transport.paused).toBe(false);

    clock.position = resolver.playback.positionMs / 1000;
    clock.report(false);
    const held = resolver.playback.positionMs;
    drain(mounted);

    expect(transport.paused).toBe(true);
    expect(resolver.playback.positionMs).toBe(held);
  });

  it('tells the clock about a seek and moves the picture at once', async () => {
    const clock = new FakeClock();
    const { resolver, transport } = await mountOnClock(clock);

    transport.seek(3);

    expect(clock.asked).toEqual(['seek 3']);
    expect(resolver.playback.positionMs).toBe(3000);
  });

  it('holds the last frame at the end when it does not loop', async () => {
    const clock = new FakeClock();
    const { mounted, resolver } = await mountOnClock(clock, { loop: false });
    clock.report(true);

    drain(mounted, 1000);
    for (let i = 0; i < 10; i++) {
      mounted.frame();
    }

    // The clip is 8 s. The clock decides, so the picture waits at the
    // end for it.
    expect(resolver.playback.positionMs).toBe(8000);
    expect(resolver.playback.seeks).toBe(0);
  });

  it('loops with a clock that was told to loop', async () => {
    const clock = new FakeClock();
    const { mounted, resolver } = await mountOnClock(clock);
    clock.report(true);

    let wrapped = false;
    let last = 0;
    for (let i = 0; i < 700 && !wrapped; i++) {
      mounted.frame();
      wrapped = resolver.playback.positionMs < last;
      last = resolver.playback.positionMs;
    }

    expect(clock.given).toContain('loop true');
    expect(wrapped).toBe(true);
  });

  it('holds the last frame on a clock that cannot loop, rather than looping in silence', async () => {
    const clock = new FakeClock();
    const noLoop: VideoClock = {
      positionSeconds: () => clock.positionSeconds(),
      get running() {
        return clock.running;
      },
      onChange: listener => clock.onChange(listener),
      play: () => clock.play()
    };
    const { mounted, resolver } = await mountOnClock(noLoop);
    clock.report(true);

    drain(mounted, 1000);

    expect(resolver.playback.positionMs).toBe(8000);
  });

  it('gives the clock its settings when attached, and each change after', async () => {
    const clock = new FakeClock();
    const { transport } = await mountOnClock(clock, { loop: false, rate: 1.5, volume: 0.5 });
    expect(clock.given).toEqual(['loop false', 'rate 1.5', 'volume 0.5']);

    transport.setRate(2);
    transport.setVolume(0.8);
    transport.setMuted(true);

    expect(clock.given.slice(3)).toEqual(['rate 2', 'volume 0.8', 'volume 0.8 muted']);
    expect(transport.rate).toBe(2);
  });

  it('keeps its own transport over a clock that only reports', async () => {
    const clock = new FakeClock();
    const readOnly: VideoClock = {
      positionSeconds: () => clock.positionSeconds(),
      get running() {
        return clock.running;
      },
      onChange: listener => clock.onChange(listener)
    };
    const { transport } = await mountOnClock(readOnly);

    transport.play();

    expect(clock.asked).toEqual([]);
    expect(transport.paused).toBe(false);
  });
});
