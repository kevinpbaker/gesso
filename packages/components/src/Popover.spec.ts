import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Box, Button, Column, EditableText, Row, ScrollView, Text, percent, type UiNode } from 'gesso-core';
import { OverlayService, createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Dialog } from './Dialog';
import { Popover, placementOf } from './Popover';
import { Select } from './Select';

type Mounted = Rendered & {
  readonly anchor: BehaviorSubject<UiNode | null>;
  readonly changes: boolean[];
  readonly presses: string[];
};

/**
 * A page with a trigger, a popover hanging off it, and a button after
 * the trigger that counts its presses, so a press outside the popover
 * can be seen to land.
 */
function mount(
  props: Record<string, unknown> = {},
  options: {
    direction?: 'ltr' | 'rtl';
    width?: number;
    height?: number;
    /** Where the trigger sits in the page. */
    at?: { x: 'start' | 'center' | 'end'; y: 'start' | 'center' | 'end' };
  } = {}
): Mounted {
  const anchor = new BehaviorSubject<UiNode | null>(null);
  const changes: boolean[] = [];
  const presses: string[] = [];
  const width = options.width ?? 600;
  const height = options.height ?? 400;
  const ui = renderTest(
    Box(
      {
        width: percent(100),
        height: percent(100),
        textDirection: options.direction ?? 'ltr',
        x: options.at?.x ?? 'start',
        y: options.at?.y ?? 'start'
      },
      Row(
        { gap: 8, padding: 20 },
        Button(
          {
            ref: (node: UiNode | null) => anchor.next(node),
            label: 'Filters',
            padding: 6
          },
          Text({ text: 'Filters' })
        ),
        Button({ label: 'After', padding: 6, onClick: () => presses.push('After') }, Text({ text: 'After' })),
        createComponent(Popover, {
          anchor,
          label: 'Filter results',
          onOpenChange: (next: boolean) => changes.push(next),
          content: Column(
            { gap: 4 },
            Text({ text: 'Show only' }),
            Button({ label: 'First', padding: 4 }, Text({ text: 'First' })),
            Button({ label: 'Second', padding: 4 }, Text({ text: 'Second' }))
          ),
          ...props
        })
      )
    ),
    { width, height }
  );
  ui.frame();
  return Object.assign(ui, { anchor, changes, presses });
}

const entries = (ui: Rendered) => ui.runtime.services.get(OverlayService).entries.value;
const panel = (ui: Rendered) => ui.getByRole('dialog', { name: 'Filter results' });
const focused = (ui: Rendered) => ui.runtime.input.focus.focusedNode;

/** A press and release at the middle of a node, through hit testing, as a real pointer makes one. */
function pressOn(ui: Rendered, node: UiNode): void {
  const box = ui.getLayout(node);
  ui.fireEvent.pointerDown(box.x + box.width / 2, box.y + box.height / 2);
  ui.fireEvent.pointerUp(box.x + box.width / 2, box.y + box.height / 2);
  ui.frame();
}

describe('Popover, rendering', () => {
  it('draws nothing until its anchor is pressed, then a panel beside it', () => {
    const ui = mount({ defaultOpen: false });
    expect(ui.queryByRole('dialog')).toBeNull();
    expect(entries(ui)).toHaveLength(0);

    pressOn(ui, ui.getByLabel('Filters'));

    expect(entries(ui)).toHaveLength(1);
    expect(ui.getByText('Show only')).toBeDefined();
    // Under the trigger, its start edge lined up with the trigger's, six
    // pixels below it.
    const trigger = ui.getLayout(ui.getByLabel('Filters'));
    const box = ui.getLayout(panel(ui));
    expect(box.x).toBe(trigger.x);
    expect(box.y).toBe(trigger.y + trigger.height + 6);
  });

  it('opens on the side and alignment it is given', () => {
    const ui = mount({ defaultOpen: true, side: 'end', align: 'center' }, { at: { x: 'start', y: 'center' } });
    const trigger = ui.getLayout(ui.getByLabel('Filters'));
    const box = ui.getLayout(panel(ui));
    expect(box.x).toBe(trigger.x + trigger.width + 6);
    expect(box.y + box.height / 2).toBeCloseTo(trigger.y + trigger.height / 2, 5);
  });

  it('flips above an anchor at the bottom of the window', () => {
    const ui = mount({ defaultOpen: true }, { at: { x: 'start', y: 'end' }, height: 300 });
    const trigger = ui.getLayout(ui.getByLabel('Filters'));
    const box = ui.getLayout(panel(ui));
    expect(box.y + box.height).toBe(trigger.y - 6);
  });

  it('stays inside the window beside an anchor at its right edge', () => {
    const ui = mount({ defaultOpen: true, width: 300 }, { at: { x: 'end', y: 'start' }, width: 400 });
    const box = ui.getLayout(panel(ui));
    expect(box.width).toBe(300);
    expect(box.x + box.width).toBeLessThanOrEqual(400);
    expect(box.x).toBeGreaterThanOrEqual(0);
  });

  it('wraps long content at a readable width, and scrolls what the window has no room for', () => {
    const long = 'A sentence that goes on for a while about what this filter does. '.repeat(30);
    const ui = mount({ defaultOpen: true, content: Text({ text: long }) }, { height: 300 });
    const box = ui.getLayout(panel(ui));
    expect(box.width).toBe(360);
    // Under a trigger near the top, the room below is what it gets.
    expect(box.y + box.height).toBeLessThanOrEqual(300);
  });
});

