import { describe, expect, it, vi } from 'vitest';
import { map } from 'rxjs';

import { Box, Column, ScrollView, type UiNode, linear, spring, tween, animateLayout } from 'gesso-core';
import { internalState } from '../InternalState';
import { AnimationService } from './AnimationService';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * F4's `ticks` phase, and the one claim a spec of an animation can
 * usefully make.
 *
 * The structure tier recorded the shape of the bug a spec cannot catch:
 * one that synthesises the event a component asks for cannot tell you
 * the component asks for the wrong event. The animation analogue is a
 * spec that advances a clock by exactly the duration and asserts the
 * end value — it proves the arithmetic, which `UiAnimation.spec.ts`
 * already does, and says nothing about whether frames arrive at all.
 *
 * So what is asserted here is **arrival**: that a running animation
 * keeps arming frames on an otherwise idle app, and that an idle one
 * arms none. The manual clock makes that observable — `isPending` is
 * literally "a frame has been asked for" — and it is the thing the
 * scheduler's dirty-set contract does not give for free.
 */
describe('the ticks phase', () => {
  it('keeps frames coming by itself while something is animating', () => {
    const opacity = internalState(0);
    const mounted = mountRuntime(Column({}, Box({ width: 20, height: 20, opacity })));
    // Drain whatever the first build asked for, so what follows is an
    // app with nothing dirty and nothing pending.
    let time = 0;
    while (mounted.clock.isPending) {
      time += 16;
      mounted.clock.tick(time);
    }
    expect(mounted.clock.isPending).toBe(false);

    mounted.runtime.services.get(AnimationService).animate(opacity, 1, { duration: 200, easing: linear });

    // Starting it armed a frame, with nothing marked dirty by anyone.
    expect(mounted.clock.isPending).toBe(true);

    let frames = 0;
    while (mounted.clock.isPending && frames < 200) {
      time += 16;
      frames++;
      mounted.clock.tick(time);
    }

    expect(opacity.value).toBe(1);
    // Roughly 200 ms at 16 ms a frame, and then it stopped asking.
    expect(frames).toBeGreaterThan(8);
    expect(frames).toBeLessThan(20);
    expect(mounted.clock.isPending).toBe(false);
  });

  it('reports 0 on a frame with nothing running, and arms nothing', () => {
    const mounted = mountRuntime(Column({}, Box({ width: 20, height: 20 })));
    let time = 0;
    while (mounted.clock.isPending) {
      time += 16;
      mounted.clock.tick(time);
    }
    expect(mounted.frames.length).toBeGreaterThan(0);
    for (const metrics of mounted.frames) {
      expect(metrics.phases.ticks).toBe(0);
    }
    expect(mounted.clock.isPending).toBe(false);
  });

  it('waits out an animation that does not want every frame', () => {
    vi.useFakeTimers();
    try {
      const step = internalState(0);
      const mounted = mountRuntime(Column({}, Box({ width: 20, height: 20, opacity: step })));
      let time = 0;
      while (mounted.clock.isPending) {
        time += 16;
        mounted.clock.tick(time);
      }
      mounted.runtime.services
        .get(AnimationService)
        .animate(step, 1, { duration: 800, easing: linear, stepMs: 100, repeat: true });
      mounted.clock.tick((time += 16));

      // The first tick has happened and the next is 100 ms away, so
      // the runtime is on a timer rather than holding a frame open.
      expect(mounted.clock.isPending).toBe(false);
      vi.advanceTimersByTime(100);
      expect(mounted.clock.isPending).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a declared transition', () => {
  function firstBox(root: UiNode | null): UiNode {
    const child = root?.firstChild;
    if (child == null) {
      throw new Error('no child');
    }
    return child;
  }

  it('turns a write into a movement, and passes through the values between', () => {
    const opacity = internalState(1);
    let node: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        { ref: (n: UiNode | null) => (node = n) },
        Box({ width: 20, height: 20, opacity, transition: { opacity: tween(200, { easing: linear }) } })
      )
    );
    let time = 0;
    while (mounted.clock.isPending) {
      time += 16;
      mounted.clock.tick(time);
    }
    const box = firstBox(node);
    expect(box.properties.get('opacity')).toBe(1);

    opacity.value = 0;
    // The write did not land; it became a target.
    expect(box.properties.get('opacity')).toBe(1);

    const seen: number[] = [];
    while (mounted.clock.isPending && seen.length < 100) {
      time += 16;
      mounted.clock.tick(time);
      seen.push(box.properties.get('opacity') as number);
    }
    expect(seen.at(-1)).toBe(0);
    expect(seen.some(value => value > 0 && value < 1)).toBe(true);
  });

  it('a bare number is a duration in milliseconds', () => {
    let node: UiNode | null = null;
    const width = internalState(100);
    const mounted = mountRuntime(
      Column({ ref: (n: UiNode | null) => (node = n) }, Box({ width, height: 20, transition: { width: 100 } }))
    );
    let time = 0;
    while (mounted.clock.isPending) {
      time += 16;
      mounted.clock.tick(time);
    }
    width.value = 200;
    expect(firstBox(node).properties.get('width')).toBe(100);
    while (mounted.clock.isPending && time < 5000) {
      time += 16;
      mounted.clock.tick(time);
    }
    expect(firstBox(node).properties.get('width')).toBe(200);
  });

  it("a node's first value is not a change, so nothing animates into view", () => {
    let node: UiNode | null = null;
    mountRuntime(
      Column(
        { ref: (n: UiNode | null) => (node = n) },
        Box({ width: 20, height: 20, opacity: 0.5, transition: { opacity: 200 } })
      )
    );
    expect(firstBox(node).properties.get('opacity')).toBe(0.5);
  });

  it('re-emitting the same target does not restart it', () => {
    const opacity = internalState(1);
    let node: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        { ref: (n: UiNode | null) => (node = n) },
        Box({ width: 20, height: 20, opacity, transition: { opacity: spring('gentle') } })
      )
    );
    let time = 0;
    while (mounted.clock.isPending) {
      time += 16;
      mounted.clock.tick(time);
    }
    opacity.value = 0;
    for (let i = 0; i < 4; i++) {
      time += 16;
      mounted.clock.tick(time);
    }
    const midway = firstBox(node).properties.get('opacity') as number;
    // A spring told again where it is already going keeps its velocity
    // rather than starting over from where it has got to.
    opacity.value = 0;
    time += 16;
    mounted.clock.tick(time);
    expect(firstBox(node).properties.get('opacity') as number).toBeLessThan(midway);
  });

  it('writes a value it cannot blend directly, and says so once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const color = internalState<string>('surface');
      let node: UiNode | null = null;
      mountRuntime(
        Column(
          { ref: (n: UiNode | null) => (node = n) },
          Box({ width: 20, height: 20, backgroundColor: color, transition: { backgroundColor: 200 } })
        )
      );
      color.value = 'controlAccent';
      expect(firstBox(node).properties.get('backgroundColor')).toBe('controlAccent');
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  it('rejects a transition naming something that is not a property', () => {
    // The type system rejects it too — `transition` is keyed by the
    // registry — so the cast is what an untyped caller would hit.
    expect(() => mountRuntime(Column({}, Box({ width: 10, transition: { opacty: 200 } as never })))).toThrow(
      /not a UI property/
    );
  });

  it('cancels what is in flight when the node leaves the tree', () => {
    const opacity = internalState(1);
    const shown = internalState(true);
    const mounted = mountRuntime(
      Column(
        {},
        shown.pipe(
          map(visible =>
            visible
              ? [Box({ width: 20, height: 20, opacity, transition: { opacity: tween(400, { easing: linear }) } })]
              : []
          )
        )
      )
    );
    let time = 0;
    while (mounted.clock.isPending) {
      time += 16;
      mounted.clock.tick(time);
    }
    opacity.value = 0;
    time += 16;
    mounted.clock.tick(time);

    shown.value = false;
    // The animation is gone with its node: nothing keeps asking for
    // frames, which is the leak a held animation causes.
    let frames = 0;
    while (mounted.clock.isPending && frames < 10) {
      time += 16;
      frames++;
      mounted.clock.tick(time);
    }
    expect(mounted.clock.isPending).toBe(false);
  });
});

