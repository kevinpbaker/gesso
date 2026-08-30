import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { UiEventType } from './UiInputEvent';
import { InputTestHarness } from './UiInputTestUtils';
import { UiGestureRecognizer } from './UiGestureRecognizer';
import { UiPointerController } from './UiPointerController';

/**
 * A 100x100 box at (0,0) inside the 400x400 app root. All press
 * points used here land on `box`; the recognizer is wired into the
 * pointer controller with a 8px slop and 500ms hold time.
 */
function setup(): { h: InputTestHarness; box: UiNode; controller: UiPointerController } {
  const h = new InputTestHarness();
  const box = h.node('box', UiNodeType.Box, { width: 100, height: 100 });
  h.add(h.root, box);
  h.layoutTree();
  const gestures = new UiGestureRecognizer(h.dispatcher);
  const controller = new UiPointerController(h.createHitTester(), h.dispatcher, { gestures });
  return { h, box, controller };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('UiGestureRecognizer', () => {
  it('fires LongPress when the press holds still past the delay', () => {
    vi.useFakeTimers();
    const { h, box, controller } = setup();
    const longPress = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.LongPress, longPress);

    controller.pointerDown(50, 50);
    vi.advanceTimersByTime(499);
    expect(longPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(longPress).toHaveBeenCalledTimes(1);

    controller.pointerUp(50, 50);
  });

  it('does not fire LongPress when the press moves beyond the slop', () => {
    vi.useFakeTimers();
    const { h, box, controller } = setup();
    const longPress = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.LongPress, longPress);

    controller.pointerDown(50, 50);
    controller.pointerMove(62, 50); // 12px > 8px slop
    vi.advanceTimersByTime(500);

    expect(longPress).not.toHaveBeenCalled();
    controller.pointerUp(62, 50);
  });

  it('does not fire LongPress on a quick release', () => {
    vi.useFakeTimers();
    const { h, box, controller } = setup();
    const longPress = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.LongPress, longPress);

    controller.pointerDown(50, 50);
    controller.pointerUp(50, 50);
    vi.advanceTimersByTime(500);

    expect(longPress).not.toHaveBeenCalled();
  });

  it('fires LongPress once per press', () => {
    vi.useFakeTimers();
    const { h, box, controller } = setup();
    const longPress = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.LongPress, longPress);

    controller.pointerDown(50, 50);
    vi.advanceTimersByTime(500);
    vi.advanceTimersByTime(500);
    expect(longPress).toHaveBeenCalledTimes(1);

    controller.pointerUp(50, 50);
  });

  it('claims a Pan when movement crosses the slop', () => {
    const { h, box, controller } = setup();
    const panStart = vi.fn();
    const panMove = vi.fn();
    const panEnd = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.PanStart, panStart);
    h.dispatcher.addEventListener(box, UiEventType.PanMove, panMove);
    h.dispatcher.addEventListener(box, UiEventType.PanEnd, panEnd);

    controller.pointerDown(50, 50);
    controller.pointerMove(59, 50); // 9px > 8px slop: claims pan
    controller.pointerMove(80, 50);
    controller.pointerUp(80, 50);

    expect(panStart).toHaveBeenCalledTimes(1);
    expect(panMove).toHaveBeenCalledTimes(2);
    expect(panEnd).toHaveBeenCalledTimes(1);
  });

  it('does not claim a Pan within the slop and still allows LongPress', () => {
    vi.useFakeTimers();
    const { h, box, controller } = setup();
    const panStart = vi.fn();
    const longPress = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.PanStart, panStart);
    h.dispatcher.addEventListener(box, UiEventType.LongPress, longPress);

    controller.pointerDown(50, 50);
    controller.pointerMove(55, 50); // 5px <= slop
    vi.advanceTimersByTime(500);

    expect(panStart).not.toHaveBeenCalled();
    expect(longPress).toHaveBeenCalledTimes(1);
    controller.pointerUp(55, 50);
  });

  it('does not claim a Pan when the move was defaultPrevented', () => {
    const { h, box, controller } = setup();
    const panStart = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.PanStart, panStart);
    h.dispatcher.addEventListener(box, UiEventType.PointerMove, event => event.preventDefault());

    controller.pointerDown(50, 50);
    controller.pointerMove(90, 50);
    controller.pointerUp(90, 50);

    expect(panStart).not.toHaveBeenCalled();
  });

  it('claims a Drag after a LongPress once the pointer moves', () => {
    vi.useFakeTimers();
    const { h, box, controller } = setup();
    const dragStart = vi.fn();
    const dragMove = vi.fn();
    const dragEnd = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.DragStart, dragStart);
    h.dispatcher.addEventListener(box, UiEventType.DragMove, dragMove);
    h.dispatcher.addEventListener(box, UiEventType.DragEnd, dragEnd);

    controller.pointerDown(50, 50);
    vi.advanceTimersByTime(500); // LongPress
    controller.pointerMove(60, 50); // claims drag
    controller.pointerMove(90, 50);
    controller.pointerUp(90, 50);

    expect(dragStart).toHaveBeenCalledTimes(1);
    expect(dragMove).toHaveBeenCalledTimes(2);
    expect(dragEnd).toHaveBeenCalledTimes(1);
  });

  it('does not claim a Drag on release without movement after LongPress', () => {
    vi.useFakeTimers();
    const { h, box, controller } = setup();
    const dragStart = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.DragStart, dragStart);

    controller.pointerDown(50, 50);
    vi.advanceTimersByTime(500);
    controller.pointerUp(50, 50);

    expect(dragStart).not.toHaveBeenCalled();
  });

  it('suppresses Click when a gesture claimed the press', () => {
    vi.useFakeTimers();
    const { h, box, controller } = setup();
    const click = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.Click, click);

    controller.pointerDown(50, 50);
    vi.advanceTimersByTime(500); // LongPress
    controller.pointerUp(50, 50);

    expect(click).not.toHaveBeenCalled();
  });

  it('does not suppress Click for a plain tap', () => {
    const { h, box, controller } = setup();
    const click = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.Click, click);

    controller.pointerDown(50, 50);
    controller.pointerUp(50, 50);

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('aborts without end events on pointerCancel', () => {
    const { h, box, controller } = setup();
    const panStart = vi.fn();
    const panEnd = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.PanStart, panStart);
    h.dispatcher.addEventListener(box, UiEventType.PanEnd, panEnd);

    controller.pointerDown(50, 50);
    controller.pointerMove(60, 50); // claims pan
    controller.pointerCancel();

    expect(panStart).toHaveBeenCalledTimes(1);
    expect(panEnd).not.toHaveBeenCalled();
  });

  it('routes gesture events to the press target even over other nodes', () => {
    const { h, box, controller } = setup();
    const panOnBox = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.PanMove, panOnBox);

    // 100x100 box only; extend the probe: press on the box, drag to
    // (400,400) — outside any box but still captured to the box.
    controller.pointerDown(50, 50);
    controller.pointerMove(300, 300);
    controller.pointerUp(300, 300);

    expect(panOnBox).toHaveBeenCalledTimes(1);
  });

  it('carries coordinates on gesture events', () => {
    const { h, box, controller } = setup();
    const seen: { x: number; y: number }[] = [];
    h.dispatcher.addEventListener(box, UiEventType.PanMove, event => {
      const pointerEvent = event as import('./UiInputEvent').UiPointerEvent;
      seen.push({ x: pointerEvent.x, y: pointerEvent.y });
    });

    controller.pointerDown(50, 50);
    controller.pointerMove(90, 70);
    controller.pointerUp(90, 70);

    expect(seen[0]).toEqual({ x: 90, y: 70 });
  });

  it('resets recognition between presses', () => {
    vi.useFakeTimers();
    const { h, box, controller } = setup();
    const panStart = vi.fn();
    h.dispatcher.addEventListener(box, UiEventType.PanStart, panStart);

    // First press: pan claims after movement.
    controller.pointerDown(50, 50);
    controller.pointerMove(70, 50);
    controller.pointerUp(70, 50);
    expect(panStart).toHaveBeenCalledTimes(1);

    // Second press: a clean tap must not be a stale drag/pan.
    controller.pointerDown(50, 50);
    controller.pointerUp(50, 50);
    expect(panStart).toHaveBeenCalledTimes(1);
    expect(controller.pressedNode).toBeNull();
  });
});
