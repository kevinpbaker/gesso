import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import {
  AnimationService,
  createComponent,
  internalState,
  show,
  type ComponentContext,
  type Inputs
} from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Box, Column, type UiChild, type VideoTransport } from 'gesso-core';

import { followTransport, type VideoReadout } from './VideoControls';

/**
 * `followTransport`, the readout under the bar and under a player's
 * captions.
 *
 * The claims are about lifetime: a transport that has been replaced,
 * or that outlived the component following it, must stop reaching the
 * readout. Before this held, every switch left a listener behind that
 * restarted the readout's tween whenever the old clip was touched.
 */

/** A transport that is playing, and that counts who is listening. */
class FakeTransport implements VideoTransport {
  duration = 60;
  position = 0;
  paused = false;
  rate = 1;
  volume = 1;
  muted = false;
  seeking = false;
  state = 'playing' as VideoTransport['state'];
  readonly listeners = new Set<() => void>();

  play(): void {}
  pause(): void {}
  seek(seconds: number): void {
    this.position = seconds;
    this.emit();
  }
  setRate(): void {}
  setVolume(): void {}
  setMuted(): void {}
  retry(): void {}
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

let animate: MockInstance<AnimationService['animate']>;

beforeEach(() => {
  animate = vi.spyOn(AnimationService.prototype, 'animate');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('followTransport', () => {
  function mount() {
    const transport = internalState<VideoTransport | null>(null, 'spec.transport');
    const visible = internalState(true, 'spec.visible');
    let readout: VideoReadout | null = null;
    function Follower(_inputs: Inputs<object>, ctx: ComponentContext): UiChild {
      readout = followTransport(ctx, transport);
      return Box({ width: 10, height: 10 });
    }
    const ui = renderTest(
      Column(
        {},
        show(visible, () => createComponent(Follower, {}))
      )
    );
    return {
      ui,
      transport,
      visible,
      readout: (): VideoReadout => readout!,
      animations: (): AnimationService => ui.runtime.services.get(AnimationService)
    };
  }

  it("lets go of the old transport when it is replaced, so the old clip's changes reach nothing", () => {
    const { transport, readout } = mount();
    const first = new FakeTransport();
    const second = new FakeTransport();

    transport.value = first;
    expect(first.listeners.size).toBe(1);

    transport.value = second;
    expect(first.listeners.size).toBe(0);
    expect(second.listeners.size).toBe(1);

    animate.mockClear();
    first.seek(30);
    expect(animate).not.toHaveBeenCalled();
    expect(readout().position.value).toBe(0);

    // The new one still drives it.
    second.seek(12);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(readout().position.value).toBe(12);
  });

  it('lets go of the transport and stops the readout when the component leaves', () => {
    const { ui, transport, visible, readout, animations } = mount();
    const clip = new FakeTransport();
    transport.value = clip;
    expect(animations().animationFor(readout().position)).toBeDefined();

    visible.value = false;
    ui.frame(16);

    expect(clip.listeners.size).toBe(0);
    expect(animations().animationFor(readout().position)).toBeUndefined();

    animate.mockClear();
    clip.seek(20);
    transport.value = new FakeTransport();
    expect(animate).not.toHaveBeenCalled();
    expect(animations().animationFor(readout().position)).toBeUndefined();
  });
});
