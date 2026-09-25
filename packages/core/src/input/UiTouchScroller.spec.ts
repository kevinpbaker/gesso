import { describe, expect, it } from 'vitest';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { UiEventType, type UiPointerDevice } from './UiInputEvent';
import { InputTestHarness } from './UiInputTestUtils';
import type { UiPointerController } from './UiPointerController';
import type { UiTouchScroller } from './UiTouchScroller';

const FINGER: UiPointerDevice = { id: 3, kind: 'touch' };
const MOUSE: UiPointerDevice = { id: 1, kind: 'mouse' };
const NO_MODS = { ctrl: false, shift: false, alt: false, meta: false };

/**
 * A 300x200 ScrollView showing the top of a 300x600 content box, so
 * scrollY runs [0, 400]. The press lands on the content at (50,50).
 *
 * The clock is ours: velocity is measured in milliseconds, and a spec
 * that waited for real ones would be measuring the test runner.
 */
function setup(): {
  h: InputTestHarness;
  scroll: UiNode;
  content: UiNode;
  controller: UiPointerController;
  scroller: UiTouchScroller;
  tick(ms: number): void;
} {
  const h = new InputTestHarness();
  const scroll = h.node('scroll', UiNodeType.ScrollView, { width: 300, height: 200 });
  const content = h.node('content', UiNodeType.Box, { width: 300, height: 600 });
  h.add(h.root, scroll);
  h.add(scroll, content);
  h.layoutTree();
  let clock = 0;
  const scroller = h.createTouchScroller({ now: () => clock });
  return {
    h,
    scroll,
    content,
    controller: h.createGesturePointerController(),
    scroller,
    tick: ms => {
      clock += ms;
    }
  };
}

function scrollYOf(h: InputTestHarness, node: UiNode): number {
  return h.layout.engine.recordFor(node)?.scrollY ?? 0;
}

