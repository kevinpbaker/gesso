import { Observable, Subject, type Subscriber } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Column, measure, Text, UiGraph, UiGraphBuilder, type LayoutBox } from '@gesso/core';

import { bounds } from './bounds';
import { ComponentHostResolver } from './ComponentHostResolver';
import { createComponent } from './createComponent';
import type { ComponentContext, Inputs } from './FunctionComponent';
import { route } from './router/RouteDefinition';
import { RouterService } from './router/RouterService';
import { ServiceRegistry } from './service/ServiceRegistry';

/**
 * Budgets for the lifecycle helpers.
 *
 * The risk here is sugar that hides cost, and each
 * of these three has a shape it could take. `ctx.effect` could leave a
 * subscription open past the component, which is the leak the twelve
 * hand-written `onUnmount` pairs existed to prevent. A bounds cell
 * could wake everything reading it on every frame of a scroll, since
 * the layout notification it is built on fires for a container whose
 * box did not move. And a per-route store could allocate a cell per
 * call rather than per key.
 *
 * So the counts are asserted: subscriptions live upstream, emissions
 * handed downstream, cells allocated. Counts and not timings, in the
 * shape `LayoutEngine.budget.spec.ts` set.
 */

function createHarness() {
  const graph = new UiGraph();
  const services = new ServiceRegistry();
  const resolver = new ComponentHostResolver(services);
  const builder = new UiGraphBuilder(graph, { components: resolver });
  return { builder, resolver, services };
}

/**
 * A stream that reports how many subscriptions to it are open, and the
 * most that were ever open at once. The same helper
 * `reactive.budget.spec.ts` uses, and for the same reason: what matters
 * is how many followers a stream carries while a component holds it.
 */
function counted<T>(): {
  source: Observable<T>;
  next: (value: T) => void;
  live: () => number;
  peak: () => number;
} {
  const subject = new Subject<T>();
  let live = 0;
  let peak = 0;
  const source = new Observable<T>((subscriber: Subscriber<T>) => {
    live++;
    peak = Math.max(peak, live);
    const inner = subject.subscribe(subscriber);
    return () => {
      live--;
      inner.unsubscribe();
    };
  });
  return { source, next: value => subject.next(value), live: () => live, peak: () => peak };
}

const BOX = (x: number, width: number): LayoutBox => ({ x, y: 0, width, height: 10 });

