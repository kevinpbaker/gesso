import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createComponent, OverlayService, type ComponentContext } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import { Box, Button, Column, Text, type UiChild } from '@gesso/core';
import { Tooltip, tooltip } from './Tooltip';

/**
 * the `tooltip()` and the component it shares
 * its implementation with. The component had no spec of its own; it
 * has one now, because the two are one implementation and a change to
 * `tooltipContent` has to be caught in both.
 */
function mount(root: UiChild) {
  const ui = renderTest(root, { width: 400, height: 400 });
  return {
    ...ui,
    entries: () => ui.runtime.services.get(OverlayService).entries.value,
    /** Hovers the middle of a node, through the hit tester. */
    hover: (label: string) => {
      const box = ui.getLayout(ui.getByLabel(label));
      ui.fireEvent.pointerMove(box.x + box.width / 2, box.y + box.height / 2);
    },
    away: () => ui.fireEvent.pointerMove(399, 399)
  };
}

function Trigger(_props: Record<string, never>, ctx: ComponentContext): UiChild {
  return Button({ text: 'Save', label: 'Save', modifiers: [tooltip(ctx, { text: 'Saves the note' })] });
}

describe('the tooltip modifier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens after the delay and not before it', () => {
    const ui = mount(Column(createComponent(Trigger, {})));
    ui.hover('Save');

    vi.advanceTimersByTime(399);
    expect(ui.entries()).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(ui.entries()).toHaveLength(1);
  });

  it('closes when the pointer leaves', () => {
    const ui = mount(Column(createComponent(Trigger, {})));
    ui.hover('Save');
    vi.advanceTimersByTime(400);

    ui.away();

    expect(ui.entries()).toHaveLength(0);
  });

  it('cancels a pending tooltip when the pointer leaves before it opens', () => {
    const ui = mount(Column(createComponent(Trigger, {})));
    ui.hover('Save');
    vi.advanceTimersByTime(200);

    ui.away();
    vi.advanceTimersByTime(400);

    expect(ui.entries()).toHaveLength(0);
  });

  it('opens on focus, so a keyboard reaches it too', () => {
    const ui = mount(Column(createComponent(Trigger, {})));

    ui.fireEvent.focus(ui.getByLabel('Save'));

    expect(ui.entries()).toHaveLength(1);
    ui.fireEvent.blur();
    expect(ui.entries()).toHaveLength(0);
  });

  it('anchors to the element itself and adds no node to the tree', () => {
    function Plain(_props: Record<string, never>, _ctx: ComponentContext): UiChild {
      return Button({ text: 'Save', label: 'Save' });
    }
    const withTip = mount(Column(createComponent(Trigger, {})));
    const plain = mount(Column(createComponent(Plain, {})));

    expect(countNodes(withTip.runtime.debugRoot())).toBe(countNodes(plain.runtime.debugRoot()));

    withTip.hover('Save');
    vi.advanceTimersByTime(400);
    expect(withTip.entries()[0]?.anchor).toBe(withTip.getByLabel('Save'));
  });

  it('says nothing when there is nothing to say', () => {
    function Empty(_props: Record<string, never>, ctx: ComponentContext): UiChild {
      return Button({ text: 'Save', label: 'Save', modifiers: [tooltip(ctx, { text: '' })] });
    }
    const ui = mount(Column(createComponent(Empty, {})));

    ui.hover('Save');
    vi.advanceTimersByTime(400);

    expect(ui.entries()).toHaveLength(0);
  });

  it('closes with the component that opened it', () => {
    const ui = mount(Column(createComponent(Trigger, {})));
    ui.hover('Save');
    vi.advanceTimersByTime(400);
    expect(ui.entries()).toHaveLength(1);

    ui.unmount();

    expect(ui.entries()).toHaveLength(0);
  });
});

describe('the Tooltip component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the same tooltip from a wrapper', () => {
    const ui = mount(
      Column(
        createComponent(Tooltip, {
          text: 'Saves the note',
          children: Box({ label: 'Save note', width: 80, height: 24 }, Text({ text: 'Save' }))
        })
      )
    );

    ui.hover('Save note');
    vi.advanceTimersByTime(400);

    const entry = ui.entries()[0];
    expect(entry).toBeDefined();
    expect(entry?.placement).toBe('top');
  });
});

function countNodes(node: { firstChild: unknown; nextSibling: unknown }): number {
  let total = 1;
  for (
    let child = node.firstChild as typeof node | null;
    child !== null;
    child = child.nextSibling as typeof node | null
  ) {
    total += countNodes(child);
  }
  return total;
}
