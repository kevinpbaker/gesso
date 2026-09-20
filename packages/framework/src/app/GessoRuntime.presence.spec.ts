import { describe, expect, it } from 'vitest';
import { map } from 'rxjs';

import { Box, Column, Text, fade, linear, percent, sharedElement, slideUp, type UiNode } from 'gesso-core';
import { createComponent } from '../createComponent';
import { internalState } from '../InternalState';
import { Presence } from '../Presence';
import { route } from '../router/RouteDefinition';
import { RouterOutlet } from '../router/RouterOutlet';
import { RouterService } from '../router/RouterService';
import type { Inputs } from '../FunctionComponent';
import type { OutletProps } from '../router/RouteDefinition';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';

/**
 * The exit animation that was left open, and the route
 * transition built on it.
 *
 * What is worth asserting is not the arithmetic — `UiAnimation.spec`
 * has that — but the *lifetime*: that a child which has logically left
 * is still in the tree while it goes, that it does eventually leave,
 * and that nothing is held once it has. A leak here looks exactly like
 * a rendering bug, so it is checked by counting nodes rather than by
 * watching pixels.
 */

/** The graph root, which the runtime keeps to itself outside a spec. */
function rootOf(mounted: MountedRuntime): UiNode {
  return (mounted.runtime as unknown as { graph: { root: UiNode } }).graph.root;
}

function drain(mounted: MountedRuntime, limit = 400): number {
  let frames = 0;
  while (mounted.clock.isPending && frames < limit) {
    frames++;
    mounted.frame();
  }
  return frames;
}

/** Every node in the tree whose `text` matches, however deep. */
function textsIn(node: UiNode): string[] {
  const found: string[] = [];
  const stack: UiNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const text = current.properties.get('text');
    if (typeof text === 'string') {
      found.push(text);
    }
    for (let child = current.firstChild; child !== null; child = child.nextSibling) {
      stack.push(child);
    }
  }
  return found.sort();
}

describe('Presence', () => {
  it('keeps a departed child on screen until its exit is over', () => {
    const showFirst = internalState(true);
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 200 },
        createComponent(Presence, {
          exit: fade,
          timing: { duration: 200, easing: linear },
          children: showFirst.pipe(
            map(first => [first ? Text({ key: 'a', text: 'first' }) : Text({ key: 'b', text: 'second' })])
          )
        })
      )
    );
    drain(mounted);
    expect(textsIn(rootOf(mounted))).toEqual(['first']);

    showFirst.value = false;
    mounted.frame();
    // Both are in the tree: the one that has logically left is still a
    // real child, with a real host, being animated out.
    expect(textsIn(rootOf(mounted))).toEqual(['first', 'second']);

    drain(mounted);
    // And then it is not, through the ordinary removal path.
    expect(textsIn(rootOf(mounted))).toEqual(['second']);
    expect(mounted.clock.isPending).toBe(false);
  });

  it('drops a departed child at once when nothing says how it leaves', () => {
    const showFirst = internalState(true);
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 200 },
        createComponent(Presence, {
          enter: slideUp(8),
          timing: { duration: 200, easing: linear },
          children: showFirst.pipe(
            map(first => [first ? Text({ key: 'a', text: 'first' }) : Text({ key: 'b', text: 'second' })])
          )
        })
      )
    );
    drain(mounted);
    showFirst.value = false;
    mounted.frame();
    // No `exit`, so there is nothing to wait for and the old child goes
    // on the frame it stopped being asked for — which is what every
    // component in this framework did before `Presence` existed.
    expect(textsIn(rootOf(mounted))).toEqual(['second']);
    drain(mounted);
  });

  it('keeps a child that comes back before it finished leaving', () => {
    const shown = internalState('a');
    let seen: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 200 },
        createComponent(Presence, {
          exit: fade,
          timing: { duration: 400, easing: linear },
          children: shown.pipe(
            map(key => [
              Box({ key, ref: (n: UiNode | null) => key === 'a' && n !== null && (seen = n) }, Text({ text: key }))
            ])
          )
        })
      )
    );
    drain(mounted);
    const first = seen;
    expect(first).not.toBeNull();

    shown.value = 'b';
    mounted.frame();
    mounted.frame();
    shown.value = 'a';
    drain(mounted);

    // The same node, not a rebuilt one: a screen that came back keeps
    // its scroll position and its component's state.
    expect(seen).toBe(first);
    expect(textsIn(rootOf(mounted))).toEqual(['a']);
  });

  it('stops holding anything once the exit is done, however many swaps', () => {
    const shown = internalState(0);
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 200 },
        createComponent(Presence, {
          exit: fade,
          timing: { duration: 100, easing: linear },
          children: shown.pipe(map(n => [Text({ key: String(n), text: `screen ${n}` })]))
        })
      )
    );
    drain(mounted);
    for (let n = 1; n <= 5; n++) {
      shown.value = n;
      drain(mounted);
    }
    expect(textsIn(rootOf(mounted))).toEqual(['screen 5']);
    expect(mounted.clock.isPending).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The two together: a route change with a shared element across it