describe('UiTouchScroller', () => {
  it('drags the content with the finger', () => {
    const { h, scroll, controller } = setup();

    controller.pointerDown(50, 50, 1, NO_MODS, FINGER);
    // Past the 12px touch slop, so the recognizer claims a pan.
    controller.pointerMove(50, 20, 1, NO_MODS, FINGER);

    // The finger moved 30px up, so the content came up 30px with it.
    expect(scrollYOf(h, scroll)).toBe(30);

    controller.pointerMove(50, 0, 1, NO_MODS, FINGER);
    expect(scrollYOf(h, scroll)).toBe(50);
  });

  it('leaves a mouse drag alone, so it can still select text', () => {
    const { h, scroll, controller } = setup();

    controller.pointerDown(50, 50, 1, NO_MODS, MOUSE);
    controller.pointerMove(50, 20, 1, NO_MODS, MOUSE);

    expect(scrollYOf(h, scroll)).toBe(0);
  });

  it('does not scroll a pan a widget claimed', () => {
    const { h, scroll, content, controller } = setup();
    // What Slider and SplitPane both do to own their drag.
    h.dispatcher.addEventListener(content, UiEventType.PanStart, event => event.stopPropagation());
    h.dispatcher.addEventListener(content, UiEventType.PanMove, event => event.stopPropagation());

    controller.pointerDown(50, 50, 1, NO_MODS, FINGER);
    controller.pointerMove(50, 20, 1, NO_MODS, FINGER);

    expect(scrollYOf(h, scroll)).toBe(0);
  });

  it('reveals the scrollbars, which a finger can never hover', () => {
    const { h, scroll, controller } = setup();

    controller.pointerDown(50, 50, 1, NO_MODS, FINGER);
    controller.pointerMove(50, 20, 1, NO_MODS, FINGER);

    expect(h.scrollSink.revealed).toContain(scroll);
  });

  it('coasts on a flick, through the sink smooth path', () => {
    const { h, scroll, controller, tick } = setup();

    controller.pointerDown(50, 150, 1, NO_MODS, FINGER);
    tick(16);
    controller.pointerMove(50, 118, 1, NO_MODS, FINGER);
    tick(16);
    controller.pointerMove(50, 86, 1, NO_MODS, FINGER);
    controller.pointerUp(50, 86, 0, NO_MODS, FINGER);

    // 64px over 32ms is 2px/ms, projected over the 300ms of momentum.
    const fling = h.scrollSink.calls.at(-1);
    expect(fling?.behavior).toBe('smooth');
    expect(fling?.node).toBe(scroll);
    expect(fling?.dy).toBeCloseTo(600);
  });

  it('does not coast when the finger was placing the content, not throwing it', () => {
    const { h, controller, tick } = setup();

    controller.pointerDown(50, 150, 1, NO_MODS, FINGER);
    tick(500);
    controller.pointerMove(50, 130, 1, NO_MODS, FINGER);
    tick(500);
    controller.pointerUp(50, 130, 0, NO_MODS, FINGER);

    expect(h.scrollSink.calls.every(call => call.behavior === 'instant')).toBe(true);
  });

  it('hands the scroll to the container outside once the inner one is spent', () => {
    const h = new InputTestHarness();
    const outer = h.node('outer', UiNodeType.ScrollView, { width: 400, height: 300 });
    const inner = h.node('inner', UiNodeType.ScrollView, { width: 300, height: 200 });
    const content = h.node('content', UiNodeType.Box, { width: 300, height: 300 });
    const spacer = h.node('spacer', UiNodeType.Box, { width: 300, height: 400 });
    h.add(h.root, outer);
    h.add(outer, inner, spacer);
    h.add(inner, content);
    h.layoutTree();
    const controller = h.createGesturePointerController();
    h.createTouchScroller();

    controller.pointerDown(50, 50, 1, NO_MODS, FINGER);
    // The inner view has 100px to give; ask for 130.
    controller.pointerMove(50, -80, 1, NO_MODS, FINGER);
    expect(scrollYOf(h, inner)).toBe(100);
    expect(scrollYOf(h, outer)).toBe(0);

    // The next move finds the inner one spent and moves the outer.
    controller.pointerMove(50, -120, 1, NO_MODS, FINGER);
    expect(scrollYOf(h, inner)).toBe(100);
    expect(scrollYOf(h, outer)).toBe(40);
  });

  it('scrolls a row container along its own axis', () => {
    const h = new InputTestHarness();
    const scroll = h.node('scroll', UiNodeType.ScrollView, { direction: 'row', width: 300, height: 200 });
    const content = h.node('content', UiNodeType.Box, { width: 600, height: 200 });
    h.add(h.root, scroll);
    h.add(scroll, content);
    h.layoutTree();
    const controller = h.createGesturePointerController();
    h.createTouchScroller();

    controller.pointerDown(150, 50, 1, NO_MODS, FINGER);
    controller.pointerMove(110, 50, 1, NO_MODS, FINGER);

    expect(h.layout.engine.recordFor(scroll)?.scrollX).toBe(40);
  });

  describe('a surface that overflows both ways', () => {
    /**
     * A 300x200 viewport over 600x600 of content, which is a
     * spreadsheet. This container used to be classified from its flex
     * direction and asked for one axis, so a finger could not move it
     * sideways at all: the same bug the wheel had until 38e70a3, on the
     * same shared state, found the same way.
     */
    function sheet() {
      const h = new InputTestHarness();
      const scroll = h.node('scroll', UiNodeType.ScrollView, { width: 300, height: 200 });
      const content = h.node('content', UiNodeType.Box, { width: 600, height: 600 });
      h.add(h.root, scroll);
      h.add(scroll, content);
      h.layoutTree();
      let clock = 0;
      const scroller = h.createTouchScroller({ now: () => clock });
      return {
        h,
        scroll,
        scroller,
        controller: h.createGesturePointerController(),
        tick: (ms: number) => {
          clock += ms;
        },
        at: () => {
          const record = h.layout.engine.recordFor(scroll);
          return { x: record?.scrollX ?? 0, y: record?.scrollY ?? 0 };
        }
      };
    }

    it('drags sideways', () => {
      const { controller, at } = sheet();

      controller.pointerDown(150, 50, 1, NO_MODS, FINGER);
      controller.pointerMove(110, 50, 1, NO_MODS, FINGER);

      expect(at()).toEqual({ x: 40, y: 0 });
    });

    it('drags on both axes at once, because a finger moves diagonally', () => {
      const { controller, at } = sheet();

      controller.pointerDown(150, 100, 1, NO_MODS, FINGER);
      controller.pointerMove(120, 70, 1, NO_MODS, FINGER);

      expect(at()).toEqual({ x: 30, y: 30 });
    });

    it('goes on taking the axis that still has room when the other is spent', () => {
      const { controller, at } = sheet();

      // Right to the bottom, then keep dragging up and left.
      controller.pointerDown(150, 190, 1, NO_MODS, FINGER);
      controller.pointerMove(150, 0, 1, NO_MODS, FINGER);
      controller.pointerMove(100, 0, 1, NO_MODS, FINGER);

      expect(at()).toEqual({ x: 50, y: 190 });
    });

    it('coasts on both axes after a diagonal throw', () => {
      const { controller, tick, at } = sheet();

      controller.pointerDown(150, 150, 1, NO_MODS, FINGER);
      tick(16);
      controller.pointerMove(130, 130, 1, NO_MODS, FINGER);
      tick(16);
      controller.pointerMove(110, 110, 1, NO_MODS, FINGER);
      tick(16);
      controller.pointerUp(90, 90, 0, NO_MODS, FINGER);

      const { x, y } = at();
      expect(x).toBeGreaterThan(60);
      expect(y).toBeGreaterThan(60);
    });

    it("does not drag a vertical throw sideways by the thumb's drift", () => {
      // One threshold on the combined speed would let this through.
      const { controller, tick, at } = sheet();

      controller.pointerDown(150, 150, 1, NO_MODS, FINGER);
      tick(16);
      controller.pointerMove(150, 110, 1, NO_MODS, FINGER);
      tick(16);
      controller.pointerMove(149, 70, 1, NO_MODS, FINGER);
      tick(16);
      controller.pointerUp(149, 30, 0, NO_MODS, FINGER);

      const { x, y } = at();
      expect(y).toBeGreaterThan(120);
      // The single pixel of sideways drift is well under the fling
      // threshold on its own axis, so nothing coasts on it.
      expect(x).toBe(1);
    });
  });

  it('stops scrolling once disposed', () => {
    const { h, scroll, controller, scroller } = setup();
    scroller.dispose();

    controller.pointerDown(50, 50, 1, NO_MODS, FINGER);
    controller.pointerMove(50, 20, 1, NO_MODS, FINGER);

    expect(scrollYOf(h, scroll)).toBe(0);
  });

  it('reports the container it is scrolling while the pan runs', () => {
    const { controller, scroller } = setup();

    expect(scroller.scrollingNode).toBeNull();
    controller.pointerDown(50, 50, 1, NO_MODS, FINGER);
    controller.pointerMove(50, 20, 1, NO_MODS, FINGER);
    expect(scroller.scrollingNode).not.toBeNull();
    controller.pointerUp(50, 20, 0, NO_MODS, FINGER);
    expect(scroller.scrollingNode).toBeNull();
  });
});
