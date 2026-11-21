import { afterEach, describe, expect, it, vi } from 'vitest';

import { Box, Column, ScrollView, type UiNode } from 'gesso-core';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * The repaint a fading scrollbar asks for.
 *
 * Nothing about a fade is a property: the bar dims with the clock, so
 * the runtime keeps a timer to get a frame. It marked the root, and
 * Canvas2D, which draws only what changed, drew the whole surface on
 * every frame of every fade. It asks for a frame and marks nothing, and
 * the renderer draws the thumbs again where it drew them; a container
 * is marked once, when its bars have gone.
 */
describe('scrollbar fade', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function mount() {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let pane: UiNode | null = null;
    let other: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        { width: 400 },
        ScrollView(
          { width: 200, height: 100, ref: (node: UiNode | null) => (pane = node) },
          Column({ width: 200 }, Box({ width: 200, height: 600 }))
        ),
        ScrollView(
          { width: 200, height: 100, ref: (node: UiNode | null) => (other = node) },
          Column({ width: 200 }, Box({ width: 200, height: 600 }))
        )
      )
    );
    for (let i = 0; i < 10 && mounted.clock.isPending; i++) {
      mounted.frame();
    }
    const runtime = mounted.runtime as unknown as {
      engine: {
        revealScrollbars(node: UiNode): void;
        recordFor(node: UiNode): { scrollbarVisibleUntil: number } | undefined;
      };
      graph: { getDirtyNodes(): { has(node: UiNode): boolean; isEmpty(): boolean } };
      scheduleScrollbarFade(now: number): void;
      root: UiNode;
    };
    runtime.engine.revealScrollbars(pane!);
    runtime.scheduleScrollbarFade(performance.now());
    return { mounted, runtime, pane: pane!, other: other! };
  }

  it('asks for a frame while a bar fades, and marks nothing', () => {
    const { mounted, runtime } = mount();
    expect(mounted.clock.isPending).toBe(false);

    vi.runOnlyPendingTimers();

    // A frame, for the renderer to draw the thumbs again where it drew
    // them; nothing dirty, so nothing else is drawn.
    expect(mounted.clock.isPending).toBe(true);
    expect(runtime.graph.getDirtyNodes().isEmpty()).toBe(true);
    const drawn = mounted.frames.length;
    mounted.frame();
    expect(mounted.frames.length).toBe(drawn + 1);
    mounted.runtime.dispose();
  });

  it('marks the container whose bar has gone, and not the root', () => {
    const { mounted, runtime, pane, other } = mount();
    // The bar's time is up by the time the timer fires.
    runtime.engine.recordFor(pane)!.scrollbarVisibleUntil = 1;

    vi.runOnlyPendingTimers();

    const dirty = runtime.graph.getDirtyNodes();
    expect(dirty.has(pane)).toBe(true);
    expect(dirty.has(other)).toBe(false);
    expect(dirty.has(runtime.root)).toBe(false);
    mounted.runtime.dispose();
  });
});