/** The translation a FLIP wrote, or zeroes when it wrote nothing. */
function translationOf(node: UiNode): { x: number; y: number } {
  const transform = node.properties.get('transform') as { translateX?: number; translateY?: number } | undefined;
  return { x: transform?.translateX ?? 0, y: transform?.translateY ?? 0 };
}

describe('animateLayout', () => {
  /** Stable per-id ref callbacks, so each one fires once. */
  function refs(into: Map<number, UiNode>): (id: number) => (node: UiNode | null) => void {
    const made = new Map<number, (node: UiNode | null) => void>();
    return id => {
      let fn = made.get(id);
      if (fn === undefined) {
        fn = (node: UiNode | null) => {
          if (node !== null) {
            into.set(id, node);
          }
        };
        made.set(id, fn);
      }
      return fn;
    };
  }

  it('offsets a reordered node back to where it was and springs it home', () => {
    const seen = new Map<number, UiNode>();
    const ref = refs(seen);
    const order = internalState([0, 1, 2]);
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 300 },
        order.pipe(
          map(ids =>
            ids.map(id => Box({ key: id, ref: ref(id), width: 20, height: 40, modifiers: [animateLayout(undefined)] }))
          )
        )
      )
    );
    let time = 0;
    while (mounted.clock.isPending) {
      time += 16;
      mounted.clock.tick(time);
    }
    expect(seen.get(2)!.properties.has('transform')).toBe(false);

    order.value = [2, 0, 1];
    time += 16;
    mounted.clock.tick(time);

    // Both are drawn where they were, not where layout has put them —
    // through the transform's translation, which is paint-only, so the
    // node is offset without the layout engine running for it.
    expect(translationOf(seen.get(2)!).y).toBeCloseTo(80, 3);
    expect(translationOf(seen.get(0)!).y).toBeCloseTo(-40, 3);
    // And not by moving it in the flow, which is what it used to do.
    expect(seen.get(2)!.properties.has('top')).toBe(false);
    expect(seen.get(2)!.properties.has('position')).toBe(false);

    let frames = 0;
    while (mounted.clock.isPending && frames < 300) {
      time += 16;
      frames++;
      mounted.clock.tick(time);
    }
    // Home, and the override handed back rather than left at identity.
    expect(seen.get(2)!.properties.has('transform')).toBe(false);
    expect(frames).toBeGreaterThan(4);
  });

  it('follows a neighbour that grows instead of being held still', () => {
    // The bug the browser found on the example's first click: the card
    // above expands, and the card below — pinned by its own FLIP while
    // the layout moved under it every frame — was grown straight over.
    // Nothing changed places here, so nothing should be animated.
    const height = internalState(40);
    let below: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 300 },
        Box({ width: 20, height }),
        Box({ ref: (n: UiNode | null) => (below = n), width: 20, height: 40, modifiers: [animateLayout(undefined)] })
      )
    );
    let time = 0;
    while (mounted.clock.isPending) {
      time += 16;
      mounted.clock.tick(time);
    }

    for (const next of [50, 60, 70, 80]) {
      height.value = next;
      time += 16;
      mounted.clock.tick(time);
      expect(below!.properties.has('transform')).toBe(false);
    }
    // And no frames are being asked for on its behalf.
    expect(mounted.clock.isPending).toBe(false);
  });
});

