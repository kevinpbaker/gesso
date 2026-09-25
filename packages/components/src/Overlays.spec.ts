import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, OverlayService } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Button, Column, Row, Text, type UiRole, type UiSemanticsRecord } from 'gesso-core';
import { Dialog } from './Dialog';
import { Menu } from './Menu';
import { Select } from './Select';

function mount(root: Parameters<typeof renderTest>[0]) {
  const ui = renderTest(root, { width: 400, height: 400 });
  return {
    ...ui,
    /** The overlay entries currently open, which is what a dialog or a select is. */
    entries: () => ui.runtime.services.get(OverlayService).entries.value,
    recordFor: (role: UiRole): UiSemanticsRecord | undefined =>
      [...ui.semanticsTree().values()].find(record => record.role === role)
  };
}

describe('Dialog', () => {
  const app = (open: BehaviorSubject<boolean>) =>
    Column(
      Button({ text: 'Open', label: 'Open' }),
      createComponent(Dialog, {
        open,
        title: 'Delete note',
        description: 'This cannot be undone.',
        content: Row(Button({ text: 'Cancel', label: 'Cancel' }), Button({ text: 'Delete', label: 'Delete' })),
        onClose: () => open.next(false)
      })
    );

  it('traps the keyboard and restores it to the opener', () => {
    const open = new BehaviorSubject(false);
    const ui = mount(app(open));
    const opener = ui.getByLabel('Open');
    ui.fireEvent.focus(opener);

    open.next(true);
    ui.frame();

    // Focus moved into the dialog once its children existed.
    expect(ui.runtime.input.focus.trapped).toBe(true);
    const inside = [ui.runtime.input.focus.focusedNode?.properties.get('label')];
    ui.fireEvent.keyDown('Tab');
    inside.push(ui.runtime.input.focus.focusedNode?.properties.get('label'));
    ui.fireEvent.keyDown('Tab');
    inside.push(ui.runtime.input.focus.focusedNode?.properties.get('label'));
    expect(inside).toEqual(['Cancel', 'Delete', 'Cancel']);

    open.next(false);
    ui.frame();

    expect(ui.runtime.input.focus.trapped).toBe(false);
    expect(ui.runtime.input.focus.focusedNode).toBe(opener);
  });

  it('says what it is, and that it is modal', () => {
    const open = new BehaviorSubject(true);
    const ui = mount(app(open));
    ui.frame();

    const record = ui.recordFor('dialog');
    expect(record?.label).toBe('Delete note');
    expect(record?.description).toBe('This cannot be undone.');
    expect(record?.states).toEqual(['modal']);
  });

  it('opens centred in the canvas', () => {
    const open = new BehaviorSubject(true);
    const ui = mount(app(open));
    ui.frame();

    // Centred on both axes and pinned to no edge, so the box the layer
    // gives it spans the whole canvas and the dialog sits in the middle
    // of it however tall the content turns out to be.
    const entry = ui.entries()[0];
    expect(entry.center).toBe('both');
    expect(entry.top).toBeUndefined();
    expect(entry.left).toBeUndefined();
  });

  it('Escape closes it', () => {
    const open = new BehaviorSubject(true);
    const ui = mount(app(open));
    ui.frame();
    expect(ui.entries()).toHaveLength(1);

    ui.fireEvent.keyDown('Escape');
    ui.frame();

    expect(ui.entries()).toHaveLength(0);
    expect(open.value).toBe(false);
  });

  it('Escape closes one whose content has nothing focusable in it', () => {
    // The bug `tabStop` was added for. `settleScope` moved focus into
    // the innermost scope and blurred when the scope held nothing
    // focusable, so a dialog whose content is a sentence handed the
    // keyboard to nothing and could not be dismissed without a mouse.
    // The body is now `focusable: true, tabStop: false`: it takes focus
    // when nothing inside it will, and does not become a stop of its own.
    const open = new BehaviorSubject(true);
    const ui = mount(
      Column(
        Button({ text: 'Open', label: 'Open' }),
        createComponent(Dialog, {
          open,
          title: 'Saved',
          description: 'Your changes are on disk.',
          content: Text({ text: 'Nothing here takes the keyboard.' }),
          onClose: () => open.next(false)
        })
      )
    );
    ui.frame();
    expect(ui.entries()).toHaveLength(1);
    expect(ui.runtime.input.focus.focusedNode).not.toBeNull();

    ui.fireEvent.keyDown('Escape');
    ui.frame();

    expect(ui.entries()).toHaveLength(0);
    expect(open.value).toBe(false);
  });

  it('does not add a tab stop of its own for the body', () => {
    // The other half. Making the body focusable without `tabStop: false`
    // is the one-line fix that looks right and puts a box announcing
    // nothing into every dialog's Tab cycle.
    const open = new BehaviorSubject(true);
    const ui = mount(app(open));
    ui.frame();

    const seen: (string | undefined)[] = [];
    for (let press = 0; press < 4; press++) {
      seen.push(ui.runtime.input.focus.focusedNode?.properties.get('label') as string | undefined);
      ui.fireEvent.keyDown('Tab');
    }

    expect(seen).toEqual(['Cancel', 'Delete', 'Cancel', 'Delete']);
  });

  it('Escape closes only the topmost, because focus is in it', () => {
    const outer = new BehaviorSubject(true);
    const inner = new BehaviorSubject(false);
    const ui = mount(
      Column(
        createComponent(Dialog, {
          open: outer,
          title: 'Outer',
          content: Button({ text: 'a', label: 'a' }),
          onClose: () => outer.next(false)
        }),
        createComponent(Dialog, {
          open: inner,
          title: 'Inner',
          content: Button({ text: 'b', label: 'b' }),
          onClose: () => inner.next(false)
        })
      )
    );
    ui.frame();
    inner.next(true);
    ui.frame();
    expect(ui.entries()).toHaveLength(2);

    ui.fireEvent.keyDown('Escape');
    ui.frame();

    expect(inner.value).toBe(false);
    expect(outer.value).toBe(true);
    expect(ui.entries()).toHaveLength(1);
  });
});

