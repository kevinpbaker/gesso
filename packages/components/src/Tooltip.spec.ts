import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, map } from 'rxjs';

import { createComponent, OverlayService, type ComponentContext, type OverlayPlacement } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Box, Button, Column, EditableText, percent, Row, Text, type UiChild } from 'gesso-core';
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

describe('Escape on a tooltip', () => {
  // WCAG 1.4.13: what appears on hover or focus can be dismissed without
  // moving either. Neither surface answered Escape, so a tooltip over
  // what the person wanted to read stayed until the pointer or the focus
  // went somewhere else.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes one the pointer opened, with the pointer still on it and focus elsewhere', () => {
    const ui = mount(Column(Button({ text: 'Other', label: 'Other' }), createComponent(Trigger, {})));
    ui.fireEvent.focus(ui.getByLabel('Other'));
    ui.hover('Save');
    vi.advanceTimersByTime(400);
    expect(ui.entries()).toHaveLength(1);

    ui.fireEvent.keyDown('Escape');
    expect(ui.entries()).toHaveLength(0);
    // Resting there is not a new hover.
    ui.hover('Save');
    vi.advanceTimersByTime(1000);
    expect(ui.entries()).toHaveLength(0);
  });

  it('closes one focus opened, leaving focus where it was', () => {
    const ui = mount(Column(createComponent(Trigger, {})));
    ui.fireEvent.tab();
    expect(ui.entries()).toHaveLength(1);

    ui.fireEvent.keyDown('Escape');
    expect(ui.entries()).toHaveLength(0);
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByLabel('Save'));
  });

  it('closes the component’s as well', () => {
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
    expect(ui.entries()).toHaveLength(1);

    ui.fireEvent.keyDown('Escape');
    expect(ui.entries()).toHaveLength(0);
  });

  it('closes one over a text field and leaves the field its Escape', () => {
    const heard: string[] = [];
    function Field(_props: Record<string, never>, ctx: ComponentContext): UiChild {
      return EditableText({
        label: 'Name',
        width: 120,
        height: 24,
        onKeyDown: event => heard.push(event.key),
        modifiers: [tooltip(ctx, { text: 'Rename this workbook' })]
      });
    }
    const ui = mount(Column(createComponent(Field, {})));
    ui.fireEvent.tab();
    expect(ui.entries()).toHaveLength(1);

    ui.fireEvent.keyDown('Escape');
    expect(ui.entries()).toHaveLength(0);
    expect(heard).toEqual(['Escape']);
  });

  it('leaves Escape to the page when no tooltip is open', () => {
    const escaped: string[] = [];
    const ui = mount(Column({ onKeyDown: event => escaped.push(event.key) }, createComponent(Trigger, {})));
    ui.fireEvent.tab();
    ui.fireEvent.keyDown('Escape');
    expect(escaped).toEqual([]);
    ui.fireEvent.keyDown('Escape');
    expect(escaped).toEqual(['Escape']);
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

describe('a tooltip in right-to-left text', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A trigger in the middle of a page that reads one way, with its tip open. */
  function shown(direction: 'ltr' | 'rtl', placement: OverlayPlacement) {
    const Tipped = (_props: Record<string, never>, ctx: ComponentContext): UiChild =>
      Button({
        text: 'Save',
        label: 'Save',
        modifiers: [tooltip(ctx, { text: 'Saves the note', placement, delay: 0 })]
      });
    const ui = mount(
      Row(
        { textDirection: direction, width: percent(100), height: percent(100), x: 'center', y: 'center' },
        createComponent(Tipped, {})
      )
    );
    ui.frame();
    ui.hover('Save');
    vi.advanceTimersByTime(0);
    ui.frame();
    return { trigger: ui.getLayout(ui.getByLabel('Save')), tip: ui.getLayout(ui.getByRole('tooltip')) };
  }

  it('lines a start alignment up with the trigger’s right edge', () => {
    const { trigger, tip } = shown('rtl', 'top-start');
    expect(tip.x + tip.width).toBeCloseTo(trigger.x + trigger.width, 5);
    const ltr = shown('ltr', 'top-start');
    expect(ltr.tip.x).toBeCloseTo(ltr.trigger.x, 5);
  });

  it('opens on the end side to the trigger’s left, and on the start side to its right', () => {
    const end = shown('rtl', 'end');
    expect(end.tip.x + end.tip.width).toBeCloseTo(end.trigger.x - 6, 5);
    const start = shown('rtl', 'start');
    expect(start.tip.x).toBeCloseTo(start.trigger.x + start.trigger.width + 6, 5);
  });

  it('keeps a physical side where it was asked for', () => {
    const { trigger, tip } = shown('rtl', 'right');
    expect(tip.x).toBeCloseTo(trigger.x + trigger.width + 6, 5);
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
