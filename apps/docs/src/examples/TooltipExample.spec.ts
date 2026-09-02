import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UiNode } from '@gesso/core';
import { createComponent, OverlayService } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Actions } from './TooltipExample';

const SIZE = { width: 420, height: 260 };

function mount() {
  const ui = renderTest(createComponent(Actions, {}), SIZE);
  const at = (node: UiNode): { x: number; y: number } => {
    const box = ui.getLayout(node);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  return {
    ...ui,
    /** What the overlay layer is holding, which is what a tooltip is. */
    entries: () => ui.runtime.services.get(OverlayService).entries.value,
    /** The text of the tooltip that is up, or nothing. */
    shown: (): string | undefined => {
      const node = ui.queryByRole('tooltip');
      return node === null ? undefined : ui.getSemantics(node).label;
    },
    at,
    /** Puts the pointer in the middle of a node, through the hit tester. */
    hover: (node: UiNode) => {
      const point = at(node);
      ui.fireEvent.pointerMove(point.x, point.y);
    },
    away: () => ui.fireEvent.pointerMove(SIZE.width - 1, SIZE.height - 1)
  };
}

/**
 * The page claims that a tooltip opens on a hover after its delay and
 * not before, that focus opens one at once so a keyboard reaches it,
 * that it never takes focus, and that the modifier and the component
 * open the same box. Each is a test, and the pointer goes through the
 * hit tester rather than at the handler, because a tooltip that only
 * answers a synthesized event is a tooltip nobody can open.
 */
describe('the docs tooltip example', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens after the default delay of 400ms, and not before it', () => {
    const ui = mount();
    ui.hover(ui.getByLabel('Save'));

    vi.advanceTimersByTime(399);
    expect(ui.entries()).toHaveLength(0);

    vi.advanceTimersByTime(1);
    ui.frame();
    expect(ui.shown()).toBe('Writes the note to the server');
  });

  it('cancels a pending tooltip when the pointer leaves before it opens', () => {
    const ui = mount();
    ui.hover(ui.getByLabel('Save'));
    vi.advanceTimersByTime(200);

    ui.away();
    vi.advanceTimersByTime(400);
    ui.frame();

    expect(ui.entries()).toHaveLength(0);
  });

  it('opens with no pause at all when the delay is zero', () => {
    const ui = mount();
    ui.hover(ui.getByLabel('Delete'));

    vi.advanceTimersByTime(1);
    ui.frame();

    expect(ui.shown()).toBe('Permanent: there is no undo');
    // The placement is the entry's, so the engine is what puts it
    // beside the anchor and flips it at the edge of the viewport.
    expect(ui.entries()[0]?.placement).toBe('right');
  });

  it('anchors to the element the modifier is on, and adds no node to the tree', () => {
    const ui = mount();
    const archive = ui.getByLabel('Archive');
    ui.hover(archive);
    vi.advanceTimersByTime(400);
    ui.frame();

    expect(ui.entries()[0]?.anchor).toBe(archive);
    expect(ui.entries()[0]?.placement).toBe('bottom');
    // The button is the anchor, so it has no wrapper of its own: it
    // sits in the same row as the two buttons with no tooltip.
    expect(archive.parent).toBe(ui.getByLabel('Save').parent);
  });

  it('opens on focus and closes on blur, so a keyboard reaches it', () => {
    const ui = mount();
    const save = ui.getByLabel('Save');

    ui.fireEvent.focus(save);
    ui.frame();
    expect(ui.shown()).toBe('Writes the note to the server');

    ui.fireEvent.blur();
    ui.frame();
    expect(ui.entries()).toHaveLength(0);
  });

  it('is never itself a tab stop', () => {
    const ui = mount();

    ui.fireEvent.focus(ui.getByLabel('Save'));
    ui.frame();
    // The tooltip is up and the button still holds the keyboard.
    expect(ui.entries()).toHaveLength(1);
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByLabel('Save'));

    ui.fireEvent.tab();
    ui.frame();

    // Tab went to the next button rather than into the tooltip.
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByLabel('Archive'));
  });

  it('closes on a press, and a focusable trigger opens it again with the focus', () => {
    const ui = mount();
    const badge = ui.getByText('Read only');
    ui.hover(badge);
    vi.advanceTimersByTime(400);
    ui.frame();
    expect(ui.shown()).toBe('Everything on this note is read only');

    // The badge takes no focus, so the press is the end of it.
    const onBadge = ui.at(badge);
    ui.fireEvent.pointerDown(onBadge.x, onBadge.y);
    ui.frame();
    expect(ui.entries()).toHaveLength(0);
    ui.fireEvent.pointerUp(onBadge.x, onBadge.y);

    const save = ui.getByLabel('Save');
    ui.hover(save);
    vi.advanceTimersByTime(400);
    ui.frame();
    const onSave = ui.at(save);
    ui.fireEvent.pointerDown(onSave.x, onSave.y);
    ui.frame();

    // The press closed it and the focus that follows a press on a
    // button opened it again, so it stays up while the button holds
    // the keyboard.
    expect(ui.runtime.input.focus.focusedNode).toBe(save);
    expect(ui.shown()).toBe('Writes the note to the server');
  });

  it('opens the same box from the component that wraps its child', () => {
    const ui = mount();
    ui.hover(ui.getByText('Read only'));

    vi.advanceTimersByTime(400);
    ui.frame();

    expect(ui.shown()).toBe('Everything on this note is read only');
    expect(ui.entries()[0]?.placement).toBe('bottom');
  });

  it('says what it is, and is never hit by the pointer it followed', () => {
    const ui = mount();
    ui.hover(ui.getByLabel('Save'));
    vi.advanceTimersByTime(400);
    ui.frame();

    const tip = ui.getByRole('tooltip');
    expect(tip).toHaveSemantics({ role: 'tooltip', name: 'Writes the note to the server' });
    expect(tip.getProperty('pointerEvents')).toBe('none');
  });
});
