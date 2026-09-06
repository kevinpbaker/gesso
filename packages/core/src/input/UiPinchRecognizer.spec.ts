import { describe, expect, it, vi } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import {
  noKeyModifiers,
  UiEventType,
  type UiPinchEvent,
  type UiPointerDevice,
  type UiPointerEvent
} from './UiInputEvent';
import { InputTestHarness } from './UiInputTestUtils';
import { UiGestureRecognizer } from './UiGestureRecognizer';
import { UiPointerController } from './UiPointerController';

const FIRST: UiPointerDevice = { id: 1, kind: 'touch' };
const SECOND: UiPointerDevice = { id: 2, kind: 'touch' };
const THIRD: UiPointerDevice = { id: 3, kind: 'touch' };
const NO_MODS = noKeyModifiers();

/**
 * A 200x200 box in the middle of the app root, and a controller with a
 * recognizer behind it.
 *
 * Everything goes in through `UiPointerController` rather than at the
 * recognizer directly, because the contact bookkeeping is the half of
 * this that `decisions/0041` said was missing: a spec that fed the
 * recognizer both contacts by hand would pass whether or not the
 * controller ever reported the second one.
 */
function setup(): { h: InputTestHarness; box: UiNode; controller: UiPointerController } {
  const h = new InputTestHarness();
  const box = h.node('box', UiNodeType.Box, { width: 200, height: 200 });
  h.add(h.root, box);
  h.layoutTree();
  const gestures = new UiGestureRecognizer(h.dispatcher);
  const controller = new UiPointerController(h.createHitTester(), h.dispatcher, { gestures });
  return { h, box, controller };
}

/** Collects the pinch events a node receives, in order. */
function record(h: InputTestHarness, node: UiNode): UiPinchEvent[] {
  const events: UiPinchEvent[] = [];
  const push = (event: unknown): void => {
    events.push(event as UiPinchEvent);
  };
  h.dispatcher.addEventListener(node, UiEventType.PinchStart, push);
  h.dispatcher.addEventListener(node, UiEventType.PinchMove, push);
  h.dispatcher.addEventListener(node, UiEventType.PinchEnd, push);
  return events;
}

