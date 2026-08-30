import { describe, expect, it } from 'vitest';
import { map } from 'rxjs';

import {
  Box,
  Column,
  ScrollView,
  fade,
  linear,
  motion,
  pop,
  scaleFrom,
  sharedElement,
  slideUp,
  type UiNode
} from '@gesso/core';
import { internalState } from '../InternalState';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';

/**
 * The motion layer, asserted where it is observable: on the node's
 * properties.
 *
 * A motion state is not a value a component holds — it is an override
 * the modifier writes onto `transform` and `opacity` — so what a spec
 * can honestly check is what the renderer would read. That is also the
 * thing that actually broke twice while this was written: an element
 * back at rest that kept an identity transform, and a morph that
 * scaled about the corner because the pivot had never been measured.
 */

/** The composed motion on a node, in the six channels that make it up. */
function motionOf(node: UiNode): {
  opacity: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotate: number;
  written: boolean;
} {
  const transform = node.properties.get('transform') as
    | { translateX?: number; translateY?: number; scaleX?: number; scaleY?: number; rotation?: number }
    | undefined;
  const opacity = node.properties.get('opacity');
  return {
    opacity: typeof opacity === 'number' ? opacity : 1,
    x: transform?.translateX ?? 0,
    y: transform?.translateY ?? 0,
    scaleX: transform?.scaleX ?? 1,
    scaleY: transform?.scaleY ?? 1,
    rotate: transform?.rotation ?? 0,
    written: transform !== undefined
  };
}

/** The pivot the composer measured, which should be the node's middle. */
function pivotOf(node: UiNode): { x: number; y: number } {
  const transform = node.properties.get('transform') as { x?: number; y?: number } | undefined;
  return { x: transform?.x ?? 0, y: transform?.y ?? 0 };
}

/** Runs frames until nothing is asking for one, and says how many. */
function drain(mounted: MountedRuntime, limit = 400): number {
  let frames = 0;
  while (mounted.clock.isPending && frames < limit) {
    frames++;
    mounted.frame();
  }
  return frames;
}

describe('motion()', () => {
  it('starts an element at its initial state and releases it to rest', () => {
    let node: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 200 },
        Box({
          ref: (n: UiNode | null) => (node = n),
          width: 40,
          height: 20,
          modifiers: [motion({ initial: [fade, slideUp(24)], duration: 200, easing: linear })]
        })
      )
    );
    // Before any frame runs, the element is already where it starts —
    // which is the whole difference between an entrance and a jump: it
    // is never painted at rest first.
    expect(motionOf(node!).opacity).toBe(0);
    expect(motionOf(node!).y).toBe(24);

    const frames = drain(mounted);
    expect(frames).toBeGreaterThan(8);
    // Home, and the overrides handed back rather than left at identity,
    // so the node has no transform for the renderer to multiply by.
    expect(motionOf(node!).written).toBe(false);
    expect(node!.properties.has('opacity')).toBe(false);
  });

  it('scales about the middle, not the corner', () => {
    let node: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 200 },
        Box({
          ref: (n: UiNode | null) => (node = n),
          width: 80,
          height: 40,
          modifiers: [motion({ initial: scaleFrom(0.5), duration: 1000, easing: linear })]
        })
      )
    );
    // One frame, so it has been laid out and measured but is nowhere
    // near done.
    mounted.frame();
    expect(pivotOf(node!)).toEqual({ x: 40, y: 20 });
    expect(motionOf(node!).scaleX).toBeLessThan(1);
    drain(mounted);
  });

  it('follows an observable state, and asks for no frames once it is there', () => {
    let node: UiNode | null = null;
    const pressed = internalState(false);
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 200 },
        Box({
          ref: (n: UiNode | null) => (node = n),
          width: 40,
          height: 20,
          modifiers: [
            motion({
              state: pressed.pipe(map(down => (down ? scaleFrom(0.9) : null))),
              duration: 100,
              easing: linear
            })
          ]
        })
      )
    );
    drain(mounted);
    expect(mounted.clock.isPending).toBe(false);
    expect(motionOf(node!).written).toBe(false);

    pressed.value = true;
    expect(mounted.clock.isPending).toBe(true);
    drain(mounted);
    expect(motionOf(node!).scaleX).toBeCloseTo(0.9, 3);

    pressed.value = false;
    drain(mounted);
    expect(motionOf(node!).written).toBe(false);
    expect(mounted.clock.isPending).toBe(false);
  });

  it('reports when it has arrived, which is what an exit waits on', () => {
    const settled: string[] = [];
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 200 },
        Box({
          width: 40,
          height: 20,
          modifiers: [motion({ state: pop(0.8), duration: 200, easing: linear, onSettled: () => settled.push('done') })]
        })
      )
    );
    expect(settled).toEqual([]);
    drain(mounted);
    expect(settled).toEqual(['done']);
  });

  it('sleeps through a delay rather than spinning frames that decline to move', () => {
    let node: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 200 },
        Box({
          ref: (n: UiNode | null) => (node = n),
          width: 40,
          height: 20,
          modifiers: [motion({ initial: fade, duration: 100, easing: linear, delay: 200 })]
        })
      )
    );
    drain(mounted);
    // Still invisible, and — the point of the delay reaching `dueAt` —
    // nothing is asking for a frame. A delay is one timer, not twelve
    // frames that each wake up to decide they are not ready yet.
    expect(motionOf(node!).opacity).toBe(0);
    expect(mounted.clock.isPending).toBe(false);
  });
});

