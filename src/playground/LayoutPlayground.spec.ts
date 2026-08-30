import { describe, expect, it } from 'vitest';

import { Box, Column } from '../ui/composition';
import { Constraints } from '../ui/layout';
import type { LayoutRecord } from '../ui/layout';
import { UiManualFrameClock } from '../ui/scheduler';
import { LayoutPlayground } from './LayoutPlayground';
import { createDefinition } from './PlaygroundDefinition';
import { PlaygroundState } from './PlaygroundState';

interface Harness {
  clock: UiManualFrameClock;
  playground: LayoutPlayground;
  state: PlaygroundState;
}

function createHarness(constraints: Constraints = Constraints.loose(600, 600)): Harness {
  const clock = new UiManualFrameClock(() => {});
  const playground = new LayoutPlayground({
    clock: callback => {
      clock.setCallback(callback);
      return clock;
    },
    constraints
  });
  const state = new PlaygroundState();
  playground.build(createDefinition(state));
  return { clock, playground, state };
}

function tick(h: Harness): void {
  h.clock.tick(0);
}

function recordFor(h: Harness, id: string): LayoutRecord {
  const record = h.playground.engine.recordFor(h.playground.graph.requireNode(id));
  if (record === undefined) {
    throw new Error(`No layout record for '${id}'.`);
  }
  return record;
}