describe('lifecycle budgets', () => {
  describe('ctx.effect', () => {
    it('opens one subscription per call and closes every one with the component', () => {
      const { builder } = createHarness();
      const sources = [counted<number>(), counted<number>(), counted<number>(), counted<number>()];
      const seen: number[] = [];

      function Player(_inputs: Inputs<{}>, ctx: ComponentContext) {
        for (const stream of sources) {
          ctx.effect(stream.source, value => seen.push(value));
        }
        return Text({ text: 'player' });
      }

      builder.build(Column(createComponent(Player)));
      // Four effects, four followers: no fan-out, no shared multicast
      // hiding a second subscription behind the first.
      expect(sources.map(stream => stream.live())).toEqual([1, 1, 1, 1]);

      for (const stream of sources) {
        stream.next(1);
      }
      expect(seen).toEqual([1, 1, 1, 1]);

      builder.build(Column());
      expect(sources.map(stream => stream.live())).toEqual([0, 0, 0, 0]);
      expect(sources.map(stream => stream.peak())).toEqual([1, 1, 1, 1]);

      // And nothing arrives afterwards, which is what the hand-written
      // pair was there for.
      for (const stream of sources) {
        stream.next(2);
      }
      expect(seen).toEqual([1, 1, 1, 1]);
    });

    it('costs nothing when it is registered after the body, and still ends with the component', () => {
      const { builder } = createHarness();
      const stream = counted<number>();
      let register: (() => void) | null = null;

      function Late(_inputs: Inputs<{}>, ctx: ComponentContext) {
        register = () => ctx.effect(stream.source, () => undefined);
        return Text({ text: 'late' });
      }

      builder.build(Column(createComponent(Late)));
      expect(stream.live()).toBe(0);
      register!();
      expect(stream.live()).toBe(1);
      builder.build(Column());
      expect(stream.live()).toBe(0);
    });
  });

  describe('ctx.bounds', () => {
    it('is the modifier that fills it, and completes with the component', () => {
      const { builder } = createHarness();
      let cell: ReturnType<ComponentContext['bounds']> | null = null;

      function Seek(_inputs: Inputs<{}>, ctx: ComponentContext) {
        cell = ctx.bounds();
        return Text({ text: 'seek' });
      }

      builder.build(Column(createComponent(Seek)));
      expect(cell!.modifier.kind).toBe(measure.kind);
      // `measure` writes through the subject it is given, so the
      // modifier's argument has to be the cell itself.
      expect(cell!.modifier.args).toBe(cell);

      let ended = false;
      cell!.subscribe({ complete: () => (ended = true) });
      builder.build(Column());
      expect(ended).toBe(true);
    });

    it('emits a box that moved and drops one that did not', () => {
      const cell = bounds();
      const seen: LayoutBox[] = [];
      cell.subscribe(box => seen.push(box));
      expect(seen).toHaveLength(1);

      // What `measure` does on every layout notification, which for a
      // scroll container is every frame of every scroll: hand over the
      // box it has, whether or not it moved.
      for (let frame = 0; frame < 60; frame++) {
        cell.next(BOX(0, 100));
      }
      expect(seen).toHaveLength(2);

      cell.next(BOX(0, 120));
      cell.next(BOX(4, 120));
      expect(seen).toHaveLength(4);
      expect(cell.value).toEqual(BOX(4, 120));
    });
  });

  describe('router.remember', () => {
    it('allocates one cell per key however many screens ask for it', () => {
      const router = new RouterService();
      const Home = route({ path: '/', component: () => Text() });
      const Notes = route({ path: '/notes', component: () => Text() });

      const first = router.remember(Home, 'scroll', 0);
      expect(router.state.has(Home, 'scroll')).toBe(true);
      for (let ask = 0; ask < 20; ask++) {
        expect(router.remember(Home, 'scroll', 0)).toBe(first);
      }
      // A second route's `scroll` is a different cell, so a screen
      // cannot read another screen's offset by naming it the same.
      expect(router.remember(Notes, 'scroll', 0)).not.toBe(first);
      // The initial is read once: the second screen finds what the
      // first one left, which is the whole point.
      first.value = 240;
      expect(router.remember(Home, 'scroll', 0).value).toBe(240);

      router.forget(Home);
      expect(router.state.has(Home, 'scroll')).toBe(false);
      expect(router.remember(Home, 'scroll', 0).value).toBe(0);
      expect(router.remember(Notes, 'scroll', 0).value).toBe(0);
    });

    it('outlives the screen that read it', () => {
      const { builder, services } = createHarness();
      const router = services.register(RouterService);
      const Home = route({ path: '/', component: () => Text() });

      function List(_inputs: Inputs<{}>, ctx: ComponentContext) {
        const scroll = ctx.inject(RouterService).remember(Home, 'scroll', 0);
        scroll.value = scroll.value + 100;
        return Text({ text: 'list' });
      }

      builder.build(Column(createComponent(List)));
      builder.build(Column());
      expect(router.remember(Home, 'scroll', 0).value).toBe(100);
      builder.build(Column(createComponent(List)));
      expect(router.remember(Home, 'scroll', 0).value).toBe(200);
    });
  });

  describe('router.answerFor', () => {
    it('follows one source, answers the current params, and keeps its page while it leaves', () => {
      interface Page {
        readonly path: string;
      }
      const router = new RouterService();
      const Track = route({ path: '/:handle/:slug', component: () => Text() });
      const Home = route({ path: '/home', component: () => Text() });
      router.setRoutes({ routes: [Home, Track] });

      const pages = counted<Page | null>();
      const track = router.answerFor(Track, pages.source, {
        asks: params => `/${params.handle}/${params.slug}`,
        answers: entry => entry.path
      });

      const seen: (Page | null)[] = [];
      track.subscribe(value => seen.push(value));
      // Nothing is followed while the route is not showing: a screen
      // that is not there costs the slot no subscriber.
      expect(pages.peak()).toBe(0);

      router.navigate('/ann/first');
      // And one follower once it is, however many times the screen
      // reads the cell.
      expect(pages.peak()).toBe(1);
      pages.next({ path: '/bea/second' });
      // The previous screen's page, still in the slot: not this one's.
      expect(track.value).toBeNull();

      pages.next({ path: '/ann/first' });
      expect(track.value).toEqual({ path: '/ann/first' });

      // A walk to another track keeps the screen mounted, and the
      // question moves with the params.
      router.navigate('/bea/second');
      expect(track.value).toBeNull();
      pages.next({ path: '/bea/second' });
      expect(track.value).toEqual({ path: '/bea/second' });

      // Leaving: the screen is still on screen while it fades, and the
      // slot has already moved on. It keeps its own page.
      router.navigate('/home');
      pages.next({ path: '/cal/third' });
      expect(track.value).toEqual({ path: '/bea/second' });

      // Two nulls in all of that, and both are honest: the first
      // screen waiting for its own page, and the second one waiting for
      // its own. Leaving emits nothing at all.
      expect(seen.filter(value => value === null)).toHaveLength(2);
      expect(seen).toHaveLength(4);
      expect(pages.peak()).toBe(1);
    });
  });
});
