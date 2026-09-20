import { describe, expect, it } from 'vitest';

import type { UiNode } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { MotionBoard } from './MotionExample';

/** The translation the FLIP writes, which is the transform's `translateY`. */
function offsetY(node: UiNode): number {
  const transform = node.properties.get('transform') as { translateY?: number } | undefined;
  return transform?.translateY ?? 0;
}

function heightOf(node: UiNode): number {
  return node.properties.get('height') as number;
}

/** Runs frames while anything is still asking for one, and counts them. */
function drain(ui: Rendered, limit = 400): number {
  let frames = 0;
  while (ui.clock.isPending && frames < limit) {
    frames++;
    ui.frame();
  }
  return frames;
}

const mount = () => renderTest(createComponent(MotionBoard, {}), { width: 640, height: 360 });

/**
 * The page's claim is that an animated property is not written once: it
 * is written on every frame between where it was and where it is going.
 * So the spec measures the frames in between, not the end state, which
 * a jump would reach just as well.
 */
describe('the docs motion example', () => {
  it('moves a transitioned property through values it was never told to take', () => {
    const ui = mount();
    const card = ui.getByText('A property that travels').parent!;
    const collapsed = heightOf(card);

    ui.fireEvent.click(ui.getByRole('button', { name: 'Open the card' }));
    // Two frames: an animation takes its start time from its first
    // tick rather than from the moment it was asked for, so the first
    // frame is time zero and the second is the first one that moved.
    ui.frame();
    ui.frame();

    // The card is neither where it was nor where it is going, which is
    // the whole difference from a jump.
    const midway = heightOf(card);
    expect(midway).toBeGreaterThan(collapsed);
    expect(midway).toBeLessThan(140);

    // And it takes more than a frame or two to arrive.
    expect(drain(ui)).toBeGreaterThan(4);
    expect(heightOf(card)).toBe(140);
  });

  it('fades the detail rather than switching it on', () => {
    const ui = mount();
    const detail = ui.getByText(/The height is a bound prop/);
    expect(detail.properties.get('opacity')).toBe(0);

    ui.fireEvent.click(ui.getByRole('button', { name: 'Open the card' }));
    ui.frame();
    ui.frame();

    const opacity = detail.properties.get('opacity') as number;
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);

    drain(ui);
    expect(detail.properties.get('opacity')).toBe(1);
  });

  it('draws a reordered row back where it was, then springs it home', () => {
    const ui = mount();
    const inbox = ui.getByText('Inbox').parent!;
    const top = ui.getLayout(inbox).y;

    ui.fireEvent.click(ui.getByRole('button', { name: 'Move the top row down' }));
    ui.frame();

    // Layout has already put the row at the bottom, and the modifier
    // has drawn it back up to where it was: the box moved, the pixels
    // have not yet.
    expect(ui.getLayout(inbox).y).toBeGreaterThan(top);
    expect(offsetY(inbox)).toBeLessThan(-10);

    // Home, with the override handed back rather than left at an
    // identity translation, so the node has no transform at all.
    expect(drain(ui)).toBeGreaterThan(4);
    expect(inbox.properties.has('transform')).toBe(false);
  });

  it('does not animate a row that did not change places', () => {
    const ui = mount();
    const inbox = ui.getByText('Inbox').parent!;

    // Opening the card grows a neighbour of the list, not the list, so
    // nothing here should move at all. A row that followed the layout
    // rather than absorbing it is the correct behaviour, and a row
    // held still while its surroundings grew is the bug it replaced.
    ui.fireEvent.click(ui.getByRole('button', { name: 'Open the card' }));
    ui.frame();
    expect(offsetY(inbox)).toBe(0);
    drain(ui);
    expect(offsetY(inbox)).toBe(0);
  });
});