// ---------------------------------------------------------------------------

function ListScreen(_inputs: Inputs<OutletProps>): ReturnType<typeof Column> {
  return Column(
    { width: 400, height: 400 },
    Box({
      width: 100,
      height: 50,
      modifiers: [sharedElement({ name: 'hero', duration: 200, easing: linear })]
    }),
    Text({ text: 'list' })
  );
}

function DetailScreen(_inputs: Inputs<OutletProps>): ReturnType<typeof Column> {
  return Column(
    { width: 400, height: 400 },
    Box({
      width: 300,
      height: 200,
      marginTop: 40,
      modifiers: [sharedElement({ name: 'hero', duration: 200, easing: linear })]
    }),
    Text({ text: 'detail' })
  );
}

const List = route({ path: '/', component: ListScreen });
const Detail = route({ path: '/detail', component: DetailScreen });

/**
 * Segue's shape, small enough to drive: a clipping row of three cards,
 * and a page showing one of them large. Which card the page is for is
 * module state rather than a route param, because what is being tested
 * is the pairing of names across the change and not the router.
 */
let openItem = 0;
const shelfCards = new Map<number, UiNode>();
const pageArt = new Map<number, UiNode>();

function ShelfScreen(_inputs: Inputs<OutletProps>): ReturnType<typeof Column> {
  return Column(
    { width: 400, height: 400 },
    // A ScrollView, so it clips exactly as a LazyRow does.
    Box(
      { width: 400, height: 100, overflow: 'hidden', marginTop: 300 },
      ...[0, 1, 2].map(index =>
        Box({
          key: `card-${index}`,
          width: 100,
          height: 100,
          ref: (n: UiNode | null) => n !== null && shelfCards.set(index, n),
          modifiers: [sharedElement({ name: `item-${index}`, duration: 200, easing: linear, lift: true })]
        })
      )
    ),
    Text({ text: 'shelf' })
  );
}

function PageScreen(_inputs: Inputs<OutletProps>): ReturnType<typeof Column> {
  const index = openItem;
  return Column(
    { width: 400, height: 400 },
    Box({
      key: `page-${index}`,
      width: 300,
      height: 300,
      ref: (n: UiNode | null) => n !== null && pageArt.set(index, n),
      modifiers: [sharedElement({ name: `item-${index}`, duration: 200, easing: linear })]
    }),
    Text({ text: 'page' })
  );
}

const Shelf = route({ path: '/shelf', component: ShelfScreen });
const Page = route({ path: '/page', component: PageScreen });

/** The translation a motion layer wrote, or zeroes when it wrote none. */
function translationOf(node: UiNode): { x: number; y: number } {
  const transform = node.properties.get('transform') as { translateX?: number; translateY?: number } | undefined;
  return { x: transform?.translateX ?? 0, y: transform?.translateY ?? 0 };
}

/** The opacity a motion layer wrote on a node, or 1 when it wrote none. */
function opacityOf(node: UiNode): number {
  const value = node.properties.get('opacity');
  return typeof value === 'number' ? value : 1;
}