describe('Select', () => {
  const options = [
    { value: 'card', label: 'Card' },
    { value: 'bank', label: 'Bank transfer' },
    { value: 'cash', label: 'Cash' }
  ];

  function selectApp(changes: string[]) {
    return createComponent(Select, {
      label: 'Payment',
      options,
      defaultValue: 'card',
      onChange: (value: string) => changes.push(value)
    });
  }

  it('opens, walks and chooses from the keyboard alone', () => {
    const changes: string[] = [];
    const ui = mount(selectApp(changes));
    ui.fireEvent.focus(ui.getByRole('combobox'));

    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(ui.entries()).toHaveLength(1);

    ui.fireEvent.keyDown('ArrowDown');
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    expect(changes).toEqual(['bank']);
    expect(ui.entries()).toHaveLength(0);
  });

  it('Escape closes without choosing and gives the trigger back', () => {
    const changes: string[] = [];
    const ui = mount(selectApp(changes));
    const trigger = ui.getByRole('combobox');
    ui.fireEvent.focus(trigger);

    ui.fireEvent.keyDown('Enter');
    ui.frame();
    ui.fireEvent.keyDown('ArrowDown');
    ui.fireEvent.keyDown('Escape');
    ui.frame();

    expect(changes).toEqual([]);
    expect(ui.entries()).toHaveLength(0);
    expect(ui.runtime.input.focus.focusedNode).toBe(trigger);
  });

  it('jumps to an option by its first letter, closed and open', () => {
    const changes: string[] = [];
    const ui = mount(selectApp(changes));
    ui.fireEvent.focus(ui.getByRole('combobox'));

    // Closed: the letter chooses outright.
    ui.fireEvent.keyDown('b');
    expect(changes).toEqual(['bank']);

    // Open: it moves the highlight, and Enter takes it.
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    ui.fireEvent.keyDown('c');
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(changes).toEqual(['bank', 'card']);
  });

  it('reports what it is, what it holds and whether it is open', () => {
    const changes: string[] = [];
    const ui = mount(selectApp(changes));
    const record = () => ui.recordFor('combobox');

    expect(record()?.label).toBe('Payment');
    expect(record()?.valueText).toBe('Card');
    expect(record()?.states).toBeUndefined();

    ui.fireEvent.focus(ui.getByRole('combobox'));
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    expect(record()?.states).toEqual(['expanded']);
    const chosen = ui.getAllByRole('option').map(node => ui.getSemantics(node));
    expect(chosen.map(entry => [entry.label, entry.states])).toEqual([
      ['Card', ['selected']],
      ['Bank transfer', undefined],
      ['Cash', undefined]
    ]);
  });

  it('sits beside its trigger, so the engine can flip it at the edge', () => {
    const changes: string[] = [];
    const ui = mount(selectApp(changes));
    ui.fireEvent.focus(ui.getByRole('combobox'));
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    const entry = ui.entries()[0];
    expect(entry.anchor).toBe(ui.getByRole('combobox'));
    expect(entry.placement).toBe('bottom-start');
  });
});

describe('Menu', () => {
  it('walks its items and chooses one, then closes', () => {
    const open = new BehaviorSubject(false);
    const chosen: string[] = [];
    const ui = mount(
      createComponent(Menu, {
        open,
        items: [
          { value: 'rename', label: 'Rename' },
          { value: 'duplicate', label: 'Duplicate' },
          { value: 'delete', label: 'Delete', disabled: true }
        ],
        onSelect: (value: string) => chosen.push(value),
        onOpenChange: (next: boolean) => open.next(next)
      })
    );

    open.next(true);
    ui.frame();
    expect(ui.entries()).toHaveLength(1);

    ui.fireEvent.keyDown('ArrowDown');
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    expect(chosen).toEqual(['duplicate']);
    expect(ui.entries()).toHaveLength(0);
    expect(open.value).toBe(false);
  });
});
