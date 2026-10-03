import { describe, expect, it, vi } from 'vitest';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { noKeyModifiers, UiEventType, UiWheelDeltaMode, type UiKeyModifiers } from './UiInputEvent';
import { InputTestHarness } from './UiInputTestUtils';
import { isNotchedWheel, UiWheelController } from './UiWheelController';

/**
 * A 400x400 app root holding a 300x200 ScrollView at (0,0). The
 * viewport shows the top of a 300x600 content box, so the scroll
 * range is scrollY in [0, 400]. Points of interest:
 *   (50,50)   -> content box inside the scroll view
 *   (350,350) -> app root (empty area, no scroll container)
 */
function setupVertical(): {
  h: InputTestHarness;
  scroll: UiNode;
  content: UiNode;
  app: UiNode;
  controller: UiWheelController;
} {
  const h = new InputTestHarness();
  const scroll = h.node('scroll', UiNodeType.ScrollView, { width: 300, height: 200 });
  const content = h.node('content', UiNodeType.Box, { width: 300, height: 600 });
  h.add(h.root, scroll);
  h.add(scroll, content);
  h.layoutTree();
  return { h, scroll, content, app: h.root, controller: h.createWheelController() };
}

/**
 * A 300x200 ScrollView laid out as a row, so it scrolls
 * horizontally. Its 600-wide content overflows the 300-wide viewport
 * (scrollX range [0, 300]).
 */
function setupHorizontal(): {
  h: InputTestHarness;
  scroll: UiNode;
  controller: UiWheelController;
} {
  const h = new InputTestHarness();
  const scroll = h.node('scroll', UiNodeType.ScrollView, {
    direction: 'row',
    width: 300,
    height: 200
  });
  const content = h.node('content', UiNodeType.Box, { width: 600, height: 200 });
  h.add(h.root, scroll);
  h.add(scroll, content);
  h.layoutTree();
  return { h, scroll, controller: h.createWheelController() };
}

/**
 * A 300x200 ScrollView whose 600x600 content overflows both ways, so
 * scrollX and scrollY both have range [0, 300] and [0, 400].
 *
 * This is the sheet's shape, and the one that found the bug: a
 * container used to be classified as horizontal *or* vertical from its
 * flex direction, so one of its two axes silently took no wheel at all.
 */
function setupBothAxes(): {
  h: InputTestHarness;
  scroll: UiNode;
  controller: UiWheelController;
} {
  const h = new InputTestHarness();
  const scroll = h.node('scroll', UiNodeType.ScrollView, { width: 300, height: 200 });
  const content = h.node('content', UiNodeType.Box, { width: 600, height: 600 });
  h.add(h.root, scroll);
  h.add(scroll, content);
  h.layoutTree();
  return { h, scroll, controller: h.createWheelController() };
}

function scrollY(h: InputTestHarness, node: UiNode): number {
  return h.layout.engine.recordFor(node)!.scrollY;
}

function scrollX(h: InputTestHarness, node: UiNode): number {
  return h.layout.engine.recordFor(node)!.scrollX;
}

