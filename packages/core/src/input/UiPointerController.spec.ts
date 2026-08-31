import { describe, expect, it, vi } from 'vitest';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { UiEventType, type UiPointerDevice, type UiPointerEvent } from './UiInputEvent';
import { InputTestHarness } from './UiInputTestUtils';
import type { UiPointerController } from './UiPointerController';

/**
 * A 300x100 row holding two 100x100 boxes at (0,0) and (100,0),
 * inside the 400x400 app root. Points of interest:
 *   (50,50)   -> box a
 *   (150,50)  -> box b
 *   (350,50)  -> app root (empty area)
 *   (500,50)  -> empty space (outside everything)
 */
function setupRow(): {
  h: InputTestHarness;
  row: UiNode;
  a: UiNode;
  b: UiNode;
  app: UiNode;
  controller: UiPointerController;
} {
  const h = new InputTestHarness();
  const row = h.node('row', UiNodeType.Row, { width: 300, height: 100 });
  const a = h.node('a', UiNodeType.Box, { width: 100, height: 100 });
  const b = h.node('b', UiNodeType.Box, { width: 100, height: 100 });
  h.add(h.root, row);
  h.add(row, a, b);
  h.layoutTree();
  return { h, row, a, b, app: h.root, controller: h.createPointerController() };
}

