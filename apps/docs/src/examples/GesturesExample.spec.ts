import { afterEach, describe, expect, it, vi } from 'vitest';

import { noKeyModifiers, type LayoutBox, type UiNode, type UiPointerDevice } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { GestureSurface } from './GesturesExample';

const SIZE = { width: 480, height: 400 };
const FINGER: UiPointerDevice = { id: 7, kind: 'touch' };

function surface(): Rendered {
  return renderTest(createComponent(GestureSurface, {}), SIZE);
}

/** The middle of a node's box, in the coordinates a pointer arrives in. */
function centreOf(ui: Rendered, node: UiNode): { x: number; y: number } {
  const box: LayoutBox = ui.getLayout(node);
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/** What one of the readout lines currently says. */
function readout(ui: Rendered, prefix: RegExp): string {
  return String(ui.getByText(prefix).getProperty('text'));
}

/** A press, a move and a release from a finger rather than a mouse. */
function fingerDrag(ui: Rendered, from: { x: number; y: number }, dx: number, dy: number): void {
  ui.runtime.input.pointer.pointerDown(from.x, from.y, 1, noKeyModifiers(), FINGER);
  ui.runtime.input.pointer.pointerMove(from.x + dx, from.y + dy, 1, noKeyModifiers(), FINGER);
  ui.frame();
}

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The page's claim, measured: one press resolves to at most one
 * gesture, a press-and-move is a Pan and a Drag is a long press
 * followed by a move, and a scroll container answers to a finger's pan
 * and to no mouse.
 *
 * Everything here goes in through the pointer controller at a
 * coordinate, so the hit tester, the recognizer and the touch scroller
 * are all in the path. A test that dispatched a `DragMove` directly
 * would assert the arithmetic of a gesture the example never receives,
 * which is exactly the defect `decisions/0025-structure-tier.md`
 * records.
 */
describe('the docs touch and gestures example', () => {
  it('reads a press and a release with no movement as a tap', () => {
    const ui = surface();
    const point = centreOf(ui, ui.getByText('Tap, drag, or hold me'));

    ui.fireEvent.pointerDown(point.x, point.y);
    ui.fireEvent.pointerUp(point.x, point.y);
    ui.frame();

    expect(readout(ui, /^that press was /)).toBe('that press was a tap: a Click, and no gesture');
  });

  it('reads a press that moves before the hold time as a pan', () => {
    const ui = surface();
    const point = centreOf(ui, ui.getByText('Tap, drag, or hold me'));

    // Twenty pixels, which is past the mouse slop of eight.
    ui.fireEvent.pointerDown(point.x, point.y);
    ui.fireEvent.pointerMove(point.x + 20, point.y);
    ui.fireEvent.pointerUp(point.x + 20, point.y);
    ui.frame();

    // A gesture claimed the press, so no Click was synthesized: the
    // readout still names the pan rather than being overwritten by a
    // tap on release.
    expect(readout(ui, /^that press was /)).toBe('that press was a pan: it moved before the hold time');
  });

  it('reads a hold as a long press, and a move after it as a drag', () => {
    vi.useFakeTimers();
    const ui = surface();
    const point = centreOf(ui, ui.getByText('Tap, drag, or hold me'));

    ui.fireEvent.pointerDown(point.x, point.y);
    vi.advanceTimersByTime(500);
    ui.frame();
    expect(readout(ui, /^that press was /)).toBe('that press was a long press: it held still for 500 ms');

    ui.fireEvent.pointerMove(point.x + 20, point.y);
    ui.fireEvent.pointerUp(point.x + 20, point.y);
    ui.frame();
    expect(readout(ui, /^that press was /)).toBe('that press was a drag: a long press, then a move');
  });

  it('moves the pan tile on a press and a move, and leaves the hold tile alone', () => {
    const ui = surface();
    const tile = centreOf(ui, ui.getByText('Pan me'));

    ui.fireEvent.pointerDown(tile.x, tile.y);
    ui.fireEvent.pointerMove(tile.x + 30, tile.y + 12);
    ui.frame();
    expect(readout(ui, /^pan tile at /)).toBe('pan tile at 30, 12');

    ui.fireEvent.pointerUp(tile.x + 30, tile.y + 12);
    ui.frame();

    // The same press on the tile that waits for a long press: it hears
    // a Pan, which is not the gesture it is listening for.
    const hold = centreOf(ui, ui.getByText('Hold, then drag'));
    ui.fireEvent.pointerDown(hold.x, hold.y);
    ui.fireEvent.pointerMove(hold.x + 30, hold.y);
    ui.fireEvent.pointerUp(hold.x + 30, hold.y);
    ui.frame();
    expect(readout(ui, /^hold tile at /)).toBe('hold tile at 0, 0');
  });

  it('writes the movement as a transform and takes it away on the way back', () => {
    const ui = surface();
    const node = ui.getByText('Pan me').parent as UiNode;
    const tile = centreOf(ui, node);

    ui.fireEvent.pointerDown(tile.x, tile.y);
    ui.fireEvent.pointerMove(tile.x + 24, tile.y);
    ui.frame();
    expect(node.getProperty('transform')).toMatchObject({ translateX: 24, translateY: 0 });

    // Back where it started: the override is dropped rather than
    // written as an identity translation, so a tile that was dragged
    // and put back is a tile with no transform at all.
    ui.fireEvent.pointerMove(tile.x, tile.y);
    ui.fireEvent.pointerUp(tile.x, tile.y);
    ui.frame();
    expect(node.getProperty('transform') ?? null).toBeNull();
  });

  it('scrolls the list from a finger and not from the same drag with a mouse', () => {
    const ui = surface();
    const list = centreOf(ui, ui.getByRole('list', { name: 'Notes' }));

    // Dragging the content upwards scrolls downwards: the content
    // follows the finger.
    fingerDrag(ui, list, 0, -40);
    expect(readout(ui, /^list /)).toBe('list 40 px from the top');
    ui.runtime.input.pointer.pointerCancel(FINGER);

    const other = surface();
    other.fireEvent.pointerDown(list.x, list.y);
    other.fireEvent.pointerMove(list.x, list.y - 40);
    other.fireEvent.pointerUp(list.x, list.y - 40);
    other.frame();
    expect(readout(other, /^list /)).toBe('list 0 px from the top');
  });
});
