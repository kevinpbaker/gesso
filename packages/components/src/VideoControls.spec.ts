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
import {
  Box,
  Canvas2DRenderer,
  Column,
  DirtyFlags,
  type RenderContext,
  type UiChild,
  type VideoTransport
} from 'gesso-core';

import { followTransport, VideoControls, type VideoReadout } from './VideoControls';

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

/**
 * A playing clip's progress is a repaint of the seek bar and nothing
 * else.
 *
 * Its fill and thumb used to be laid out at the position, so every step
 * of the readout was a layout change, and a frame in which a box moved
 * is drawn whole on both renderers: a playing clip drew the whole
 * surface ten times a second for a line a pixel or two longer. The time
 * label is left out of the window on purpose: it changes once a second,
 * and new text is laid out.
 */
describe('VideoControls, playing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves the seek bar without laying anything out, so its frames are drawn in part', () => {
    // The readout steps ten times a second on a timer, not a held frame.
    vi.useFakeTimers();
    const render = vi.spyOn(Canvas2DRenderer.prototype, 'render');
    const clip = new FakeTransport();
    // Just past a second, so the clock reads 0:10 for the whole window.
    clip.position = 10.05;
    const ui = renderTest(createComponent(VideoControls, { transport: clip, visible: true }), {
      width: 480,
      height: 120
    });
    let time = 16;
    const step = (): void => {
      vi.advanceTimersByTime(16);
      ui.frame((time += 16));
    };
    for (let i = 0; i < 10; i++) {
      step();
    }
    const renderer = render.mock.contexts.at(-1) as Canvas2DRenderer;
    const seek = ui.getByRole('slider', { name: 'Seek' });
    const before = seek.properties.get('valueNow') as number;
    const stats = { ...renderer.damageStats };
    render.mockClear();

    // Most of a second at 60 frames a second: eight or nine steps of the
    // readout, and the frames between them.
    for (let i = 0; i < 50; i++) {
      step();
    }

    expect(seek.properties.get('valueNow') as number).toBeGreaterThan(before + 0.5);
    const laidOut: string[] = [];
    for (const call of render.mock.calls) {
      for (const [node, flags] of (call[1] as RenderContext).changes?.frame.entries() ?? []) {
        if ((flags & DirtyFlags.Layout) !== 0) {
          laidOut.push(`${node.type} ${String(node.properties.get('role') ?? '')}`);
        }
      }
    }
    expect(laidOut).toEqual([]);
    expect(renderer.damageStats.whole - stats.whole).toBe(0);
    expect(renderer.damageStats.partial - stats.partial).toBeGreaterThan(0);
  });
});