describe('UiPointerController', () => {
  it('routes pointerdown to the deepest node under the point and bubbles', () => {
    const { h, row, a, controller } = setupRow();
    const target = vi.fn();
    const ancestor = vi.fn();
    h.dispatcher.addEventListener(a, UiEventType.PointerDown, target);
    h.dispatcher.addEventListener(row, UiEventType.PointerDown, ancestor);

    const event = controller.pointerDown(50, 50);

    expect(event.type).toBe(UiEventType.PointerDown);
    expect(event.x).toBe(50);
    expect(event.y).toBe(50);
    expect(target).toHaveBeenCalledTimes(1);
    expect(ancestor).toHaveBeenCalledTimes(1);
  });

  it('dispatches PointerDown and Click on a clean press-release', () => {
    const { h, a, controller } = setupRow();
    const down = vi.fn();
    const up = vi.fn();
    const click = vi.fn();
    h.dispatcher.addEventListener(a, UiEventType.PointerDown, down);
    h.dispatcher.addEventListener(a, UiEventType.PointerUp, up);
    h.dispatcher.addEventListener(a, UiEventType.Click, click);

    controller.pointerDown(50, 50);
    controller.pointerUp(50, 50);

    expect(down).toHaveBeenCalledTimes(1);
    expect(up).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(controller.pressedNode).toBeNull();
  });

  it('does not synthesize a Click when the press travels beyond the slop', () => {
    const { h, a, controller } = setupRow();
    const click = vi.fn();
    h.dispatcher.addEventListener(a, UiEventType.Click, click);

    controller.pointerDown(50, 50);
    controller.pointerMove(60, 50);
    controller.pointerUp(60, 50);

    expect(click).not.toHaveBeenCalled();
  });

  it('does not synthesize a Click when pointerdown was defaultPrevented', () => {
    const { h, a, controller } = setupRow();
    const click = vi.fn();
    h.dispatcher.addEventListener(a, UiEventType.Click, click);
    h.dispatcher.addEventListener(a, UiEventType.PointerDown, event => event.preventDefault());

    controller.pointerDown(50, 50);
    controller.pointerUp(50, 50);

    expect(click).not.toHaveBeenCalled();
  });

  it('dispatches PointerCancel and suppresses Click afterwards', () => {
    const { h, a, controller } = setupRow();
    const cancel = vi.fn();
    const click = vi.fn();
    h.dispatcher.addEventListener(a, UiEventType.PointerCancel, cancel);
    h.dispatcher.addEventListener(a, UiEventType.Click, click);

    controller.pointerDown(50, 50);
    controller.pointerCancel();
    controller.pointerUp(50, 50);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
  });

  it('captures move and up to the node the press started on', () => {
    const { h, a, b, controller } = setupRow();
    const movedOnA = vi.fn();
    const movedOnB = vi.fn();
    const click = vi.fn();
    h.dispatcher.addEventListener(a, UiEventType.PointerMove, movedOnA);
    h.dispatcher.addEventListener(b, UiEventType.PointerMove, movedOnB);
    h.dispatcher.addEventListener(a, UiEventType.Click, click);

    controller.pointerDown(50, 50);
    controller.pointerMove(150, 50);
    controller.pointerUp(150, 50);

    expect(movedOnA).toHaveBeenCalledTimes(1);
    expect(movedOnB).not.toHaveBeenCalled();
    expect(controller.hoveredNode).toBe(a);
    // 100px of travel: beyond the slop, so no click.
    expect(click).not.toHaveBeenCalled();
  });

  it('tracks hover and fires enter/leave when the hovered node changes', () => {
    const { h, a, b, controller } = setupRow();
    const leaveA = vi.fn();
    const enterB = vi.fn();
    h.dispatcher.addEventListener(a, UiEventType.PointerLeave, leaveA);
    h.dispatcher.addEventListener(b, UiEventType.PointerEnter, enterB);

    controller.pointerMove(50, 50);
    expect(controller.hoveredNode).toBe(a);
    expect(leaveA).not.toHaveBeenCalled();
    expect(enterB).not.toHaveBeenCalled();

    controller.pointerMove(150, 50);
    expect(controller.hoveredNode).toBe(b);
    expect(leaveA).toHaveBeenCalledTimes(1);
    expect(enterB).toHaveBeenCalledTimes(1);
  });

  it('does not re-enter the shared ancestor when moving between siblings', () => {
    const { h, row, controller } = setupRow();
    const enterRow = vi.fn();
    h.dispatcher.addEventListener(row, UiEventType.PointerEnter, enterRow);

    controller.pointerMove(50, 50); // enters a, row, app
    controller.pointerMove(150, 50); // enters b only
    controller.pointerMove(50, 50); // enters a only

    expect(enterRow).toHaveBeenCalledTimes(1);
  });

  it('leaves every ancestor when the pointer moves to empty space', () => {
    const { h, a, row, app, controller } = setupRow();
    const leaves: string[] = [];
    for (const node of [a, row, app]) {
      h.dispatcher.addEventListener(node, UiEventType.PointerLeave, event => {
        leaves.push(event.currentTarget!.id);
      });
    }

    controller.pointerMove(50, 50);
    expect(controller.pointerMove(500, 50)).toBeNull();

    expect(leaves).toEqual(['a', 'row', 'app']);
    expect(controller.hoveredNode).toBeNull();
  });

  it('dispatches PointerMove to the hovered node with coordinates', () => {
    const { h, a, controller } = setupRow();
    const move = vi.fn();
    h.dispatcher.addEventListener(a, UiEventType.PointerMove, move);

    controller.pointerMove(50, 50);
    controller.pointerMove(50, 50);

    expect(move).toHaveBeenCalledTimes(2);
    expect(move.mock.calls[0][0].x).toBe(50);
    expect(move.mock.calls[0][0].y).toBe(50);
  });

  it('returns null when a move lands on empty space', () => {
    const { controller } = setupRow();
    expect(controller.pointerMove(500, 500)).toBeNull();
  });

  it('establishes hover and press on pointerdown without a preceding move', () => {
    const { h, a, controller } = setupRow();
    const enter = vi.fn();
    const click = vi.fn();
    h.dispatcher.addEventListener(a, UiEventType.PointerEnter, enter);
    h.dispatcher.addEventListener(a, UiEventType.Click, click);

    controller.pointerDown(50, 50);
    controller.pointerUp(50, 50);

    expect(enter).toHaveBeenCalledTimes(1);
    expect(controller.pressedNode).toBeNull();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('returns null from pointerUp when nothing was pressed', () => {
    const { controller } = setupRow();
    expect(controller.pointerUp(0, 0)).toBeNull();
  });

  it('ignores a second pointerdown while already pressing', () => {
    const { h, b, controller } = setupRow();
    const downB = vi.fn();
    const clickB = vi.fn();
    h.dispatcher.addEventListener(b, UiEventType.PointerDown, downB);
    h.dispatcher.addEventListener(b, UiEventType.Click, clickB);

    controller.pointerDown(50, 50);
    const second = controller.pointerDown(150, 50);
    controller.pointerUp(50, 50);

    expect(second.target).toBeNull();
    expect(downB).not.toHaveBeenCalled();
    expect(clickB).not.toHaveBeenCalled();
    expect(controller.pressedNode).toBeNull();
  });

  it('propagates buttons and modifiers onto dispatched events', () => {
    const { h, a, controller } = setupRow();
    const seen: { buttons: number; ctrl: boolean }[] = [];
    h.dispatcher.addEventListener(a, UiEventType.PointerDown, event => {
      const pointerEvent = event as UiPointerEvent;
      seen.push({ buttons: pointerEvent.buttons, ctrl: pointerEvent.modifiers.ctrl });
    });

    controller.pointerDown(50, 50, 2, { ctrl: true, shift: false, alt: false, meta: false });

    expect(seen).toEqual([{ buttons: 2, ctrl: true }]);
  });

  it('pointerDown over empty space dispatches nothing and tracks no press', () => {
    const { h, app, controller } = setupRow();
    const down = vi.fn();
    h.dispatcher.addEventListener(app, UiEventType.PointerDown, down);

    controller.pointerDown(500, 50);

    expect(down).not.toHaveBeenCalled();
    expect(controller.pressedNode).toBeNull();
    expect(controller.pointerUp(500, 50)).toBeNull();
  });

  describe('touch', () => {
    const finger = (id = 10): UiPointerDevice => ({ id, kind: 'touch' });
    const noMods = { ctrl: false, shift: false, alt: false, meta: false };

    it('carries the device onto every dispatched event', () => {
      const { h, a, controller } = setupRow();
      const kinds: string[] = [];
      for (const type of [UiEventType.PointerDown, UiEventType.PointerUp, UiEventType.Click]) {
        h.dispatcher.addEventListener(a, type, event => kinds.push((event as UiPointerEvent).pointer.kind));
      }

      controller.pointerDown(50, 50, 1, noMods, finger());
      controller.pointerUp(50, 50, 0, noMods, finger());

      expect(kinds).toEqual(['touch', 'touch', 'touch']);
    });

    it('defaults to a mouse when no device is named', () => {
      const { h, a, controller } = setupRow();
      const kinds: string[] = [];
      h.dispatcher.addEventListener(a, UiEventType.PointerDown, event =>
        kinds.push((event as UiPointerEvent).pointer.kind)
      );

      controller.pointerDown(50, 50);

      expect(kinds).toEqual(['mouse']);
    });

    it('drops hover when the finger lifts, and keeps it when a mouse does', () => {
      const { h, a, controller } = setupRow();
      const leave = vi.fn();
      h.dispatcher.addEventListener(a, UiEventType.PointerLeave, leave);

      controller.pointerDown(50, 50, 1, noMods, finger());
      expect(controller.hoveredNode).toBe(a);
      controller.pointerUp(50, 50, 0, noMods, finger());

      expect(controller.hoveredNode).toBeNull();
      expect(leave).toHaveBeenCalledTimes(1);

      controller.pointerDown(50, 50);
      controller.pointerUp(50, 50);
      expect(controller.hoveredNode).toBe(a);
    });

    it('drops hover when a touch press is cancelled', () => {
      const { controller } = setupRow();

      controller.pointerDown(50, 50, 1, noMods, finger());
      controller.pointerCancel(finger());

      expect(controller.hoveredNode).toBeNull();
    });

    it('clicks a tap that wandered further than a mouse would be allowed', () => {
      const { h, a, controller } = setupRow();
      const click = vi.fn();
      h.dispatcher.addEventListener(a, UiEventType.Click, click);

      controller.pointerDown(50, 50, 1, noMods, finger());
      controller.pointerMove(56, 57, 1, noMods, finger());
      controller.pointerUp(56, 57, 0, noMods, finger());

      expect(click).toHaveBeenCalledTimes(1);
    });

    it('still refuses a click for a tap that travelled beyond the touch slop', () => {
      const { h, a, controller } = setupRow();
      const click = vi.fn();
      h.dispatcher.addEventListener(a, UiEventType.Click, click);

      controller.pointerDown(50, 50, 1, noMods, finger());
      controller.pointerUp(75, 50, 0, noMods, finger());

      expect(click).not.toHaveBeenCalled();
    });

    it('ignores a second contact while the first one holds the press', () => {
      const { h, a, b, controller } = setupRow();
      const moveOnA = vi.fn();
      const upOnA = vi.fn();
      h.dispatcher.addEventListener(a, UiEventType.PointerMove, moveOnA);
      h.dispatcher.addEventListener(a, UiEventType.PointerUp, upOnA);
      const downOnB = vi.fn();
      h.dispatcher.addEventListener(b, UiEventType.PointerDown, downOnB);

      controller.pointerDown(50, 50, 1, noMods, finger(1));
      // A second finger lands on the other box and drags away.
      controller.pointerDown(150, 50, 1, noMods, finger(2));
      controller.pointerMove(160, 60, 1, noMods, finger(2));
      controller.pointerUp(160, 60, 0, noMods, finger(2));

      expect(downOnB).not.toHaveBeenCalled();
      expect(moveOnA).not.toHaveBeenCalled();
      expect(upOnA).not.toHaveBeenCalled();
      expect(controller.pressedNode).toBe(a);

      controller.pointerMove(55, 55, 1, noMods, finger(1));
      expect(moveOnA).toHaveBeenCalledTimes(1);
    });
  });
});
