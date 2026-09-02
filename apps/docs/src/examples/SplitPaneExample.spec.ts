import { describe, expect, it } from 'vitest';

import { SplitPane } from '@gesso/components';
import { Box } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Panes } from './SplitPaneExample';

const SIZE = { width: 420, height: 300 };

function mount() {
  const ui = renderTest(createComponent(Panes, {}), SIZE);
  // The `measure` modifier reports the track's box after a frame, and
  // the pointer arithmetic is against that box.
  ui.frame();
  return ui;
}

/** Where the divider says it is, as the percentage it announces. */
function at(ui: Rendered): number | undefined {
  return ui.getSemantics(ui.getByRole('separator')).valueNow;
}

/**
 * The page claims the divider is a `separator` that reports its
 * position as a percentage, that the arrows move it by two points and
 * Home and End take it to its bounds, that a plain press and move
 * follows the pointer with no long press first, and that the fraction
 * rather than the content decides where the divider sits. Each is a
 * test.
 */
describe('the docs split pane example', () => {
  it('announces the divider as a separator with its bounds', () => {
    const ui = mount();

    expect(ui.getByRole('separator')).toHaveSemantics({ role: 'separator', name: 'Resize the list' });
    const record = ui.getSemantics(ui.getByRole('separator'));
    expect(record.valueNow).toBe(40);
    expect(record.valueMin).toBe(20);
    expect(record.valueMax).toBe(80);
    expect(record.states).toBeUndefined();
  });

  it('moves two points at a time with the arrows along the split', () => {
    const ui = mount();
    ui.fireEvent.focus(ui.getByRole('separator'));

    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(at(ui)).toBe(42);

    ui.fireEvent.keyDown('ArrowLeft');
    ui.fireEvent.keyDown('ArrowLeft');
    ui.frame();
    expect(at(ui)).toBe(38);
    expect(ui.getByText('The list takes 38% of the width')).toBeDefined();
  });

  it('answers Home and End with the bounds, and goes no further', () => {
    const ui = mount();
    ui.fireEvent.focus(ui.getByRole('separator'));

    ui.fireEvent.keyDown('End');
    ui.frame();
    expect(at(ui)).toBe(80);

    // Already at the maximum, so the arrow is consumed and nothing moves.
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(at(ui)).toBe(80);

    ui.fireEvent.keyDown('Home');
    ui.frame();
    expect(at(ui)).toBe(20);
    ui.fireEvent.keyDown('ArrowLeft');
    ui.frame();
    expect(at(ui)).toBe(20);
  });

  it('binds the arrows across the split as well, and moves by nothing', () => {
    const ui = mount();
    ui.fireEvent.focus(ui.getByRole('separator'));

    const event = ui.runtime.input.keyboard.keyDown('ArrowUp');
    ui.frame();

    // A key in the keymap is handled and consumed, so this one does
    // not reach a scroll container above. It just asks for the
    // position the divider is already at.
    expect(event.defaultPrevented).toBe(true);
    expect(at(ui)).toBe(40);
  });

  it('follows a plain press and move, with no long press first', () => {
    const ui = mount();
    const box = ui.getLayout(ui.getByRole('separator'));
    const y = box.y + box.height / 2;

    ui.fireEvent.pointerDown(box.x + box.width / 2, y);
    ui.fireEvent.pointerMove(box.x + box.width / 2 + 60, y, { buttons: 1 });
    ui.fireEvent.pointerUp(box.x + box.width / 2 + 60, y);
    ui.frame();

    // Nothing waited: no timer was advanced between the press and the
    // move, because a divider listens for a Pan and not for a Drag.
    const moved = at(ui);
    expect(moved).toBeGreaterThan(40);
    expect(moved).toBeLessThanOrEqual(80);
    expect(ui.getLayout(ui.getByRole('separator')).x).toBeGreaterThan(box.x);
  });

  it('turns a pointer inside the track into a fraction of it', () => {
    // No padding and no border, so the track is the full 400 and the
    // arithmetic on the page is checkable.
    const ui = renderTest(createComponent(SplitPane, { defaultSplit: 0.5, first: Box({}), second: Box({}) }), {
      width: 400,
      height: 200
    });
    ui.frame();

    ui.fireEvent.pan(ui.getByRole('separator'), 100, 10);
    ui.frame();

    expect(at(ui)).toBe(25);
  });

  it('puts the divider at the fraction, whatever the panes hold', () => {
    const ui = mount();
    const start = ui.getLayout(ui.getByRole('separator')).x;

    ui.fireEvent.focus(ui.getByRole('separator'));
    ui.fireEvent.keyDown('End');
    ui.frame();

    // The second pane holds a line of text wider than the fraction it
    // is left with. Both panes clip, so it shrinks and the divider
    // arrives where the fraction says.
    const end = ui.getLayout(ui.getByRole('separator')).x;
    expect(end - start).toBeGreaterThan(100);
    expect(at(ui)).toBe(80);
  });

  it('refuses both split and defaultSplit, naming itself', () => {
    expect(() =>
      renderTest(createComponent(SplitPane, { split: 0.5, defaultSplit: 0.5, first: Box({}), second: Box({}) }), SIZE)
    ).toThrow(/SplitPane/);
  });
});
