import { describe, expect, it } from 'vitest';
import { map } from 'rxjs';

import {
  Box,
  Column,
  LazyRow,
  noKeyModifiers,
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

  it('says when it is morphing, so a layout can stack it over its neighbours', () => {
    // A morphing element is bigger than its resting self for most of the
    // way, so it overlaps whatever sits beside it. What has to rise is
    // usually an ancestor rather than the element itself, and a modifier
    // cannot reach one — so it reports, and the layout decides.
    const showSecond = internalState(false);
    const reported: boolean[] = [];
    const mounted = mountRuntime(
      Column(
        { width: 400, height: 400 },
        showSecond.pipe(
          map(second =>
            second
              ? Box({
                  key: 'b',
                  width: 200,
                  height: 100,
                  marginTop: 100,
                  modifiers: [
                    sharedElement({
                      name: 'hero',
                      duration: 200,
                      easing: linear,
                      onMorph: active => reported.push(active)
                    })
                  ]
                })
              : Box({
                  key: 'a',
                  width: 100,
                  height: 50,
                  modifiers: [
                    sharedElement({
                      name: 'hero',
                      duration: 200,
                      easing: linear,
                      onMorph: active => reported.push(active)
                    })
                  ]
                })
          )
        )
      )
    );
    drain(mounted);
    // Nothing shared the name with the first one, so it never morphed.
    expect(reported).toEqual([]);

    showSecond.value = true;
    // Reported at the claim, before the frame runs: a raise made in
    // answer to it has to be in that frame's layout, where paint order
    // is sorted. The test below is what goes wrong otherwise.
    expect(reported).toEqual([true]);
    mounted.frame();
    expect(reported).toEqual([true]);

    drain(mounted);
    expect(reported).toEqual([true, false]);
  });

  it('lets a raised ancestor put the morphing element over its neighbours', () => {
    // The reason `onMorph` exists, end to end. A shrinking element is
    // bigger than its resting self for the whole morph, so it covers
    // the sibling below it — and paint order is tree order among
    // siblings, so without a raise the sibling below is drawn on top.
    //
    // Asserted on the draw order, because that is the thing the viewer
    // sees. Each box is given a size nothing else shares so a fill can
    // be told from the others.
    const detail = internalState(false);
    const morphing = internalState(false);
    const mounted = mountRuntime(
      Column(
        { width: 400, height: 600 },
        detail.pipe(
          map(open =>
            open
              ? Box({
                  key: 'detail',
                  width: 400,
                  height: 600,
                  backgroundColor: '#000000',
                  modifiers: [sharedElement({ name: 'hero', duration: 400, easing: linear })]
                })
              : Column(
                  { width: 400 },
                  // The card, raised only while what is inside it morphs.
                  Box(
                    {
                      key: 'card',
                      width: 200,
                      height: 100,
                      zIndex: morphing.pipe(map(active => (active ? 1 : 0)))
                    },
                    Box({
                      width: 190,
                      height: 90,
                      backgroundColor: '#000000',
                      modifiers: [
                        sharedElement({
                          name: 'hero',
                          duration: 400,
                          easing: linear,
                          onMorph: active => (morphing.value = active)
                        })
                      ]
                    })
                  ),
                  // The neighbour, later in tree order.
                  Box({ key: 'b', width: 180, height: 80, backgroundColor: '#ffffff' })
                )
          )
        )
      )
    );
    const fills = mounted.canvas.ctx.fillRect;
    /** Which of the two was filled last on the frame that just ran. */
    const onTop = (): string | null => {
      let top: string | null = null;
      for (const [, , width] of fills.mock.calls as [number, number, number][]) {
        if (width === 190) {
          top = 'card';
        } else if (width === 180) {
          top = 'neighbour';
        }
      }
      return top;
    };

    drain(mounted);
    expect(onTop()).toBe('neighbour');

    detail.value = true;
    drain(mounted);

    // Coming back, the card's inner box morphs down from 400x600, so
    // for the length of the morph it covers the neighbour's row. The
    // very first frame included: the raise is asked for at the claim,
    // before that frame lays out and sorts its paint order. Asked for
    // from the layout callback instead (where the FLIP is applied) it
    // landed after the sort, and that one frame with the neighbour
    // drawn over the card was a visible flash in the transitions
    // example.
    detail.value = false;
    expect(morphing.value).toBe(true);
    fills.mockClear();
    mounted.frame();
    expect(onTop()).toBe('card');
    fills.mockClear();
    mounted.frame();
    expect(onTop()).toBe('card');

    // And gives the row back once it has arrived: `onTop` reads the
    // last frame that drew, which is the settled one.
    fills.mockClear();
    drain(mounted);
    expect(morphing.value).toBe(false);
    expect(onTop()).toBe('neighbour');
  });

  /**
   * Where a morph spends its time: the fraction of the journey elapsed
   * by the moment it has covered half the distance, plus how long the
   * whole thing takes.
   */
  function pacing(spring: 'snappy' | undefined): { halfwayAt: number; frames: number } {
    const showSecond = internalState(false);
    let node: UiNode | null = null;
    const shared = (): ReturnType<typeof sharedElement> =>
      sharedElement(spring === undefined ? { name: 'hero' } : { name: 'hero', spring });
    const mounted = mountRuntime(
      Column(
        { width: 400, height: 900 },
        showSecond.pipe(
          map(second =>
            second
              ? Box({
                  key: 'b',
                  ref: (n: UiNode | null) => (node = n),
                  width: 200,
                  height: 100,
                  modifiers: [shared()]
                })
              : Box({ key: 'a', width: 200, height: 100, marginTop: 700, modifiers: [shared()] })
          )
        )
      )
    );
    drain(mounted);

    showSecond.value = true;
    mounted.frame();
    const start = Math.abs(motionOf(node!).y);
    expect(start).toBeGreaterThan(600);

    const path: number[] = [];
    while (mounted.clock.isPending) {
      mounted.frame();
      path.push(Math.abs(motionOf(node!).y));
    }
    expect(path[path.length - 1]).toBe(0);
    const halfway = path.findIndex(left => left <= start / 2);
    return { halfwayAt: (halfway + 1) / path.length, frames: path.length };
  }

  it('spends a long morph evenly, rather than most of it at once', () => {
    // The defect this replaced, stated as a number. A spring's curve is
    // the same proportion of the move whatever the move is, so the
    // measured `snappy` morph over 676px was half done in about 165ms
    // and then took the best part of a second to arrive: nearly all of
    // the movement in the first tenth of the time, which the eye reads
    // as a jump to the middle and a slow settle. A card near the middle
    // of a list travels a hundred pixels and the same curve looks like
    // a gentle expansion — which is why this only showed up on a card
    // near the edge of the screen.
    const timed = pacing(undefined);
    expect(timed.halfwayAt).toBeGreaterThan(0.2);
    expect(timed.frames).toBeLessThan(30);

    // The same journey on the old default, for the comparison to be
    // real rather than asserted: half the distance gone in a small
    // fraction of a much longer settle.
    const sprung = pacing('snappy');
    expect(sprung.halfwayAt).toBeLessThan(timed.halfwayAt);
    expect(sprung.frames).toBeGreaterThan(timed.frames);
  });

  it('still takes a spring when one is asked for', () => {
    // The principle a spring exists for has not gone: a movement that
    // follows a gesture has a real velocity and no natural duration.
    // Naming one turns the default duration off rather than fighting
    // it, which is the bug a `{spring, duration}` pair would be.
    expect(pacing('snappy').frames).toBeGreaterThan(30);
  });

  it('scales text by one ratio, so a different line count cannot squash it', () => {
    // A FLIP derives a scale per axis from two boxes, which is right
    // for a picture and wrong for a line of text: the box shape follows
    // the line breaks, while the type inside only ever grows by its
    // font size. Measured in the transitions example at 390x844, where
    // the page title wraps to two lines and the card's stays on one:
    // 0.79 across against 0.34 down, and the letters visibly squashed.
    let node: UiNode | null = null;
    const showSecond = internalState(false);
    const mounted = mountRuntime(
      Column(
        { width: 400, height: 400 },
        showSecond.pipe(
          map(second =>
            second
              ? // Same width, three times the height: a wrapped line.
                Box({
                  key: 'b',
                  ref: (n: UiNode | null) => (node = n),
                  width: 200,
                  height: 90,
                  modifiers: [sharedElement({ name: 'hero', scale: 'uniform', duration: 200, easing: linear })]
                })
              : Box({
                  key: 'a',
                  width: 100,
                  height: 30,
                  modifiers: [sharedElement({ name: 'hero', scale: 'uniform', duration: 200, easing: linear })]
                })
          )
        )
      )
    );
    drain(mounted);

    showSecond.value = true;
    mounted.frame();
    const at = motionOf(node!);
    // The width ratio, on both axes: 100/200. Free, the height would
    // have contributed 30/90 and the box would have been squashed to a
    // third of its height while only halving its width.
    expect(at.scaleX).toBeCloseTo(0.5, 6);
    expect(at.scaleY).toBeCloseTo(0.5, 6);
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

describe('sharedElement() and a virtualised shelf', () => {
  /**
   * A shelf of cards that mounts only what is in view, and a page that
   * opens from one of them.
   *
   * This is the arrangement `docs/MUSIC_ROADMAP.md` M1 asks to check
   * before it builds eight of them: a shelf item scrolled out of a
   * `LazyRow` has no node left to morph from, and the wrong answer
   * would be to morph the page in from whatever box the registry
   * happened to be holding. Named per item, so the page claims the name
   * of the one it was opened from.
   */
  function shelf(open: ReturnType<typeof internalState<number | null>>, morphs: boolean[]) {
    return Column(
      { width: 400, height: 500 },
      LazyRow(
        { width: 400, height: 100, count: 100, estimatedExtent: 100, overscan: 1, initialViewportExtent: 400 },
        index =>
          Box({
            key: `item-${index}`,
            width: 100,
            height: 100,
            modifiers: [sharedElement({ name: `shelf-${index}`, duration: 200, easing: linear })]
          })
      ),
      open.pipe(
        map(index =>
          index === null
            ? []
            : [
                Box({
                  key: 'page',
                  width: 400,
                  height: 300,
                  modifiers: [
                    sharedElement({
                      name: `shelf-${index}`,
                      duration: 200,
                      easing: linear,
                      onMorph: active => morphs.push(active)
                    })
                  ]
                })
              ]
        )
      )
    );
  }

  it('morphs the page in from a shelf item that is still mounted', () => {
    const open = internalState<number | null>(null);
    const morphs: boolean[] = [];
    const mounted = mountRuntime(shelf(open, morphs));
    drain(mounted);

    open.value = 1;
    mounted.frame();
    // Item 1 is in view, so the registry still holds its box and the
    // page arrives as a morph rather than as a new element.
    expect(morphs[0]).toBe(true);

    drain(mounted);
    expect(morphs).toEqual([true, false]);
  });

  it('lets the page simply arrive when the shelf item has scrolled out of the window', () => {
    const open = internalState<number | null>(null);
    const morphs: boolean[] = [];
    const mounted = mountRuntime(shelf(open, morphs));
    drain(mounted);
    expect(mounted.runtime.sharedElementNames).toContain('shelf-1');

    // Far enough right that item 1 is well outside the window and its
    // node has gone, which is what releases the name.
    mounted.runtime.input.wheel.wheel(100, 50, 4000, 0, noKeyModifiers());
    drain(mounted);
    expect(mounted.runtime.sharedElementNames).not.toContain('shelf-1');

    open.value = 1;
    drain(mounted);
    // No morph was ever begun, and nothing wrote a transform onto the
    // page: with no box to come from it is an element that is simply
    // appearing, which is what an `initial` motion beside it would
    // then animate.
    expect(morphs).toEqual([]);
  });
});
