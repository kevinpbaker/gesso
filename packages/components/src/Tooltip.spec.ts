import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, map } from 'rxjs';

import { createComponent, OverlayService, type ComponentContext } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Box, Button, Column, Text, type UiChild } from 'gesso-core';
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

    ui.fireEvent.tab();

    expect(ui.entries()).toHaveLength(1);
    ui.fireEvent.blur();
    expect(ui.entries()).toHaveLength(0);
  });

  it('does not open when a press is what focused the element', () => {
    const ui = mount(Column(createComponent(Trigger, {})));

    ui.fireEvent.click(ui.getByLabel('Save'));
    vi.advanceTimersByTime(1000);

    expect(ui.entries()).toHaveLength(0);
  });

  it('closes when the element goes and the component that rendered it stays', () => {
    const running = new BehaviorSubject(false);
    function Swapping(_props: Record<string, never>, ctx: ComponentContext): UiChild {
      const runTip = tooltip(ctx, { text: 'Runs the query' });
      const cancelTip = tooltip(ctx, { text: 'Stops the query' });
      return Column(
        {},
        running.pipe(
          map(on => [
            on
              ? Button({ key: 'cancel', text: 'Cancel', label: 'Cancel', modifiers: [cancelTip] })
              : Button({ key: 'run', text: 'Run', label: 'Run', modifiers: [runTip] })
          ])
        )
      );
    }
    const ui = mount(Column(createComponent(Swapping, {})));
    running.next(true);
    ui.frame();
    ui.hover('Cancel');
    vi.advanceTimersByTime(400);
    expect(ui.entries()).toHaveLength(1);

    running.next(false);
    ui.frame();

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

  it('asks a function for its text each time it opens', async () => {
    let said = 'Undo typing';
    function Live(_props: Record<string, never>, ctx: ComponentContext): UiChild {
      return Button({ text: 'Undo', label: 'Undo', modifiers: [tooltip(ctx, { text: () => said })] });
    }
    // Real time, because what the tooltip draws is only on screen
    // after a frame, and a frame does not come under fake timers.
    vi.useRealTimers();
    const ui = mount(Column(createComponent(Live, {})));
    const rest = async () => {
      await new Promise(resolve => setTimeout(resolve, 450));
      await ui.settle();
    };

    ui.hover('Undo');
    await rest();
    expect(ui.queryByText('Undo typing')).not.toBeNull();

    ui.away();
    await ui.settle();
    said = 'Undo sort';
    ui.hover('Undo');
    await rest();
    expect(ui.queryByText('Undo sort')).not.toBeNull();
    expect(ui.queryByText('Undo typing')).toBeNull();
  });

  it('says nothing when a function has nothing to say', () => {
    function Quiet(_props: Record<string, never>, ctx: ComponentContext): UiChild {
      return Button({ text: 'Undo', label: 'Undo', modifiers: [tooltip(ctx, { text: () => '' })] });
    }
    const ui = mount(Column(createComponent(Quiet, {})));

    ui.hover('Undo');
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

  it('opens beside its element where a panned, zoomed parent draws it', () => {
    // A map card under a camera box that pans and zooms by transform:
    // the tooltip opened beside where the card would be at zoom 1 with
    // no pan, which on a map moved anywhere is nowhere near the card.
    function Card(_props: Record<string, never>, ctx: ComponentContext): UiChild {
      return Button({
        text: 'Epic',
        label: 'Epic',
        position: 'absolute',
        left: 20,
        top: 10,
        width: 30,
        height: 20,
        modifiers: [tooltip(ctx, { text: 'Opens the epic' })]
      });
    }
    const ui = mount(
      Box(
        { position: 'relative', overflow: 'hidden', width: 400, height: 400 },
        Box(
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: 400,
            height: 400,
            transform: { x: 0, y: 0, translateX: 150, translateY: 200, scaleX: 2, scaleY: 2, rotation: 0 }
          },
          createComponent(Card, {})
        )
      )
    );
    // Drawn at 150 + 2 * 20 across and 200 + 2 * 10 down, twice its size.
    const card = { x: 190, y: 220, width: 60, height: 40 };

    ui.fireEvent.pointerMove(card.x + card.width / 2, card.y + card.height / 2);
    vi.advanceTimersByTime(400);
    expect(ui.entries()).toHaveLength(1);
    ui.frame();

    const tip = ui.getVisibleBox(ui.getByText('Opens the epic'));
    // Above the card, as a tooltip opens, centred on it, and close.
    expect(tip.x + tip.width / 2).toBeCloseTo(card.x + card.width / 2);
    expect(tip.y + tip.height).toBeLessThanOrEqual(card.y);
    expect(card.y - (tip.y + tip.height)).toBeLessThan(30);
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

  it('opens for keyboard focus inside it, and not for a press', () => {
    const ui = mount(
      Column(
        createComponent(Tooltip, {
          text: 'Saves the note',
          children: Button({ text: 'Save', label: 'Save note' })
        })
      )
    );

    ui.fireEvent.click(ui.getByLabel('Save note'));
    vi.advanceTimersByTime(1000);
    expect(ui.entries()).toHaveLength(0);

    ui.fireEvent.blur();
    ui.fireEvent.tab();
    expect(ui.entries()).toHaveLength(1);
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