describe('animateLayout and scrolling', () => {
  it('does not mistake a scroll for a move', () => {
    // The browser found this one. `onLayout` reports the *visible*
    // box, which every node under a scroller shares the movement of,
    // so a FLIP reading that box made every row of every list lag
    // behind the page scroll and catch up. It reads `flowBox`.
    const offset = internalState(0);
    let row: UiNode | null = null;
    const mounted = mountRuntime(
      ScrollView(
        { width: 200, height: 100, scrollY: offset },
        Box({ width: 20, height: 400 }),
        Box({ ref: (n: UiNode | null) => (row = n), width: 20, height: 20, modifiers: [animateLayout(undefined)] })
      )
    );
    let time = 0;
    while (mounted.clock.isPending) {
      time += 16;
      mounted.clock.tick(time);
    }
    offset.value = 120;
    time += 16;
    mounted.clock.tick(time);

    expect(row!.properties.has('transform')).toBe(false);
  });
});

describe('reduced motion', () => {
  it('makes an animation arrive at once, and schedules no frames for it', () => {
    const opacity = internalState(0);
    const mounted = mountRuntime(Column({}, Box({ width: 20, height: 20, opacity })));
    let time = 0;
    while (mounted.clock.isPending) {
      time += 16;
      mounted.clock.tick(time);
    }
    mounted.runtime.setReducedMotion(true);
    expect(mounted.runtime.reducedMotion).toBe(true);

    mounted.runtime.services.get(AnimationService).animate(opacity, 1, { duration: 400 });
    expect(opacity.value).toBe(1);
    // The value changed, so a frame is due for the paint — but no
    // further frame is armed once it has run.
    while (mounted.clock.isPending && time < 2000) {
      time += 16;
      mounted.clock.tick(time);
    }
    expect(mounted.frames.every(metrics => metrics.phases.ticks === 0)).toBe(true);
  });

  it('is readable by a component through the store', () => {
    const mounted = mountRuntime(Column({}, Box({ width: 20, height: 20 })));
    const animations = mounted.runtime.services.get(AnimationService);
    const seen: boolean[] = [];
    animations.reducedMotion.subscribe(value => seen.push(value));
    mounted.runtime.setReducedMotion(true);
    mounted.runtime.setReducedMotion(true);
    expect(seen).toEqual([false, true]);
  });
});