describe('a shared element handing over', () => {
  it('keeps the departing element up until the arriving one is in place', () => {
    // The bug this pins: the departing element used to be hidden the
    // moment its name was claimed, which is during reconciliation —
    // before the arriving element has a box. A geometry morph cannot
    // write a box after layout has run, so it spends that frame
    // invisible too, and a frame with neither element on screen is a
    // visible flash of the page behind them.
    const shown = internalState('a');
    const seen = new Map<string, UiNode>();
    const panel = (key: string, top: number): ReturnType<typeof Box> =>
      Box(
        { key, position: 'relative', width: percent(100), height: percent(100) },
        Box({
          position: 'absolute',
          left: 0,
          top,
          width: 200,
          height: 100,
          backgroundColor: '#f00',
          ref: (n: UiNode | null) => n !== null && seen.set(key, n),
          modifiers: [sharedElement({ name: 'panel', morph: 'geometry', duration: 200, easing: linear })]
        })
      );
    const mounted = mountRuntime(
      Box(
        { position: 'relative', width: 400, height: 400 },
        createComponent(Presence, {
          exit: fade,
          timing: { duration: 200, easing: linear },
          children: shown.pipe(map(key => [panel(key, key === 'a' ? 0 : 150)]))
        })
      )
    );
    drain(mounted);
    expect(opacityOf(seen.get('a')!)).toBe(1);

    shown.value = 'b';
    mounted.frame();
    // The frame of the change. A geometry morph cannot write a box after
    // this frame's layout has run, so what covers the frame is the
    // transform: the arriving element is *opaque* and translated onto
    // the departing element's box. There is no frame on which neither
    // is drawn, which is the whole point — one used to flash the page.
    expect(opacityOf(seen.get('b')!)).toBe(1);
    expect(translationOf(seen.get('b')!).y).toBeCloseTo(-150, 0);
    expect(opacityOf(seen.get('a')!)).toBe(0);

    mounted.frame();
    // The geometry has landed, so the stand-in transform comes off.
    expect(opacityOf(seen.get('b')!)).toBe(1);
    expect(translationOf(seen.get('b')!).y).toBe(0);

    drain(mounted);
  });
});

describe('a route transition', () => {
  it('holds the departing screen and morphs the element they share', () => {
    const mounted = mountRuntime(
      Column(
        { width: 400, height: 400 },
        createComponent(RouterOutlet, {
          transition: { enter: fade, exit: fade, timing: { duration: 200, easing: linear } }
        })
      ),
      { routes: { routes: [List, Detail] } }
    );
    drain(mounted);
    expect(textsIn(rootOf(mounted))).toEqual(['list']);

    mounted.runtime.services.get(RouterService).go(Detail);
    mounted.frame();
    // Both screens are up, which is what a shared element needs: the
    // morph is measured off the one that is still standing there.
    expect(textsIn(rootOf(mounted))).toEqual(['detail', 'list']);
    // And exactly one node answers to the name — the arriving one.
    expect(mounted.runtime.sharedElementNames).toEqual(['hero']);

    drain(mounted);
    expect(textsIn(rootOf(mounted))).toEqual(['detail']);
    expect(mounted.clock.isPending).toBe(false);
  });

  it('swaps on the frame the url changes when no transition is asked for', () => {
    const mounted = mountRuntime(Column({ width: 400, height: 400 }, createComponent(RouterOutlet)), {
      routes: { routes: [List, Detail] }
    });
    drain(mounted);
    mounted.runtime.services.get(RouterService).go(Detail);
    mounted.frame();
    // The behaviour every routed app already had, unchanged.
    expect(textsIn(rootOf(mounted))).toEqual(['detail']);
  });
});

describe('opening one card after another', () => {
  /**
   * Kevin's sequence, and the one that broke: open a card, let it
   * settle, come back, let it settle, and then do the same with a
   * *different* card. Every return must morph its own artwork, not the
   * one before it and not nothing at all.
   */
  it('morphs each card back from its own page, three in a row', () => {
    shelfCards.clear();
    pageArt.clear();
    openItem = 0;
    const mounted = mountRuntime(
      Column(
        { width: 400, height: 400 },
        createComponent(RouterOutlet, {
          transition: { exit: fade, mode: 'together', timing: { duration: 200, easing: linear } }
        })
      ),
      { routes: { routes: [Shelf, Page] } }
    );
    const router = mounted.runtime.services.get(RouterService);
    router.go(Shelf);
    drain(mounted);

    for (const index of [0, 1, 2]) {
      openItem = index;
      shelfCards.delete(index);
      router.go(Page);
      mounted.frame();
      // Out: the page's artwork starts on the card's box.
      expect(translationOf(pageArt.get(index)!).y).not.toBe(0);
      drain(mounted);

      router.go(Shelf);
      mounted.frame();
      // Back: this card, and no other, is morphing from the page it
      // was opened from — lifted out of the row while it travels.
      const card = shelfCards.get(index)!;
      expect(translationOf(card).y).not.toBe(0);
      expect(card.properties.get('lift')).toBe(true);
      for (const other of [0, 1, 2].filter(n => n !== index)) {
        const quiet = shelfCards.get(other);
        if (quiet !== undefined) {
          expect(translationOf(quiet)).toEqual({ x: 0, y: 0 });
          expect(quiet.properties.get('lift')).toBeUndefined();
        }
      }
      drain(mounted);
      expect(card.properties.get('lift')).toBeUndefined();
    }
  });
});