describe('UiWheelController', () => {
  it('dispatches a bubbling Wheel to the node under the pointer', () => {
    const { h, scroll, content, controller } = setupVertical();
    const target = vi.fn();
    const ancestor = vi.fn();
    h.dispatcher.addEventListener(content, UiEventType.Wheel, target);
    h.dispatcher.addEventListener(scroll, UiEventType.Wheel, ancestor);

    const event = controller.wheel(50, 50, 0, 100);

    expect(event.type).toBe(UiEventType.Wheel);
    expect(event.x).toBe(50);
    expect(event.y).toBe(50);
    expect(event.deltaX).toBe(0);
    expect(event.deltaY).toBe(100);
    expect(target).toHaveBeenCalledTimes(1);
    expect(ancestor).toHaveBeenCalledTimes(1);
  });

  describe('a container that overflows on both axes', () => {
    it('takes a horizontal wheel, which a column-laid-out one used to drop', () => {
      const { h, scroll, controller } = setupBothAxes();

      const event = controller.wheel(50, 50, 80, 0);

      expect(scrollX(h, scroll)).toBe(80);
      expect(scrollY(h, scroll)).toBe(0);
      expect(event.consumed).toBe(true);
    });

    it('takes both axes of one diagonal wheel', () => {
      const { h, scroll, controller } = setupBothAxes();

      controller.wheel(50, 50, 40, 70);

      expect(scrollX(h, scroll)).toBe(40);
      expect(scrollY(h, scroll)).toBe(70);
    });

    it('takes the axis with room and leaves the one without', () => {
      const { h, scroll, controller } = setupBothAxes();
      controller.wheel(50, 50, 1000, 0);
      expect(scrollX(h, scroll)).toBe(300);

      // Hard against the right edge, a further rightward delta has
      // nowhere to go — but the downward half must still land.
      controller.wheel(50, 50, 50, 60);

      expect(scrollX(h, scroll)).toBe(300);
      expect(scrollY(h, scroll)).toBe(60);
    });

    it('converts a page delta in each axis own extent', () => {
      const { h, scroll, controller } = setupBothAxes();

      controller.wheel(50, 50, 1, 1, noKeyModifiers(), UiWheelDeltaMode.Page);

      // One screenful is 300 across and 200 down, not one of them twice.
      expect(scrollX(h, scroll)).toBe(300);
      expect(scrollY(h, scroll)).toBe(200);
    });

    it('reports both axes as scrollable', () => {
      const { controller } = setupBothAxes();

      expect(controller.scrollabilityAt(50, 50)).toEqual({ up: false, down: true, left: false, right: true });
    });
  });

  it('reads a line delta as lines, not as pixels', () => {
    // A `WheelEvent`'s delta is a distance only in pixel mode. Firefox
    // reports lines — three per notch — so taken at face value a notch
    // moved the view three pixels, which reads as a scroll that is
    // broken rather than one that is slow.
    const { h, scroll, controller } = setupVertical();

    controller.wheel(50, 50, 0, 3, noKeyModifiers(), UiWheelDeltaMode.Line);

    expect(scrollY(h, scroll)).toBe(48);
  });

  it('reads a page delta as one screenful of the container it is over', () => {
    // The 200-tall viewport, which is what paging the scrollbar track
    // already moves by.
    const { h, scroll, controller } = setupVertical();

    controller.wheel(50, 50, 0, 1, noKeyModifiers(), UiWheelDeltaMode.Page);

    expect(scrollY(h, scroll)).toBe(200);
  });

  it('counts a detent that a display scaled off a round number', () => {
    // Real hardware, and the reason an equality test was wrong: the
    // same mouse reports -120 on one monitor and -119 on another, with
    // a `deltaY` of 119.99999642372141 rather than a round number,
    // because Chrome scales a wheel delta per display and the scaled
    // value is truncated into the legacy field. Demanding an exact
    // multiple classified every notch on that display as a precision
    // device, and scrolling never smoothed at all.
    expect(isNotchedWheel(UiWheelDeltaMode.Pixel, -119)).toBe(true);
    expect(isNotchedWheel(UiWheelDeltaMode.Pixel, -120)).toBe(true);
    expect(isNotchedWheel(UiWheelDeltaMode.Pixel, -241)).toBe(true);
  });

  it('does not count what a precision device sends', () => {
    // A trackpad's deltas are small and arbitrary. The half-detent
    // floor is what keeps them out: without it, anything near zero
    // reads as a whole number of detents.
    for (const delta of [7, -7, 40, 60, 100, -100]) {
      expect(isNotchedWheel(UiWheelDeltaMode.Pixel, delta)).toBe(false);
    }
    expect(isNotchedWheel(UiWheelDeltaMode.Pixel, undefined)).toBe(false);
    // A delta that is not in pixels is never a precision device.
    expect(isNotchedWheel(UiWheelDeltaMode.Line, undefined)).toBe(true);
  });

  describe('pacing a precision device over frames', () => {
    // A trackpad sends on its own clock: here a 10-pixel step every 7.5
    // ms against a frame every 16.7, so a frame catches two steps or
    // three. Applied as they come, the page moves 20, then 30, then 20,
    // which is judder.
    function flick(steps: number, stepMs: number, frameMs: number) {
      const { h, scroll, content } = setupVertical();
      content.setProperty('height', 100_000);
      h.layoutTree();
      const controller = new UiWheelController(
        h.createHitTester(),
        h.dispatcher,
        h.scrollSink,
        () => h.root,
        () => 0,
        { pace: true }
      );
      const moves: number[] = [];
      const behind: number[] = [];
      let sent = 0;
      let next = 0;
      for (let frame = frameMs; next < steps || frame < steps * stepMs + 200; frame += frameMs) {
        while (next < steps && next * stepMs <= frame) {
          controller.wheel(50, 50, 0, 10, noKeyModifiers(), UiWheelDeltaMode.Pixel, undefined, next * stepMs);
          sent += 10;
          next++;
        }
        const before = scrollY(h, scroll);
        controller.advance(frame);
        moves.push(scrollY(h, scroll) - before);
        behind.push(sent - scrollY(h, scroll));
      }
      return { moves, behind, total: scrollY(h, scroll) };
    }

    it('moves a steady flick by even steps, never behind it and never backwards', () => {
      const { moves, behind, total } = flick(80, 7.5, 1000 / 60);
      // It ends within a frame's travel past where the steps add up to:
      // a prediction that ran ahead stays, since pulling it back is the
      // spring the eye sees.
      expect(total).toBeGreaterThanOrEqual(800);
      expect(total).toBeLessThanOrEqual(800 + 40);
      expect(Math.min(...moves)).toBeGreaterThanOrEqual(0);
      // While the flick is under way, each frame moves by what the input
      // moves in a frame (22.2 pixels), give or take a pixel or two.
      for (const move of moves.slice(2, 30)) {
        expect(move).toBeGreaterThan(19);
        expect(move).toBeLessThan(25.5);
      }
      // And the page is never behind the steps that have arrived.
      expect(Math.max(...behind.slice(0, 30))).toBeLessThanOrEqual(0);
    });

    it('stops at the edge a flick runs into, without springing back off it', () => {
      // A flick up into the top: the prediction reaches past it, the list
      // stops at 0, and withdrawing the prediction must not move it down
      // again while the flick's coast keeps pushing it up.
      const { h, scroll, content } = setupVertical();
      content.setProperty('height', 100_000);
      h.layoutTree();
      scroll.setProperty('scrollY', 120);
      h.layoutTree();
      const controller = new UiWheelController(h.createHitTester(), h.dispatcher, h.scrollSink, () => h.root, () => 0, { pace: true });
      const offsets: number[] = [];
      let at = 0;
      for (let frame = 1; frame <= 30; frame++) {
        const time = frame * (1000 / 60);
        // A step every 7.5 ms, shrinking as the coast slows.
        while (at <= time && at < 200) {
          controller.wheel(50, 50, 0, -Math.max(1, 20 - at / 10), noKeyModifiers(), UiWheelDeltaMode.Pixel, undefined, at);
          at += 7.5;
        }
        controller.advance(time);
        offsets.push(scrollY(h, scroll));
      }
      const hit = offsets.indexOf(0);
      expect(hit).toBeGreaterThan(-1);
      // From the frame it reaches the top, it stays there.
      expect(offsets.slice(hit)).toEqual(offsets.slice(hit).map(() => 0));
    });

    it('applies a lone step at once, and exactly, where no time is given', () => {
      const { h, scroll } = setupVertical();
      const controller = new UiWheelController(
        h.createHitTester(),
        h.dispatcher,
        h.scrollSink,
        () => h.root,
        () => 0,
        { pace: true }
      );
      controller.wheel(50, 50, 0, 30, noKeyModifiers(), UiWheelDeltaMode.Pixel);
      controller.advance();
      expect(scrollY(h, scroll)).toBe(30);
    });
  });

  describe('a trackpad whose deltas look like detents', () => {
    // Chrome on a Mac reports a trackpad's legacy wheelDeltaY as three
    // times its pixel delta, so a 40-pixel step reads -120, a whole
    // detent. Taken one event at a time, those were smoothed and the
    // steps around them weren't: a flick hesitated wherever it passed
    // through 40 pixels a frame, most noticeably as it slowed down.
    function flick(
      controller: UiWheelController,
      clock: { now: number },
      deltas: readonly number[],
      gapMs: number
    ): void {
      for (const delta of deltas) {
        controller.wheel(50, 50, 0, delta, noKeyModifiers(), UiWheelDeltaMode.Pixel, -delta * 3);
        clock.now += gapMs;
      }
    }

    it("doesn't smooth any step of a gesture that has shown itself precise", () => {
      const { h, scroll } = setupVertical();
      const clock = { now: 1000 };
      const controller = new UiWheelController(
        h.createHitTester(),
        h.dispatcher,
        h.scrollSink,
        () => h.root,
        () => clock.now
      );
      flick(controller, clock, [3, 9, 18, 31, 40, 52, 40, 27, 19, 13, 8, 5, 3, 2, 1], 16);
      const smooth = h.scrollSink.calls.filter(call => call.node === scroll && call.behavior === 'smooth');
      expect(smooth).toEqual([]);
    });

    it('still smooths a mouse wheel, and one used a while after the trackpad', () => {
      const { h, scroll } = setupVertical();
      const clock = { now: 1000 };
      const controller = new UiWheelController(
        h.createHitTester(),
        h.dispatcher,
        h.scrollSink,
        () => h.root,
        () => clock.now
      );
      flick(controller, clock, [4, 9, 3], 16);
      clock.now += 1000;
      for (let notch = 0; notch < 3; notch++) {
        controller.wheel(50, 50, 0, 100, noKeyModifiers(), UiWheelDeltaMode.Pixel, -120);
        clock.now += 120;
      }
      const behaviors = h.scrollSink.calls.filter(call => call.node === scroll).map(call => call.behavior);
      expect(behaviors).toEqual(['instant', 'instant', 'instant', 'smooth', 'smooth', 'smooth']);
    });
  });

  it('carries the mode on the event, as the DOM does', () => {
    // The deltas stay in the unit they arrived in. A handler reading
    // them without checking the mode is the bug this exists to name.
    const { controller } = setupVertical();

    const event = controller.wheel(50, 50, 0, 3, noKeyModifiers(), UiWheelDeltaMode.Line);

    expect(event.deltaY).toBe(3);
    expect(event.deltaMode).toBe(UiWheelDeltaMode.Line);
  });

  it('scrolls the nearest scroll container by deltaY', () => {
    const { h, scroll, controller } = setupVertical();

    controller.wheel(50, 50, 0, 100);

    expect(scrollY(h, scroll)).toBe(100);
  });

  it('clamps at the content edge', () => {
    const { h, scroll, controller } = setupVertical();

    controller.wheel(50, 50, 0, 1000);

    expect(scrollY(h, scroll)).toBe(400);
  });

  it('scrolls in the reverse direction when deltaY is negative', () => {
    const { h, scroll, controller } = setupVertical();

    controller.wheel(50, 50, 0, 200);
    controller.wheel(50, 50, 0, -50);

    expect(scrollY(h, scroll)).toBe(150);
  });

  it('does not scroll when the Wheel was defaultPrevented', () => {
    const { h, scroll, controller } = setupVertical();
    h.dispatcher.addEventListener(scroll, UiEventType.Wheel, event => {
      event.preventDefault();
    });

    controller.wheel(50, 50, 0, 100);

    expect(scrollY(h, scroll)).toBe(0);
  });

  it('scrolls a horizontal container by deltaX', () => {
    const { h, scroll, controller } = setupHorizontal();

    controller.wheel(50, 50, 50, 0);

    expect(scrollX(h, scroll)).toBe(50);
    expect(scrollX(h, scroll)).toBeGreaterThan(0);
    expect(scrollX(h, scroll)).toBeLessThanOrEqual(300);
  });

  it('does nothing when no scroll container is under the pointer', () => {
    const { controller } = setupVertical();

    expect(() => controller.wheel(350, 350, 0, 100)).not.toThrow();
  });

  it('marks the event consumed when a container took the delta', () => {
    // The only fact a shell can act on. A canvas that prevents the
    // browser default unconditionally is a scroll trap in the page
    // around it; one that never prevents lets a single wheel scroll
    // both the container and the page.
    const { controller } = setupVertical();

    expect(controller.wheel(50, 50, 0, 100).consumed).toBe(true);
  });

  it('leaves a wheel unconsumed at the edge it is already against', () => {
    // The scroll view starts at the top, so an upward wheel has
    // nowhere to go. The page around the canvas gets it instead —
    // which is the whole of the scroll-trap fix.
    const { controller } = setupVertical();

    expect(controller.wheel(50, 50, 0, -100).consumed).toBe(false);
  });

  it('consumes a wheel it cannot use when the container contains overscroll', () => {
    // `overscrollBehavior="contain"` is how a full-viewport app says
    // nothing leaves the canvas, and it has to hold at the edge —
    // the edge is the only place the question is ever asked.
    const { scroll, controller } = setupVertical();
    scroll.setProperty('overscrollBehavior', 'contain');

    expect(controller.wheel(50, 50, 0, -100).consumed).toBe(true);
  });

  it('consumes a wheel nothing could use when the root contains overscroll', () => {
    const { h, controller } = setupVertical();
    h.root.setProperty('overscrollBehavior', 'contain');

    // Over empty root area, where there is no scroll container at all.
    expect(controller.wheel(350, 350, 0, 100).consumed).toBe(true);
  });

  it('takes a wheel that overshoots rather than handing it to the page', () => {
    // Part-way down its range with room in the direction of travel,
    // so the container takes the whole delta and clamps. A browser
    // does the same, and it is what stops a fast flick jumping out of
    // a list and scrolling the page behind it.
    const { h, scroll, controller } = setupVertical();
    controller.wheel(50, 50, 0, 100);

    const event = controller.wheel(50, 50, 0, 10000);

    expect(event.consumed).toBe(true);
    expect(scrollY(h, scroll)).toBe(400);
  });

  it('chains past a container with no room to one that has some', () => {
    // An inner list scrolled to its end sits inside an outer one that
    // is not. The delta belongs to the outer, exactly as it would in
    // a document.
    const h = new InputTestHarness();
    const outer = h.node('outer', UiNodeType.ScrollView, { width: 300, height: 200 });
    const inner = h.node('inner', UiNodeType.ScrollView, { width: 300, height: 100 });
    const content = h.node('content', UiNodeType.Box, { width: 300, height: 100 });
    const filler = h.node('filler', UiNodeType.Box, { width: 300, height: 600 });
    h.add(h.root, outer);
    h.add(outer, inner);
    h.add(inner, content);
    h.add(outer, filler);
    h.layoutTree();
    const controller = h.createWheelController();

    // The inner view is 100 tall around 100 of content: nothing to
    // scroll, so the wheel goes to the outer one.
    const event = controller.wheel(50, 50, 0, 100);

    expect(event.consumed).toBe(true);
    expect(scrollY(h, inner)).toBe(0);
    expect(scrollY(h, outer)).toBe(100);
  });

  it('reports which way it could scroll, without scrolling', () => {
    const { h, scroll, controller } = setupVertical();

    expect(controller.scrollabilityAt(50, 50)).toEqual({ up: false, down: true, left: false, right: false });
    expect(scrollY(h, scroll)).toBe(0);

    controller.wheel(50, 50, 0, 100);
    expect(controller.scrollabilityAt(50, 50)).toEqual({ up: true, down: true, left: false, right: false });

    controller.wheel(50, 50, 0, 1000);
    expect(controller.scrollabilityAt(50, 50)).toEqual({ up: true, down: false, left: false, right: false });
  });

  it('reports nothing scrollable over empty space', () => {
    const { controller } = setupVertical();

    expect(controller.scrollabilityAt(350, 350)).toEqual({ up: false, down: false, left: false, right: false });
  });

  it('answers the tree-level question a touchscreen has to ask', () => {
    // `touch-action` is latched when the finger lands, so there is no
    // hover position it could have been derived from.
    expect(setupVertical().controller.scrollsAnything()).toBe(true);

    const bare = new InputTestHarness();
    bare.add(bare.root, bare.node('box', UiNodeType.Box, { width: 100, height: 100 }));
    bare.layoutTree();
    expect(bare.createWheelController().scrollsAnything()).toBe(false);

    bare.root.setProperty('overscrollBehavior', 'contain');
    expect(bare.createWheelController().scrollsAnything()).toBe(true);
  });

  it('remembers where the last wheel landed, for a host with no hover', () => {
    // Scrolling a page slides a canvas under a cursor that never
    // moved, so no pointer event ever tells the runtime it is
    // hovered. The wheel itself is then the only evidence of where
    // the pointer is, and a host reporting scrollability across a
    // worker boundary has nothing else to fall back to.
    const { scroll, controller } = setupVertical();

    expect(controller.lastWheelTarget).toBeNull();
    controller.wheel(50, 50, 0, 100);

    expect(controller.scrollabilityOf(controller.lastWheelTarget)).toEqual({
      up: true,
      down: true,
      left: false,
      right: false
    });
    expect(controller.lastWheelTarget?.parent).toBe(scroll);
  });

  it('reports every direction kept for a contained root with nothing hovered', () => {
    // The first wheel of a burst, before anything has been hovered.
    // A full-viewport app that asked to contain its overscroll must
    // not leak that one to the page it is mounted in.
    const { h, controller } = setupVertical();
    expect(controller.scrollabilityOf(null)).toEqual({ up: false, down: false, left: false, right: false });

    h.root.setProperty('overscrollBehavior', 'contain');

    expect(controller.scrollabilityOf(null)).toEqual({ up: true, down: true, left: true, right: true });
  });

  it('keeps every wheel over a contained node that is not a scroll container', () => {
    // A canvas that pans and zooms on the wheel itself: a plain box, not
    // a ScrollView, so it has no room to report. `contain` on it has to
    // keep every wheel over it anyway — a ctrl-wheel, or a trackpad
    // pinch, which Chrome sends as one, would otherwise zoom the page.
    // Below the 300x200 scroll view sits a 300x100 canvas at (0,200).
    const { h } = setupVertical();
    const canvas = h.node('canvas', UiNodeType.Box, { width: 300, height: 100 });
    h.add(h.root, canvas);
    h.layoutTree();
    const controller = h.createWheelController();

    expect(controller.scrollabilityAt(50, 250)).toEqual({ up: false, down: false, left: false, right: false });
    expect(controller.wheel(50, 250, 0, -100).consumed).toBe(false);

    canvas.setProperty('overscrollBehavior', 'contain');

    expect(controller.scrollabilityAt(50, 250)).toEqual({ up: true, down: true, left: true, right: true });
    expect(controller.wheel(50, 250, 0, -100).consumed).toBe(true);
    // Only over the canvas: the empty root beside it still lets the
    // wheel out to the page.
    expect(controller.scrollabilityAt(350, 350)).toEqual({ up: false, down: false, left: false, right: false });
    expect(controller.wheel(350, 350, 0, 100).consumed).toBe(false);
  });

  it('reads containment from the root it is given, not the topmost node', () => {
    // A mounted app is not the tree's root: the runtime wraps it in a
    // stack beside its overlay layer. `contain` on the app's own root
    // was on a node the controller never asked, so the property's
    // documented use did nothing. Here the harness root plays the
    // wrapper, `app` the application and `overlay` the overlay layer.
    const h = new InputTestHarness();
    const app = h.node('application', UiNodeType.Box, { width: 400, height: 300 });
    const overlay = h.node('overlay', UiNodeType.Box, { width: 400, height: 100 });
    h.add(h.root, app);
    h.add(h.root, overlay);
    h.layoutTree();
    const controller = new UiWheelController(h.createHitTester(), h.dispatcher, h.scrollSink, () => app);
    app.setProperty('overscrollBehavior', 'contain');

    // Over the app, where the chain walk finds it.
    expect(controller.wheel(50, 50, 0, 100).consumed).toBe(true);
    // Over the overlay layer, which is not under the app's root.
    expect(controller.scrollabilityAt(50, 350)).toEqual({ up: true, down: true, left: true, right: true });
    expect(controller.wheel(50, 350, 0, 100).consumed).toBe(true);
    // Before anything is hovered.
    expect(controller.scrollabilityOf(null)).toEqual({ up: true, down: true, left: true, right: true });
    expect(controller.scrollsAnything()).toBe(true);
  });

  it('carries the modifiers on the event', () => {
    const { h, controller } = setupVertical();
    const received: UiKeyModifiers[] = [];
    h.dispatcher.addEventListener(h.root, UiEventType.Wheel, event => {
      received.push((event as unknown as { modifiers: UiKeyModifiers }).modifiers);
    });

    controller.wheel(50, 50, 0, 10, { shift: true, ctrl: false, alt: false, meta: false });

    expect(received).toEqual([{ shift: true, ctrl: false, alt: false, meta: false }]);
  });
});