describe('Popover, controlled and uncontrolled', () => {
  it('owns its own state with defaultOpen, and reports each change', () => {
    const ui = mount({ defaultOpen: true });
    expect(entries(ui)).toHaveLength(1);

    pressOn(ui, ui.getByLabel('Filters'));
    expect(entries(ui)).toHaveLength(0);
    pressOn(ui, ui.getByLabel('Filters'));
    expect(entries(ui)).toHaveLength(1);
    expect(ui.changes).toEqual([false, true]);
  });

  it('asks rather than acts when the application owns the state', () => {
    const open = new BehaviorSubject(false);
    const ui = mount({ open });

    // The anchor's press is a request: nothing opens until it is granted.
    pressOn(ui, ui.getByLabel('Filters'));
    expect(ui.changes).toEqual([true]);
    expect(entries(ui)).toHaveLength(0);

    open.next(true);
    ui.frame();
    expect(entries(ui)).toHaveLength(1);

    // Escape asks to close, and an application that does not write the
    // value back keeps it open.
    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(ui.changes).toEqual([true, false]);
    expect(entries(ui)).toHaveLength(1);

    // So does a press outside.
    pressOn(ui, ui.getByLabel('After'));
    expect(ui.changes).toEqual([true, false, false]);
    expect(entries(ui)).toHaveLength(1);

    // A write of false closes it, and is not reported back as a request.
    open.next(false);
    ui.frame();
    expect(entries(ui)).toHaveLength(0);
    expect(ui.changes).toEqual([true, false, false]);
  });

  it('refuses to be given both open and defaultOpen', () => {
    expect(() => mount({ open: false, defaultOpen: true })).toThrow(/both 'open' and 'defaultOpen'/);
  });
});