describe('UiPinchRecognizer', () => {
  it('reports the scale two fingers moving apart describe', () => {
    const { h, box, controller } = setup();
    const events = record(h, box);

    controller.pointerDown(80, 100, 1, NO_MODS, FIRST);
    controller.pointerDown(120, 100, 1, NO_MODS, SECOND);
    // 40px apart, then 80px: twice the size.
    controller.pointerMove(60, 100, 1, NO_MODS, FIRST);
    controller.pointerMove(140, 100, 1, NO_MODS, SECOND);

    expect(events.map(event => event.type)).toEqual([UiEventType.PinchStart, UiEventType.PinchMove]);
    expect(events[1].scale).toBeCloseTo(2, 5);
    expect(events[1].x).toBeCloseTo(100, 5);
  });

  it('holds the gesture until the contacts have moved past the threshold', () => {
    const { h, box, controller } = setup();
    const events = record(h, box);

    controller.pointerDown(80, 100, 1, NO_MODS, FIRST);
    controller.pointerDown(120, 100, 1, NO_MODS, SECOND);
    // One pixel on 40: well inside the 5% the recognizer asks for.
    controller.pointerMove(79.5, 100, 1, NO_MODS, FIRST);

    expect(events).toEqual([]);
  });

  it('reports rotation in degrees, and does not spin across the seam', () => {
    const { h, box, controller } = setup();
    const events = record(h, box);

    controller.pointerDown(100, 100, 1, NO_MODS, FIRST);
    controller.pointerDown(140, 100, 1, NO_MODS, SECOND);
    // The second contact swings a quarter turn about the first.
    controller.pointerMove(100, 140, 1, NO_MODS, SECOND);

    expect(events.at(-1)!.rotation).toBeCloseTo(90, 5);
    expect(events.at(-1)!.scale).toBeCloseTo(1, 5);
  });

  it('reads a two-finger drag as a translation of the midpoint', () => {
    const { h, box, controller } = setup();
    const events = record(h, box);

    controller.pointerDown(80, 100, 1, NO_MODS, FIRST);
    controller.pointerDown(120, 100, 1, NO_MODS, SECOND);
    // Spread enough to claim the gesture, then move both together.
    controller.pointerMove(70, 100, 1, NO_MODS, FIRST);
    controller.pointerMove(130, 100, 1, NO_MODS, SECOND);
    const before = events.at(-1)!;
    controller.pointerMove(70, 130, 1, NO_MODS, FIRST);
    controller.pointerMove(130, 130, 1, NO_MODS, SECOND);
    const after = events.at(-1)!;

    expect(after.scale).toBeCloseTo(before.scale, 5);
    expect(after.y - before.y).toBeCloseTo(30, 5);
    expect(after.translateY).toBeCloseTo(15, 5);
  });

  it('ends the pan the first finger was making, rather than abandoning it', () => {
    const { h, box, controller } = setup();
    const panStart = vi.fn();
    const panEnd = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.PanStart, panStart);
    h.dispatcher.addEventListener(box, UiEventType.PanEnd, panEnd);

    controller.pointerDown(80, 100, 1, NO_MODS, FIRST);
    controller.pointerMove(110, 100, 1, NO_MODS, FIRST);
    expect(panStart).toHaveBeenCalledTimes(1);
    expect(panEnd).not.toHaveBeenCalled();

    controller.pointerDown(140, 100, 1, NO_MODS, SECOND);

    // The card is put down where it got to, not left stuck to a finger
    // whose gesture has become something else.
    expect(panEnd).toHaveBeenCalledTimes(1);
  });

  it('suppresses the Click the first contact would have produced', () => {
    const { h, box, controller } = setup();
    const click = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.Click, click);

    controller.pointerDown(80, 100, 1, NO_MODS, FIRST);
    controller.pointerDown(120, 100, 1, NO_MODS, SECOND);
    controller.pointerUp(120, 100, 0, NO_MODS, SECOND);
    controller.pointerUp(80, 100, 0, NO_MODS, FIRST);

    expect(click).not.toHaveBeenCalled();
  });

  it('ends the pinch with the first contact to leave', () => {
    const { h, box, controller } = setup();
    const events = record(h, box);

    controller.pointerDown(80, 100, 1, NO_MODS, FIRST);
    controller.pointerDown(120, 100, 1, NO_MODS, SECOND);
    controller.pointerMove(60, 100, 1, NO_MODS, FIRST);
    controller.pointerUp(120, 100, 0, NO_MODS, SECOND);

    expect(events.at(-1)!.type).toBe(UiEventType.PinchEnd);
    // The finger still down does not start a second pinch on its own.
    controller.pointerMove(40, 100, 1, NO_MODS, FIRST);
    expect(events.at(-1)!.type).toBe(UiEventType.PinchEnd);
  });

  it('ignores a third contact rather than treating it as a new pinch', () => {
    const { h, box, controller } = setup();
    const events = record(h, box);

    controller.pointerDown(80, 100, 1, NO_MODS, FIRST);
    controller.pointerDown(120, 100, 1, NO_MODS, SECOND);
    controller.pointerDown(160, 100, 1, NO_MODS, THIRD);
    controller.pointerMove(60, 100, 1, NO_MODS, FIRST);

    expect(events.map(event => event.type)).toEqual([UiEventType.PinchStart]);
    // Measured between the first two contacts, not the third.
    expect(events[0].scale).toBeCloseTo(1.5, 5);
  });

  it('leaves the press with the contact that started it', () => {
    const { h, box, controller } = setup();
    const moves: number[] = [];
    h.dispatcher.addEventListener(box, UiEventType.PointerMove, event => moves.push((event as UiPointerEvent).x));

    controller.pointerDown(80, 100, 1, NO_MODS, FIRST);
    controller.pointerDown(120, 100, 1, NO_MODS, SECOND);
    controller.pointerMove(130, 100, 1, NO_MODS, SECOND);

    // The rule `decisions/0041` §5 established is unchanged: the second
    // contact's moves are not routed to the pressed node.
    expect(moves).toEqual([]);
    expect(controller.pressedNode).toBe(box);
  });
});
