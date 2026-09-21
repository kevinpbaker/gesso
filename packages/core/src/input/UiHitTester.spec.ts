import { describe, expect, it } from 'vitest';

import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { Constraints } from '../layout/LayoutTypes';
import { UiFrame } from '../scheduler/UiFrame';
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
  describe('lifted nodes', () => {
    /**
     * A clipping row with a lifted card in it, transformed out of the
     * row: the shape a shared element morphing back into a list makes.
     */
    function liftedHarness(lift: boolean) {
      const h = new InputTestHarness();
      const scroll = h.node('scroll', UiNodeType.ScrollView, { width: 200, height: 100 });
      const card = h.node('card', UiNodeType.Box, {
        width: 200,
        height: 100,
        flexShrink: 0,
        // 300 straight up, well outside the row.
        transform: { x: 0, y: 0, translateX: 0, translateY: -300, scaleX: 1, scaleY: 1, rotation: 0 }
      });
      if (lift) {
        card.setProperty('lift', true);
      }
      h.add(scroll, card);
      h.add(h.root, scroll);
      h.root.setProperty('hitTestable', false);
      scroll.setProperty('hitTestable', false);
      h.layoutTree();
      return { h, card, tester: h.createHitTester() };
    }

    it('hits a lifted node where it is drawn, outside its ancestor clip', () => {
      const { card, tester } = liftedHarness(true);
      // Screen y=-250 is where the transform puts the card's y=50; the
      // row's clip would have rejected the point long before.
      const hit = tester.hitTest(100, -250);
      expect(hit?.node).toBe(card);
      expect(hit?.localY).toBe(50);
    });

    it('does not hit a lifted node at the box it was lifted out of', () => {
      const { tester } = liftedHarness(true);
      expect(tester.hitTest(100, 50)).toBeNull();
    });

    it('leaves an unlifted node clipped by its ancestors', () => {
      const { tester } = liftedHarness(false);
      expect(tester.hitTest(100, -250)).toBeNull();
    });

    it('hits a lifted node drawn outside a parent that does not clip', () => {
      const h = new InputTestHarness();
      const section = h.node('section', UiNodeType.Column, { width: 200, height: 40 });
      const card = h.node('card', UiNodeType.Box, {
        width: 100,
        height: 40,
        lift: true,
        transform: { translateY: 260 }
      });
      h.add(section, card);
      h.add(h.root, section);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // Nothing clips here, so the point could reach the card either
      // through the section or through the top layer. The top layer is
      // tried first and is not bounded by anything the tree says.
      expect(tester.hitTest(50, 280)?.node).toBe(card);
    });

    it('puts a lifted node at the top of the hit stack', () => {
      const h = new InputTestHarness();
      const under = h.node('under', UiNodeType.Box, { width: 200, height: 100, position: 'absolute', top: 0, left: 0 });
      const over = h.node('over', UiNodeType.Box, {
        width: 200,
        height: 100,
        position: 'absolute',
        top: 0,
        left: 0,
        lift: true
      });
      // Tree order puts `over` first, so without the top layer it would
      // be the one *under*.
      h.add(h.root, over, under);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();
      expect(tester.hitStack(100, 50)).toEqual([over, under]);
    });
  });

  /**
   * The walk descends into a child only when the point is inside the
   * bounds of that child's subtree. Every case here is a position
   * where something is plainly drawn and must therefore be hit; a box
   * that comes out too small loses the click in silence, so these are
   * the whole safety net under the optimisation.
   */
  describe('subtree bounds', () => {
    /**
     * A section that does not clip, with a badge inside it placed well
     * outside its box: bounds taken from a node's own record alone
     * would stop the walk at the section.
     */
    function spillingSection(badgeTop: number) {
      const h = new InputTestHarness();
      const section = h.node('section', UiNodeType.Column);
      const row = h.node('row', UiNodeType.Row, { height: 40 });
      const badge = h.node('badge', UiNodeType.Box, {
        position: 'absolute',
        top: badgeTop,
        left: 20,
        width: 30,
        height: 30
      });
      h.add(row, badge);
      h.add(section, row);
      h.add(h.root, section);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      return { h, section, row, badge, tester: h.createHitTester() };
    }

    it('hits a child painted outside its non-clipping parent', () => {
      const { badge, tester } = spillingSection(300);
      expect(tester.hitTest(30, 310)?.node).toBe(badge);
    });

    it('hits a descendant that an incremental relayout moved inside a relayout boundary', () => {
      const { h, row, badge, tester } = spillingSection(10);
      // The first test is what fills the bounds in, so the frame below
      // has something to make stale.
      expect(tester.hitTest(30, 20)?.node).toBe(badge);
      // The row's height is fixed by its own property and its width by
      // the section, so nothing inside it can change its size: it is a
      // relayout boundary, and the walk that follows stops there.
      expect(h.layout.record(row).relayoutBoundary).toBe(true);

      badge.setProperty('top', 300);
      h.layout.engine.layoutForFrame(
        new UiFrame(1, 0, new Map([[badge, DirtyFlags.Layout]])),
        Constraints.loose(400, 400)
      );

      // The row and the badge, and neither the section above them nor
      // the root above that: the ancestors whose bounds the badge just
      // grew past are exactly the ones this frame never re-placed.
      expect(h.layout.engine.stats.fullLayout).toBe(false);
      expect(h.layout.engine.stats.placed).toBe(2);
      expect(tester.hitTest(30, 310)?.node).toBe(badge);
    });

    it('hits a row scrolled into view', () => {
      const h = new InputTestHarness();
      const list = h.node('list', UiNodeType.ScrollView, { width: 200, height: 100, scrollY: 0 });
      const rows = [];
      for (let i = 0; i < 20; i++) {
        rows.push(h.node(`row-${i}`, UiNodeType.Box, { width: 200, height: 20, flexShrink: 0 }));
      }
      h.add(list, ...rows);
      h.add(h.root, list);
      h.root.setProperty('hitTestable', false);
      list.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      expect(tester.hitTest(10, 10)?.node).toBe(rows[0]);
      list.setProperty('scrollY', 150);
      // An incremental frame, so the records the first hit test was
      // answered from are the ones this one is answered from too.
      h.layout.engine.layoutForFrame(
        new UiFrame(1, 0, new Map([[list, DirtyFlags.Transform]])),
        Constraints.loose(400, 400)
      );
      // Row 8 spans content y 160..180, which the scroll puts at screen
      // y 10..30. Its record has not moved, and neither have the bounds
      // the list's children are checked against: a scroll shifts the
      // point into their space rather than moving them.
      expect(tester.hitTest(10, 15)?.node).toBe(rows[8]);
    });

    it('hits a sticky header where it is held, not where its record sits', () => {
      const h = new InputTestHarness();
      const list = h.node('list', UiNodeType.Column, {
        width: 200,
        height: 60,
        overflow: 'scroll',
        scrollY: 30
      });
      const header = h.node('header', UiNodeType.Box, {
        position: 'sticky',
        top: 0,
        width: 20,
        height: 10,
        flexShrink: 0
      });
      const body = h.node('body', UiNodeType.Box, { width: 20, height: 200, flexShrink: 0 });
      h.add(list, header, body);
      h.add(h.root, list);
      h.root.setProperty('hitTestable', false);
      list.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // The header's record is at content y 0..10 and the list is
      // scrolled 30, so it is drawn at the top of the list only because
      // of a shift that no box on the way down mentions.
      expect(h.layout.record(header).stickyOffsetY).toBe(30);
      expect(tester.hitTest(5, 5)?.node).toBe(header);
    });

    it('hits a node its transform moved clear of its layout box', () => {
      const h = new InputTestHarness();
      const box = h.node('box', UiNodeType.Box, {
        width: 100,
        height: 100,
        transform: { translateY: 300 }
      });
      h.add(h.root, box);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      expect(tester.hitTest(50, 350)?.node).toBe(box);
      expect(tester.hitTest(50, 50)).toBeNull();
    });

    it('hits an anchored overlay that moved after its frame had placed everything else', () => {
      const h = new InputTestHarness();
      const page = h.node('page', UiNodeType.Column);
      const spacer = h.node('spacer', UiNodeType.Box, { width: 60, height: 30 });
      const anchor = h.node('anchor', UiNodeType.Box, { width: 60, height: 20 });
      h.add(page, spacer, anchor);
      const layer = h.node('layer', UiNodeType.Box, { position: 'absolute', inset: 0 });
      const popup = h.node('popup', UiNodeType.Box, {
        position: 'absolute',
        anchor,
        width: 100,
        height: 50,
        placement: 'bottom-start'
      });
      h.add(layer, popup);
      h.add(h.root, page, layer);
      h.root.setProperty('hitTestable', false);
      layer.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // The popup hangs below the anchor, which starts at y 30..50.
      expect(tester.hitTest(10, 60)?.node).toBe(popup);

      spacer.setProperty('height', 90);
      h.layout.engine.layoutForFrame(
        new UiFrame(1, 0, new Map([[spacer, DirtyFlags.Layout]])),
        Constraints.loose(400, 400)
      );
      // `replaceMovedAnchored` runs after the pass has placed the flow,
      // so the popup's box is written last of all; the bounds have to
      // be taken from the tree as it settled and not as it was walked.
      expect(h.layout.box(popup).y).toBe(110);
      expect(tester.hitTest(10, 120)?.node).toBe(popup);
    });

    it('finds a scrollbar band inside a nested container', () => {
      const h = new InputTestHarness();
      const section = h.node('section', UiNodeType.Column);
      const list = h.node('list', UiNodeType.ScrollView, { width: 200, height: 100 });
      const tall = h.node('tall', UiNodeType.Box, { width: 200, height: 600, flexShrink: 0 });
      h.add(list, tall);
      h.add(section, list);
      h.add(h.root, section);
      h.root.setProperty('hitTestable', false);
      h.layoutTree();
      const tester = h.createHitTester();

      // The band along the right edge, whether or not the bar is
      // showing: `scrollbarZoneAt` walks the same tree with the same
      // early-out, and a scrollbar is always inside its container's
      // box, which is what a clipping node's bounds are.
      expect(tester.scrollbarZoneAt(196, 50)).toEqual({ node: list, axis: 'y' });
      expect(tester.scrollbarZoneAt(100, 50)).toBeNull();
    });

    /**
     * A 200x100 viewport over 600x600 of content, so both bars show.
     * The horizontal thumb is drawn in the bottom six pixels and the
     * vertical one in the rightmost six.
     */
    function bothBars(): {
      h: InputTestHarness;
      sheet: UiNode;
      tester: ReturnType<InputTestHarness['createHitTester']>;
    } {
      const h = new InputTestHarness();
      const sheet = h.node('sheet', UiNodeType.ScrollView, { width: 200, height: 100 });
      const big = h.node('big', UiNodeType.Box, { width: 600, height: 600, flexShrink: 0 });
      h.add(sheet, big);
      h.add(h.root, sheet);
      h.layoutTree();
      return { h, sheet, tester: h.createHitTester() };
    }

    it('grabs a thumb from anywhere in its band, not only the six pixels drawn', () => {
      // Missing a six-pixel target is not a near miss: the press lands
      // on the track and pages a whole screenful instead, which reads
      // as the bar refusing to be dragged.
      const { tester } = bothBars();

      // Ten pixels above the painted horizontal thumb, still in its band.
      const hit = tester.hitTest(20, 90);

      expect(hit?.scrollbar).toEqual({ axis: 'x', onThumb: true });
    });

    it('still calls the track the track, well away from the thumb', () => {
      const { h, sheet, tester } = bothBars();
      // The track takes a press only while the bar is showing, which is
      // what hovering near it does.
      h.layout.engine.recordFor(sheet)!.scrollbarVisibleUntil = performance.now() + 1000;

      // The horizontal thumb starts at the left; this is past its end.
      expect(tester.hitTest(180, 96)?.scrollbar).toEqual({ axis: 'x', onThumb: false });
    });

    it('gives the corner to whichever thumb is actually under the point', () => {
      // The bottom-right corner is in both bands, and precedence has to
      // answer with one of them. A press on the horizontal thumb there
      // used to page the vertical bar.
      const { h, sheet, tester } = bothBars();
      // Scroll right, so the horizontal thumb reaches the corner and the
      // vertical one stays at the top.
      h.layout.engine.recordFor(sheet)!.scrollX = 400;

      const hit = tester.hitTest(196, 96);

      expect(hit?.scrollbar).toEqual({ axis: 'x', onThumb: true });
    });
  });
});