describe('Popover, keyboard', () => {
  it('opens from the keyboard and moves focus into the panel', () => {
    const ui = mount({ defaultOpen: false });
    ui.fireEvent.focus(ui.getByLabel('Filters'));
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    expect(entries(ui)).toHaveLength(1);
    expect(panel(ui)).toHaveFocus();
  });

  it('focuses initialFocus when it names a node inside the panel', () => {
    const field = new BehaviorSubject<UiNode | null>(null);
    const ui = mount({
      defaultOpen: false,
      initialFocus: field,
      content: Column(
        Text({ text: 'Name' }),
        EditableText({ ref: (node: UiNode | null) => field.next(node), label: 'Name', value: '', width: 120 })
      )
    });
    pressOn(ui, ui.getByLabel('Filters'));
    expect(ui.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('closes on Escape and gives the keyboard back to the anchor', () => {
    const ui = mount({ defaultOpen: false });
    ui.fireEvent.focus(ui.getByLabel('Filters'));
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(entries(ui)).toHaveLength(0);
    expect(ui.getByLabel('Filters')).toHaveFocus();
  });

  it('walks its own controls with Tab, then leaves to what follows the anchor and closes', () => {
    const ui = mount({ defaultOpen: false });
    ui.fireEvent.focus(ui.getByLabel('Filters'));
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    ui.fireEvent.keyDown('Tab');
    expect(ui.getByLabel('First')).toHaveFocus();
    ui.fireEvent.keyDown('Tab');
    expect(ui.getByLabel('Second')).toHaveFocus();
    ui.fireEvent.keyDown('Tab');
    ui.frame();

    // Not the top of the page, which is where the focus manager's own
    // walk would have wrapped to from the overlay layer.
    expect(entries(ui)).toHaveLength(0);
    expect(focused(ui)?.properties.get('label')).toBe('After');
  });

  it('leaves back to the anchor with Shift+Tab from its first control, and closes', () => {
    const ui = mount({ defaultOpen: false });
    ui.fireEvent.focus(ui.getByLabel('Filters'));
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    ui.fireEvent.keyDown('Tab');
    expect(ui.getByLabel('First')).toHaveFocus();

    ui.fireEvent.keyDown('Tab', { shift: true });
    ui.frame();
    expect(entries(ui)).toHaveLength(0);
    expect(ui.getByLabel('Filters')).toHaveFocus();
  });

  it('puts focus back on the anchor when the application closes it from inside', () => {
    const open = new BehaviorSubject(true);
    const ui = mount({ open });
    ui.fireEvent.keyDown('Tab');
    expect(ui.getByLabel('First')).toHaveFocus();

    open.next(false);
    ui.frame();
    expect(ui.getByLabel('Filters')).toHaveFocus();
  });
});

describe('Popover, pointer', () => {
  it('is not modal: a press outside closes it and still lands on what was pressed', () => {
    const ui = mount({ defaultOpen: true });
    pressOn(ui, ui.getByLabel('After'));

    expect(entries(ui)).toHaveLength(0);
    expect(ui.presses).toEqual(['After']);
    // Focus went where the press put it, not back to the anchor.
    expect(ui.getByLabel('After')).toHaveFocus();
    // There was no backdrop to take it, and nothing dims the page.
    expect(ui.changes).toEqual([false]);
  });

  it('stays open for a press inside it, and for the wheel', () => {
    const ui = mount({ defaultOpen: true });
    pressOn(ui, ui.getByLabel('First'));
    expect(entries(ui)).toHaveLength(1);

    ui.fireEvent.wheel({ x: 500, y: 300, deltaY: 40 });
    ui.frame();
    expect(entries(ui)).toHaveLength(1);
  });

  it('keeps open while a select inside it is used', () => {
    const chosen: string[] = [];
    const ui = mount({
      defaultOpen: true,
      content: createComponent(Select, {
        label: 'Sort',
        defaultValue: 'new',
        options: [
          { value: 'new', label: 'Newest' },
          { value: 'old', label: 'Oldest' }
        ],
        onChange: (value: string) => chosen.push(value)
      })
    });

    pressOn(ui, ui.getByRole('combobox', { name: 'Sort' }));
    expect(entries(ui)).toHaveLength(2);
    // The option is in the select's own entry, outside the panel's
    // subtree, and is still a press inside the popover.
    pressOn(ui, ui.getByRole('option', { name: 'Oldest' }));

    expect(chosen).toEqual(['old']);
    expect(entries(ui)).toHaveLength(1);
    expect(ui.queryByRole('dialog', { name: 'Filter results' })).not.toBeNull();
  });

  it('closes a nested popover on a press in the outer one, and keeps the outer open', () => {
    const inner = new BehaviorSubject<UiNode | null>(null);
    const ui = mount({
      defaultOpen: true,
      content: Column(
        // Above the inner trigger, so the inner panel, which opens below
        // it, does not cover the text being pressed.
        Text({ text: 'Outer text' }),
        Button({ ref: (node: UiNode | null) => inner.next(node), label: 'More', padding: 4 }, Text({ text: 'More' })),
        createComponent(Popover, { anchor: inner, label: 'More options', content: Text({ text: 'Inner text' }) })
      )
    });

    pressOn(ui, ui.getByLabel('More'));
    expect(entries(ui)).toHaveLength(2);
    pressOn(ui, ui.getByText('Inner text'));
    expect(entries(ui)).toHaveLength(2);

    pressOn(ui, ui.getByText('Outer text'));
    expect(entries(ui)).toHaveLength(1);
    expect(ui.queryByRole('dialog', { name: 'More options' })).toBeNull();
  });
});

describe('Popover, semantics', () => {
  it('is a non-modal dialog with a name and a description', () => {
    const ui = mount({ defaultOpen: true, description: 'Narrows the list below.' });
    expect(panel(ui)).toHaveSemantics({ role: 'dialog', name: 'Filter results' });
    const record = ui.getSemantics(panel(ui));
    expect(record.description).toBe('Narrows the list below.');
    expect(record.states ?? []).not.toContain('modal');
  });

  it('hands the panel to panelRef, for the trigger to say it controls it', () => {
    const node = new BehaviorSubject<UiNode | null>(null);
    const ui = mount({ defaultOpen: true, panelRef: (next: UiNode | null) => node.next(next) });
    expect(node.value).toBe(panel(ui));

    pressOn(ui, ui.getByLabel('Filters'));
    expect(node.value).toBeNull();
  });
});

describe('Popover, disabled', () => {
  it('does not open on a press, and closes when disabled while open', () => {
    const disabled = new BehaviorSubject(true);
    const ui = mount({ defaultOpen: false, disabled });
    pressOn(ui, ui.getByLabel('Filters'));
    expect(entries(ui)).toHaveLength(0);
    expect(ui.changes).toEqual([]);

    disabled.next(false);
    pressOn(ui, ui.getByLabel('Filters'));
    expect(entries(ui)).toHaveLength(1);

    disabled.next(true);
    ui.frame();
    expect(entries(ui)).toHaveLength(0);
  });
});

describe('Popover, right to left', () => {
  it('opens at the anchor’s start edge, which is its right', () => {
    const ui = mount({ defaultOpen: true, width: 200 }, { direction: 'rtl', at: { x: 'center', y: 'start' } });
    const trigger = ui.getLayout(ui.getByLabel('Filters'));
    const box = ui.getLayout(panel(ui));
    expect(box.x + box.width).toBe(trigger.x + trigger.width);
  });

  it('opens on the end side to the anchor’s left', () => {
    const ui = mount({ defaultOpen: true, side: 'end' }, { direction: 'rtl', at: { x: 'center', y: 'center' } });
    const trigger = ui.getLayout(ui.getByLabel('Filters'));
    const box = ui.getLayout(panel(ui));
    expect(box.x + box.width).toBe(trigger.x - 6);
  });

  it('lays out its content right to left, where only part of the page reads that way', () => {
    // The panel is drawn in the overlay layer, under the application's
    // root rather than under the section the anchor is in, so the
    // section's direction has to be carried across to it.
    const anchor = new BehaviorSubject<UiNode | null>(null);
    const ui = renderTest(
      Column(
        { width: percent(100), height: percent(100), textDirection: 'ltr' },
        Row(
          { textDirection: 'rtl', padding: 20, x: 'center' },
          Button(
            { ref: (node: UiNode | null) => anchor.next(node), label: 'Filters', padding: 6 },
            Text({ text: 'Filters' })
          ),
          createComponent(Popover, {
            anchor,
            defaultOpen: true,
            label: 'Filter results',
            content: Row(
              { gap: 4 },
              Button({ label: 'First', padding: 4 }, Text({ text: 'First' })),
              Button({ label: 'Second', padding: 4 }, Text({ text: 'Second' }))
            )
          })
        )
      ),
      { width: 600, height: 400 }
    );
    ui.frame();
    expect(ui.getLayout(ui.getByLabel('First')).x).toBeGreaterThan(ui.getLayout(ui.getByLabel('Second')).x);
  });

  it('names its side and alignment as the overlay layer does, which resolves them in the anchor’s direction', () => {
    expect(placementOf('bottom', 'start')).toBe('bottom-start');
    expect(placementOf('top', 'end')).toBe('top-end');
    expect(placementOf('top', 'center')).toBe('top');
    expect(placementOf('start', 'start')).toBe('start-start');
    expect(placementOf('end', 'end')).toBe('end-end');
    expect(placementOf('end', 'center')).toBe('end');
  });
});

describe('Popover inside a dialog', () => {
  it('can still take focus, where the dialog confines it', () => {
    const anchor = new BehaviorSubject<UiNode | null>(null);
    const open = new BehaviorSubject(true);
    const ui = renderTest(
      Column(
        createComponent(Dialog, {
          open,
          title: 'Settings',
          content: Column(
            Button(
              { ref: (node: UiNode | null) => anchor.next(node), label: 'Help', padding: 4 },
              Text({ text: 'Help' })
            ),
            createComponent(Popover, {
              anchor,
              label: 'About this setting',
              content: ScrollView({ height: 40 }, Button({ label: 'Learn more' }, Text({ text: 'Learn more' })))
            })
          )
        })
      ),
      { width: 500, height: 400 }
    );
    ui.frame();
    ui.frame(1000);
    ui.fireEvent.focus(ui.getByLabel('Help'));
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(ui.getByRole('dialog', { name: 'About this setting' })).toHaveFocus();

    ui.fireEvent.keyDown('Escape');
    ui.frame();
    // Escape closed the popover and not the dialog under it.
    expect(ui.queryByRole('dialog', { name: 'About this setting' })).toBeNull();
    expect(ui.getByRole('dialog', { name: 'Settings' })).toBeDefined();
    expect(ui.getByLabel('Help')).toHaveFocus();
  });
});