describe('sharedElement()', () => {
  it('morphs an arriving element from where the departing one stood', () => {
    // Two boxes of different sizes in different places, one replacing
    // the other under the same name. The second should be drawn where
    // the first was and released.
    const showSecond = internalState(false);
    const seen = new Map<string, UiNode>();
    const mounted = mountRuntime(
      Column(
        { width: 400, height: 400 },
        showSecond.pipe(
          map(second =>
            second
              ? Box({
                  key: 'b',
                  ref: (n: UiNode | null) => n !== null && seen.set('b', n),
                  width: 200,
                  height: 100,
                  marginTop: 100,
                  modifiers: [sharedElement({ name: 'hero', duration: 200, easing: linear })]
                })
              : Box({
                  key: 'a',
                  ref: (n: UiNode | null) => n !== null && seen.set('a', n),
                  width: 100,
                  height: 50,
                  modifiers: [sharedElement({ name: 'hero', duration: 200, easing: linear })]
                })
          )
        )
      )
    );
    drain(mounted);
    expect(motionOf(seen.get('a')!).written).toBe(false);

    showSecond.value = true;
    // One frame: the second box exists, has been laid out, and the
    // modifier has had its first `onLayout`.
    mounted.frame();
    const morph = motionOf(seen.get('b')!);
    // Half as wide and half as tall as it will be, and 100px higher.
    expect(morph.scaleX).toBeCloseTo(0.5, 2);
    expect(morph.scaleY).toBeCloseTo(0.5, 2);
    expect(morph.y).toBeCloseTo(-125, 1);

    drain(mounted);
    expect(motionOf(seen.get('b')!).written).toBe(false);
  });

  it('morphs from where the departing element was seen, not from where it sits in the flow', () => {
    // The bug this pins: a shared element inside a scrolled list used to
    // be picked up from its *flow* box, so a card halfway down a list
    // flew in from however far the list happened to be scrolled. With
    // the list at the top the two boxes agree, which is exactly why
    // reading the wrong one looked right for a while.
    //
    // The card sits 400 into a 450-tall content box in a 200-tall
    // viewport scrolled to 250, so it is *seen* at y = 150 and sits at
    // y = 400 in the flow. It is replaced by a box at y = 200. Measured
    // as it is seen, the centres are 175 and 225 and it travels -50;
    // measured in the flow they are 425 and 225 and it would travel
    // +200, off the bottom of the screen.
    const gone = internalState(false);
    const seen = new Map<string, UiNode>();
    const card = (key: string): ReturnType<typeof Box> =>
      Box({
        key,
        ref: (n: UiNode | null) => n !== null && seen.set(key, n),
        width: 100,
        height: 50,
        modifiers: [sharedElement({ name: 'hero', duration: 200, easing: linear })]
      });
    const mounted = mountRuntime(
      Column(
        { width: 400, height: 600 },
        ScrollView({ width: 400, height: 200, scrollY: 250 }, Box({ width: 400, height: 400 }), card('in-list')),
        gone.pipe(map(swapped => (swapped ? [card('below')] : [])))
      )
    );
    drain(mounted);

    gone.value = true;
    mounted.frame();
    expect(motionOf(seen.get('below')!).y).toBeCloseTo(-50, 0);

    drain(mounted);
    expect(motionOf(seen.get('below')!).written).toBe(false);
  });

  it('does nothing at all for an element that nothing shared a name with', () => {
    let node: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 200 },
        Box({
          ref: (n: UiNode | null) => (node = n),
          width: 40,
          height: 20,
          modifiers: [sharedElement({ name: 'alone' })]
        })
      )
    );
    drain(mounted);
    // An element with nothing to morph from simply appears. Inventing
    // an entrance for it would be an animation nobody asked for.
    expect(motionOf(node!).written).toBe(false);
    expect(mounted.clock.isPending).toBe(false);
  });

  it('hands the name back when it leaves, so a later element starts clean', () => {
    const present = internalState(true);
    let last: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 200 },
        present.pipe(
          map(show =>
            show
              ? [
                  Box({
                    ref: (n: UiNode | null) => n !== null && (last = n),
                    width: 40,
                    height: 20,
                    modifiers: [sharedElement({ name: 'gone' })]
                  })
                ]
              : []
          )
        )
      )
    );
    drain(mounted);
    present.value = false;
    drain(mounted);
    expect(mounted.runtime.sharedElementNames).not.toContain('gone');
    expect(last).not.toBeNull();
  });
});