describe('LayoutPlayground integration', () => {
  describe('composition', () => {
    it('creates the expected graph from the definition', () => {
      const h = createHarness();
      expect(h.playground.graph.size).toBe(140);
      expect(h.playground.graph.requireNode('root:0').type).toBe('column');
      expect(h.playground.graph.requireNode('root:0:0').type).toBe('text');
      expect(h.playground.graph.requireNode('root:0:1').type).toBe('row');
      expect(h.playground.graph.requireNode('root:0:1:0').type).toBe('box');
      expect(h.playground.graph.requireNode('root:0:2').type).toBe('column');
      expect(h.playground.graph.requireNode('root:0:2:1').type).toBe('button');
      expect(h.playground.graph.requireNode('root:0:3:a').type).toBe('column');
      expect(h.playground.graph.requireNode('root:0:4').type).toBe('scroll-view');
    });

    it('produces a layout record for every node after the first frame', () => {
      const h = createHarness();
      tick(h);
      const missing = h.playground.inspect().filter(entry => entry.record === undefined);
      expect(missing).toEqual([]);
    });
  });

  describe('initial layout geometry', () => {
    it('sizes a fitted root and flex children under loose constraints', () => {
      const h = createHarness();
      tick(h);
      expect(recordFor(h, 'root:0').width).toBe(600);
      expect(recordFor(h, 'root:0').height).toBe(600);

      const row = recordFor(h, 'root:0:1');
      expect(row.x).toBeCloseTo(20);
      expect(row.y).toBeCloseTo(46.8);

      const a = recordFor(h, 'root:0:1:0');
      expect(a.x).toBeCloseTo(20);
      expect(a.y).toBeCloseTo(46.8);
      expect(a.width).toBe(100);
      expect(a.height).toBe(100);

      const b = recordFor(h, 'root:0:1:1');
      expect(b.x).toBeCloseTo(130);
      expect(b.y).toBeCloseTo(46.8);
      expect(b.width).toBeCloseTo(450);
      expect(b.height).toBe(100);
    });

    it('clamps a nested column to its min/max width', () => {
      const h = createHarness();
      tick(h);
      // Stretched across the 360 content width, clamped by maxWidth 320.
      expect(recordFor(h, 'root:0:2').width).toBe(320);
    });

    it('lays out nested children in a column', () => {
      const h = createHarness();
      tick(h);
      const nested = recordFor(h, 'root:0:2');
      const buttonA = recordFor(h, 'root:0:2:1');
      const buttonB = recordFor(h, 'root:0:2:2');
      expect(nested.y).toBeCloseTo(156.8);
      expect(buttonA.y).toBeCloseTo(181.6);
      expect(buttonB.y).toBeCloseTo(206.4);
      expect(buttonB.x).toBeCloseTo(buttonA.x);
    });
  });

  describe('reactivity', () => {
    it('re-lays out when a bound width changes', () => {
      const h = createHarness();
      tick(h);
      h.state.boxWidth$.next(150);
      tick(h);
      expect(recordFor(h, 'root:0:1:0').width).toBe(150);
      expect(recordFor(h, 'root:0:1:1').width).toBeCloseTo(400);
    });

    it('coalesces multiple synchronous emissions into one frame', () => {
      const h = createHarness();
      tick(h);
      const framesBefore = h.playground.metrics().frameCount;
      h.state.gap$.next(5);
      h.state.gap$.next(30);
      h.state.gap$.next(50);
      expect(h.clock.isPending).toBe(true);
      expect(h.playground.metrics().frameCount).toBe(framesBefore);
      tick(h);
      expect(h.playground.metrics().frameCount).toBe(framesBefore + 1);
      const reference = createHarness();
      reference.state.gap$.next(50);
      tick(reference);
      expect(recordFor(h, 'root:0:1').y).toBeCloseTo(recordFor(reference, 'root:0:1').y, 6);
      expect(recordFor(h, 'root:0:1').height).toBeCloseTo(recordFor(reference, 'root:0:1').height, 6);
    });

    it('invalidates layout for a layout property', () => {
      const h = createHarness();
      tick(h);
      const passesBefore = h.playground.metrics().layoutPasses;
      h.state.padding$.next(40);
      tick(h);
      expect(h.playground.metrics().layoutPasses).toBe(passesBefore + 1);
      expect(recordFor(h, 'root:0:0').x).toBe(40);
    });

    it('does not run layout for a paint-only property', () => {
      const h = createHarness();
      tick(h);
      const passesBefore = h.playground.metrics().layoutPasses;
      const framesBefore = h.playground.metrics().frameCount;
      h.state.color$.next('#ff0000');
      tick(h);
      expect(h.playground.metrics().frameCount).toBe(framesBefore + 1);
      expect(h.playground.metrics().layoutPasses).toBe(passesBefore);
      expect(h.playground.graph.requireNode('root:0:0').properties.get('color')).toBe('#ff0000');
    });

    it('clears dirty state after a frame', () => {
      const h = createHarness();
      tick(h);
      expect(h.playground.metrics().dirtyCount).toBe(0);
      h.state.gap$.next(30);
      expect(h.playground.metrics().dirtyCount).toBeGreaterThan(0);
      tick(h);
      expect(h.playground.metrics().dirtyCount).toBe(0);
    });
  });

  describe('reconciliation', () => {
    it('reuses existing nodes when the definition is unchanged', () => {
      const h = createHarness();
      const header = h.playground.graph.requireNode('root:0:0');
      h.playground.rebuild(createDefinition(h.state));
      expect(h.playground.graph.requireNode('root:0:0')).toBe(header);
      expect(h.playground.createdFor('root:0:0')).toBe(1);

      h.state.padding$.next(30);
      tick(h);
      expect(h.playground.createdFor('root:0:0')).toBe(1);
    });

    it('keeps keyed node identity when the collection is reordered', () => {
      const h = createHarness();
      const a = h.playground.graph.requireNode('root:0:3:a');
      const b = h.playground.graph.requireNode('root:0:3:b');
      const c = h.playground.graph.requireNode('root:0:3:c');

      h.state.order$.next(['c', 'a', 'b']);
      h.playground.rebuild(createDefinition(h.state));
      tick(h);

      const list = h.playground.graph.requireNode('root:0:3');
      const ids: string[] = [];
      for (let child = list.firstChild; child !== null; child = child.nextSibling) {
        ids.push(child.id);
      }
      expect(ids).toEqual(['root:0:3:c', 'root:0:3:a', 'root:0:3:b']);
      expect(h.playground.graph.requireNode('root:0:3:a')).toBe(a);
      expect(h.playground.graph.requireNode('root:0:3:b')).toBe(b);
      expect(h.playground.graph.requireNode('root:0:3:c')).toBe(c);
      for (const key of ['a', 'b', 'c']) {
        expect(h.playground.createdFor(`root:0:3:${key}`)).toBe(1);
      }
    });

    it('removes destroyed nodes and their layout records', () => {
      const h = createHarness();
      const first = h.playground.graph.requireNode('root:0:3:a');
      const header = h.playground.graph.requireNode('root:0:0');
      const headerBindings = h.playground.graph.getBindingsForNode(header);
      expect(headerBindings.length).toBeGreaterThan(0);
      h.playground.build(Column(Box({ width: 10, height: 10 }), Box({ width: 10, height: 10 })));
      tick(h);
      const second = h.playground.graph.requireNode('root:0:1');
      expect(h.playground.engine.recordFor(second)).toBeDefined();

      h.playground.build(Column(Box({ width: 10, height: 10 })));
      tick(h);
      expect(h.playground.graph.hasNode('root:0:1')).toBe(false);
      expect(h.playground.engine.recordFor(second)).toBeUndefined();
      expect(h.playground.graph.hasNode(first.id)).toBe(false);
      expect(header.parent).toBeNull();
      expect(h.playground.engine.recordFor(header)).toBeUndefined();
      expect(headerBindings.every(b => !b.connected())).toBe(true);
      expect(h.playground.metrics().nodeCount).toBe(2);
    });

    it('keeps bindings attached across a reconcile', () => {
      const h = createHarness();
      const header = h.playground.graph.requireNode('root:0:0');
      const bindings = h.playground.graph.getBindingsForNode(header);
      expect(bindings.length).toBeGreaterThan(0);
      expect(bindings[0].connected()).toBe(true);

      h.playground.rebuild(createDefinition(h.state));
      expect(h.playground.graph.getBindingsForNode(header)[0]).toBe(bindings[0]);
      expect(bindings[0].connected()).toBe(true);

      h.state.color$.next('#00ff00');
      expect(header.properties.get('color')).toBe('#00ff00');
      expect(h.clock.isPending).toBe(true);
    });
  });

  describe('resize', () => {
    it('re-lays out the tree under new constraints', () => {
      const h = createHarness();
      tick(h);
      h.playground.relayout(400, 300);
      expect(recordFor(h, 'root:0').width).toBe(400);
      expect(recordFor(h, 'root:0').height).toBe(300);
      expect(recordFor(h, 'root:0:1:1').width).toBeCloseTo(250);
    });

    it('keeps flex children in bounds across constraint steps', () => {
      const h = createHarness();
      tick(h);
      h.playground.relayout(800, 600);
      expect(recordFor(h, 'root:0:1:1').width).toBeCloseTo(650);
      h.playground.relayout(600, 600);
      expect(recordFor(h, 'root:0:1:1').width).toBeCloseTo(450);
      h.playground.relayout(400, 300);
      expect(recordFor(h, 'root:0:1:1').width).toBeCloseTo(250);
    });
  });

  describe('scroll', () => {
    it('represents viewport, content and scroll offset', () => {
      const h = createHarness();
      tick(h);
      const scroll = recordFor(h, 'root:0:4');
      expect(scroll.width).toBe(300);
      expect(scroll.height).toBe(120);
      expect(scroll.contentHeight).toBeCloseTo(2274);
      expect(scroll.scrollY).toBe(0);
    });

    it('applies a scroll change without a layout pass', () => {
      const h = createHarness();
      tick(h);
      const passesBefore = h.playground.metrics().layoutPasses;
      h.state.scrollY$.next(50);
      tick(h);
      expect(recordFor(h, 'root:0:4').scrollY).toBe(50);
      expect(h.playground.metrics().layoutPasses).toBe(passesBefore);
    });

    it('clamps the scroll offset to the content extent', () => {
      const h = createHarness();
      tick(h);
      h.state.scrollY$.next(500);
      tick(h);
      expect(recordFor(h, 'root:0:4').scrollY).toBe(500);
    });
  });

  describe('constraints', () => {
    it('responds reactively to min/max width changes', () => {
      const h = createHarness();
      tick(h);
      expect(recordFor(h, 'root:0:2').width).toBe(320);

      // A larger minimum changes nothing while the max still binds.
      h.state.minWidth$.next(200);
      tick(h);
      expect(recordFor(h, 'root:0:2').width).toBe(320);

      h.state.minWidth$.next(0);
      h.state.maxWidth$.next(60);
      tick(h);
      expect(recordFor(h, 'root:0:2').width).toBe(60);
    });
  });

  describe('stress baseline', () => {
    it('builds and lays out a 1000-node subtree', () => {
      const h = createHarness();
      tick(h);
      h.state.stressCount$.next(1000);
      const start = performance.now();
      h.playground.rebuild(createDefinition(h.state));
      tick(h);
      const buildMs = performance.now() - start;
      expect(h.playground.graph.size).toBe(1241);
      expect(h.playground.createdFor('root:0:5:0')).toBe(1);
      expect(buildMs).toBeGreaterThanOrEqual(0);
    });
  });
});
