import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import { InputTestHarness } from './UiInputTestUtils';

describe('UiHitTester', () => {
  describe('basic containment', () => {
    it('hits a single node at its position', () => {
      const h = new InputTestHarness();
      const button = h.node('button', UiNodeType.Button, { width: 100, height: 50 });
      h.add(h.root, button);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      const hit = tester.hitTest(50, 25);
      expect(hit?.node).toBe(button);
      expect(hit?.localX).toBe(50);
      expect(hit?.localY).toBe(25);
    });

    it('misses outside every node', () => {
      const h = new InputTestHarness();
      const button = h.node('button', UiNodeType.Button, { width: 100, height: 50 });
      h.add(h.root, button);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      expect(tester.hitTest(150, 25)).toBeNull();
      expect(tester.hitTest(50, 60)).toBeNull();
      expect(tester.hitTest(-5, 25)).toBeNull();
    });

    it('hits the layout root when it is hit-testable', () => {
      const h = new InputTestHarness();
      h.layoutTree();
      const tester = h.createHitTester();
      expect(tester.hitTest(200, 200)?.node).toBe(h.root);
    });
  });

  describe('nesting and siblings', () => {
    it('hits a nested child inside a stack', () => {
      const h = new InputTestHarness();
      const stack = h.node('stack', UiNodeType.Box, { width: 200, height: 200 });
      const inner = h.node('inner', UiNodeType.Box, { width: 100, height: 100 });
      h.add(stack, inner);
      h.add(h.root, stack);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      const hit = tester.hitTest(50, 50);
      expect(hit?.node).toBe(inner);
      expect(hit?.localX).toBe(50);
    });

    it('hits the parent when the point is outside a child but inside the parent', () => {
      const h = new InputTestHarness();
      const stack = h.node('stack', UiNodeType.Box, { width: 200, height: 200 });
      const inner = h.node('inner', UiNodeType.Box, { width: 100, height: 100 });
      h.add(stack, inner);
      h.add(h.root, stack);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      const hit = tester.hitTest(150, 150);
      expect(hit?.node).toBe(stack);
      expect(hit?.localX).toBe(150);
    });

    it('hits sibling children in a column', () => {
      const h = new InputTestHarness();
      const a = h.node('a', UiNodeType.Box, { width: 100, height: 100 });
      const b = h.node('b', UiNodeType.Box, { width: 100, height: 100 });
      h.add(h.root, a, b);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      expect(tester.hitTest(50, 50)?.node).toBe(a);
      expect(tester.hitTest(50, 150)?.node).toBe(b);
    });

    it('topmost sibling wins when nodes overlap', () => {
      const h = new InputTestHarness();
      const stack = h.node('stack', UiNodeType.Box, { width: 200, height: 200 });
      const under = h.node('under', UiNodeType.Box, { width: 100, height: 100 });
      const over = h.node('over', UiNodeType.Box, { width: 100, height: 100 });
      h.add(stack, under, over);
      h.add(h.root, stack);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      expect(tester.hitTest(50, 50)?.node).toBe(over);
    });
  });

  describe('transforms', () => {
    it('hits a scaled node and reports local coordinates', () => {
      const h = new InputTestHarness();
      const box = h.node('box', UiNodeType.Box, {
        width: 100,
        height: 100,
        transform: { scaleX: 2, scaleY: 2 }
      });
      h.add(h.root, box);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // Visually 0..200 x 0..200. Point (150, 150) is local (75, 75).
      const hit = tester.hitTest(150, 150);
      expect(hit?.node).toBe(box);
      expect(hit?.localX).toBe(75);
      expect(hit?.localY).toBe(75);

      expect(tester.hitTest(250, 150)).toBeNull();
    });

    it('hits a rotated node around its top-left corner', () => {
      const h = new InputTestHarness();
      const box = h.node('box', UiNodeType.Box, {
        width: 100,
        height: 100,
        transform: { rotation: Math.PI / 2 }
      });
      h.add(h.root, box);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // Rotating 90deg about the origin maps local (x, y) to (-y, x),
      // so the box occupies x in [-100, 0], y in [0, 100].
      const hit = tester.hitTest(-50, 50);
      expect(hit?.node).toBe(box);
      expect(hit?.localX).toBe(50);
      expect(hit?.localY).toBe(50);

      expect(tester.hitTest(50, 50)).toBeNull();
    });

    it('composes scale and rotation like the renderer CTM', () => {
      const h = new InputTestHarness();
      const box = h.node('box', UiNodeType.Box, {
        width: 50,
        height: 50,
        transform: { scaleX: 2, rotation: Math.PI / 2 }
      });
      h.add(h.root, box);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // world = R(90)·S(2)·local: local (x, y) maps to world (-y, 2x),
      // so local (25, 25) is world (-25, 50). The box spans
      // x in [-50, 0], y in [0, 100].
      const hit = tester.hitTest(-25, 50);
      expect(hit?.node).toBe(box);
      expect(hit?.localX).toBeCloseTo(25);
      expect(hit?.localY).toBeCloseTo(25);
    });

    it('follows a translated node, and reports local coordinates unmoved', () => {
      const h = new InputTestHarness();
      const box = h.node('box', UiNodeType.Box, {
        width: 100,
        height: 100,
        transform: { translateX: 60, translateY: -20 }
      });
      h.add(h.root, box);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // The node is drawn over x in [60, 160], y in [-20, 80]. Where it
      // used to be is now empty, which is the point of a translation:
      // the node moved, and the pointer has to move with it.
      const hit = tester.hitTest(70, 0);
      expect(hit?.node).toBe(box);
      expect(hit?.localX).toBe(10);
      expect(hit?.localY).toBe(20);

      expect(tester.hitTest(10, 10)).toBeNull();
    });

    it('undoes the translation before the pivot, as the renderer applies it after', () => {
      const h = new InputTestHarness();
      const box = h.node('box', UiNodeType.Box, {
        width: 100,
        height: 100,
        transform: { x: 50, y: 50, translateX: 30, scaleX: 2, scaleY: 2 }
      });
      h.add(h.root, box);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // Scaling 2x about the pivot (50, 50) maps local p to 2p - 50;
      // the translation then adds 30 in x. Local (75, 75) is therefore
      // world (130, 100).
      const hit = tester.hitTest(130, 100);
      expect(hit?.node).toBe(box);
      expect(hit?.localX).toBeCloseTo(75);
      expect(hit?.localY).toBeCloseTo(75);
    });

    it('is unaffected by an identity transform', () => {
      const h = new InputTestHarness();
      const box = h.node('box', UiNodeType.Box, {
        width: 100,
        height: 100,
        transform: { x: 50, y: 50 }
      });
      h.add(h.root, box);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      expect(tester.hitTest(50, 50)?.node).toBe(box);
    });

    it('skips degenerate zero-scale transforms', () => {
      const h = new InputTestHarness();
      const box = h.node('box', UiNodeType.Box, {
        width: 100,
        height: 100,
        transform: { scaleX: 0 }
      });
      h.add(h.root, box);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      expect(tester.hitTest(50, 50)).toBeNull();
    });
  });

  describe('scrolling', () => {
    it('hits content scrolled into view', () => {
      const h = new InputTestHarness();
      const scroll = h.node('scroll', UiNodeType.ScrollView, { width: 200, height: 100, scrollY: 40 });
      const item = h.node('item', UiNodeType.Box, { width: 100, height: 200 });
      h.add(scroll, item);
      h.add(h.root, scroll);
      h.root.setProperty('hitTestable', false);
      scroll.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // Content y=45 renders at screen y=5 (inside the viewport).
      const hit = tester.hitTest(10, 5);
      expect(hit?.node).toBe(item);
      expect(hit?.localY).toBe(45);
    });

    it('does not hit content scrolled out of the viewport', () => {
      const h = new InputTestHarness();
      const scroll = h.node('scroll', UiNodeType.ScrollView, { width: 200, height: 100, scrollY: 40 });
      const item = h.node('item', UiNodeType.Box, { width: 100, height: 200 });
      h.add(scroll, item);
      h.add(h.root, scroll);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // Screen y=150 is beyond the 100-tall viewport.
      expect(tester.hitTest(10, 150)).toBeNull();
      // Screen y above the viewport entirely.
      expect(tester.hitTest(10, -10)).toBeNull();
    });

    it('does not hit a clipped child whose logical box contains the point', () => {
      const h = new InputTestHarness();
      const scroll = h.node('scroll', UiNodeType.ScrollView, { width: 200, height: 100 });
      const spacer = h.node('spacer', UiNodeType.Box, { width: 200, height: 120, flexShrink: 0 });
      const below = h.node('below', UiNodeType.Box, { width: 200, height: 50, flexShrink: 0 });
      h.add(scroll, spacer, below);
      h.add(h.root, scroll);
      h.root.setProperty('hitTestable', false);
      scroll.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // 'below' logically occupies y 120..170, but the viewport is only
      // 100 tall, so the point (10, 140) — inside its layout box —
      // must not hit it.
      expect(tester.hitTest(10, 140)).toBeNull();
    });

    it('resolves nested scrolling with inner consuming its own offset', () => {
      const h = new InputTestHarness();
      const outer = h.node('outer', UiNodeType.ScrollView, { width: 200, height: 200, scrollY: 100 });
      const inner = h.node('inner', UiNodeType.ScrollView, {
        width: 200,
        height: 100,
        scrollY: 50,
        flexShrink: 0,
        marginTop: 150
      });
      const child = h.node('child', UiNodeType.Box, { width: 50, height: 200, marginTop: 30 });
      h.add(inner, child);
      h.add(outer, inner);
      h.add(h.root, outer);
      h.root.setProperty('hitTestable', false);
      outer.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // Outer scrollY 100 clamps to 50 (content 250 - viewport 200).
      // Inner record is at y=150..250 in outer content space, so it
      // renders at screen y=100..200. Inner scrolls 50 and its content
      // is 230 tall, so the child (content y=30..230) renders at
      // screen y=80..280, clipped to inner's viewport (screen 100..200).
      expect(h.box(inner)).toEqual({ x: 0, y: 150, width: 200, height: 100 });
      // Screen y=120 -> inner-local y=20 -> content y=70 -> child-local y=40.
      const hit = tester.hitTest(10, 120);
      expect(hit?.node).toBe(child);
      expect(hit?.localY).toBe(40);
      // Inside the child's span but below inner's viewport: clipped.
      expect(tester.hitTest(10, 210)).toBeNull();
    });
  });

  describe('visibility and hit-test participation', () => {
    it('skips invisible subtrees', () => {
      const h = new InputTestHarness();
      const stack = h.node('stack', UiNodeType.Box, { width: 200, height: 200 });
      const hidden = h.node('hidden', UiNodeType.Box, { width: 100, height: 100, visible: false });
      const shown = h.node('shown', UiNodeType.Box, { width: 100, height: 100 });
      h.add(stack, hidden, shown);
      h.add(h.root, stack);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      expect(tester.hitTest(50, 50)?.node).toBe(shown);
    });

    it('skips opacity-zero subtrees', () => {
      const h = new InputTestHarness();
      const stack = h.node('stack', UiNodeType.Box, { width: 200, height: 200 });
      const hidden = h.node('hidden', UiNodeType.Box, { width: 100, height: 100, opacity: 0 });
      const shown = h.node('shown', UiNodeType.Box, { width: 100, height: 100 });
      h.add(stack, hidden, shown);
      h.add(h.root, stack);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      expect(tester.hitTest(50, 50)?.node).toBe(shown);
    });

    it('skips pointer-events:none subtrees', () => {
      const h = new InputTestHarness();
      const blocked = h.node('blocked', UiNodeType.Box, { width: 200, height: 200, pointerEvents: 'none' });
      const child = h.node('child', UiNodeType.Box, { width: 100, height: 100 });
      h.add(blocked, child);
      h.add(h.root, blocked);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      expect(tester.hitTest(50, 50)).toBeNull();
    });

    it('skips disabled subtrees', () => {
      const h = new InputTestHarness();
      const disabled = h.node('disabled', UiNodeType.Button, { width: 100, height: 50, disabled: true });
      h.add(h.root, disabled);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      expect(tester.hitTest(50, 25)).toBeNull();
    });

    it('skips the node itself but still hits children when hitTestable:false', () => {
      const h = new InputTestHarness();
      const wrapper = h.node('wrapper', UiNodeType.Box, { width: 200, height: 200, hitTestable: false });
      const child = h.node('child', UiNodeType.Box, { width: 100, height: 100 });
      h.add(wrapper, child);
      h.add(h.root, wrapper);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      expect(tester.hitTest(50, 50)?.node).toBe(child);
      expect(tester.hitTest(150, 150)).toBeNull();
    });
  });

  describe('toLocal', () => {
    it('converts a world point into node-local coordinates', () => {
      const h = new InputTestHarness();
      const box = h.node('box', UiNodeType.Box, {
        width: 100,
        height: 100,
        transform: { scaleX: 2, scaleY: 2 }
      });
      h.add(h.root, box);
      h.layoutTree();
      const tester = h.createHitTester();

      const local = tester.toLocal(box, 150, 150);
      expect(local).toEqual({ x: 75, y: 75 });
    });

    it('agrees with the hit test for content inside a scroll container', () => {
      const h = new InputTestHarness();
      const scroll = h.node('scroll', UiNodeType.ScrollView, { width: 200, height: 100, scrollY: 40 });
      const item = h.node('item', UiNodeType.Box, { width: 100, height: 200 });
      h.add(scroll, item);
      h.add(h.root, scroll);
      h.root.setProperty('hitTestable', false);
      scroll.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // Records stay pre-scroll: content y=45 is seen at screen y=5.
      const hit = tester.hitTest(10, 5)!;
      expect(tester.toLocal(item, 10, 5)).toEqual({ x: hit.localX, y: hit.localY });
      expect(tester.toLocal(item, 10, 5).y).toBe(45);
    });

    it('applies every scroll ancestor when nested', () => {
      const h = new InputTestHarness();
      const outer = h.node('outer', UiNodeType.ScrollView, { width: 200, height: 200, scrollY: 100 });
      const inner = h.node('inner', UiNodeType.ScrollView, { width: 200, height: 150, scrollY: 50 });
      const spacer = h.node('spacer', UiNodeType.Box, { width: 100, height: 100 });
      const item = h.node('item', UiNodeType.Box, { width: 100, height: 300 });
      h.add(inner, item);
      h.add(outer, spacer, inner);
      h.add(h.root, outer);
      h.layoutTree();
      const tester = h.createHitTester();

      // Outer scrollY 100 clamps to 50, so the inner viewport starts at
      // screen y=50; the inner scrolls its own content up by 50 again.
      const hit = tester.hitTest(10, 60)!;
      expect(hit.node).toBe(item);
      expect(tester.toLocal(item, 10, 60)).toEqual({ x: hit.localX, y: hit.localY });
    });

    it('falls back to offset when a node has no layout record', () => {
      const h = new InputTestHarness();
      h.layoutTree();
      const orphan = h.node('orphan', UiNodeType.Box);
      const tester = h.createHitTester();

      expect(tester.toLocal(orphan, 10, 20)).toEqual({ x: 10, y: 20 });
    });
  });
});
