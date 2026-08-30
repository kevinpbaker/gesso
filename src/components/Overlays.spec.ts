import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from '../framework/createComponent';
import { mountRuntime } from '../framework/app/RuntimeTestUtils';
import type { NodalRuntime } from '../framework/app/NodalRuntime';
import { OverlayService } from '../framework/overlay/OverlayService';
import { Button, Column, Row } from '../ui/composition/UiComponents';
import type { UiNode } from '../ui/graph/UiNode';
import { UiEventType, UiPointerEvent } from '../ui/input/UiInputEvent';
import { Dialog } from './Dialog';
import { Menu } from './Menu';
import { Select } from './Select';

function nodes(runtime: NodalRuntime): UiNode[] {
  const result: UiNode[] = [];
  const visit = (node: UiNode): void => {
    result.push(node);
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(runtime.layoutRoot());
  return result;
}

function byRole(runtime: NodalRuntime, role: string): UiNode {
  const node = nodes(runtime).find(candidate => candidate.properties.get('role') === role);
  if (node === undefined) {
    throw new Error(`no node with role '${role}'`);
  }
  return node;
}

function byLabel(runtime: NodalRuntime, label: string): UiNode {
  const node = nodes(runtime).find(candidate => candidate.properties.get('label') === label);
  if (node === undefined) {
    throw new Error(`no node labelled '${label}'`);
  }
  return node;
}

function mount(root: Parameters<typeof mountRuntime>[0]) {
  const mounted = mountRuntime(root, { width: 400, height: 400 });
  mounted.frame(0);
  const { runtime } = mounted;
  return {
    ...mounted,
    press: (key: string) => runtime.input.keyboard.keyDown(key),
    click: (node: UiNode) => runtime.input.dispatcher.dispatch(new UiPointerEvent(UiEventType.Click, 0, 0), node),
    focused: () => runtime.input.focus.focusedNode,
    entries: () => runtime.services.get(OverlayService).entries.value
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
    const { runtime, frame, press, focused } = mount(app(open));
    const opener = byLabel(runtime, 'Open');
    runtime.input.focus.focus(opener);

    open.next(true);
    frame();

    // Focus moved into the dialog once its children existed.
    expect(runtime.input.focus.trapped).toBe(true);
    const inside = [focused()?.properties.get('label')];
    press('Tab');
    inside.push(focused()?.properties.get('label'));
    press('Tab');
    inside.push(focused()?.properties.get('label'));
    expect(inside).toEqual(['Cancel', 'Delete', 'Cancel']);

    open.next(false);
    frame();

    expect(runtime.input.focus.trapped).toBe(false);
    expect(focused()).toBe(opener);
  });

  it('says what it is, and that it is modal', () => {
    const open = new BehaviorSubject(true);
    const { runtime, frame } = mount(app(open));
    frame();

    const record = [...runtime.semanticsTree().values()].find(entry => entry.role === 'dialog');
    expect(record?.label).toBe('Delete note');
    expect(record?.description).toBe('This cannot be undone.');
    expect(record?.states).toEqual(['modal']);
  });

  it('Escape closes it', () => {
    const open = new BehaviorSubject(true);
    const { frame, press, entries } = mount(app(open));
    frame();
    expect(entries()).toHaveLength(1);

    press('Escape');
    frame();

    expect(entries()).toHaveLength(0);
    expect(open.value).toBe(false);
  });

  it('Escape closes only the topmost, because focus is in it', () => {
    const outer = new BehaviorSubject(true);
    const inner = new BehaviorSubject(false);
    const { frame, press, entries } = mount(
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
    frame();
    inner.next(true);
    frame();
    expect(entries()).toHaveLength(2);

    press('Escape');
    frame();

    expect(inner.value).toBe(false);
    expect(outer.value).toBe(true);
    expect(entries()).toHaveLength(1);
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
    const { runtime, frame, press, entries } = mount(selectApp(changes));
    runtime.input.focus.focus(byRole(runtime, 'combobox'));

    press('Enter');
    frame();
    expect(entries()).toHaveLength(1);

    press('ArrowDown');
    press('Enter');
    frame();

    expect(changes).toEqual(['bank']);
    expect(entries()).toHaveLength(0);
  });

  it('Escape closes without choosing and gives the trigger back', () => {
    const changes: string[] = [];
    const { runtime, frame, press, entries } = mount(selectApp(changes));
    const trigger = byRole(runtime, 'combobox');
    runtime.input.focus.focus(trigger);

    press('Enter');
    frame();
    press('ArrowDown');
    press('Escape');
    frame();

    expect(changes).toEqual([]);
    expect(entries()).toHaveLength(0);
    expect(runtime.input.focus.focusedNode).toBe(trigger);
  });

  it('jumps to an option by its first letter, closed and open', () => {
    const changes: string[] = [];
    const { runtime, frame, press } = mount(selectApp(changes));
    runtime.input.focus.focus(byRole(runtime, 'combobox'));

    // Closed: the letter chooses outright.
    press('b');
    expect(changes).toEqual(['bank']);

    // Open: it moves the highlight, and Enter takes it.
    press('Enter');
    frame();
    press('c');
    press('Enter');
    frame();
    expect(changes).toEqual(['bank', 'card']);
  });

  it('reports what it is, what it holds and whether it is open', () => {
    const changes: string[] = [];
    const { runtime, frame, press } = mount(selectApp(changes));
    const record = () => [...runtime.semanticsTree().values()].find(entry => entry.role === 'combobox');

    expect(record()?.label).toBe('Payment');
    expect(record()?.valueText).toBe('Card');
    expect(record()?.states).toBeUndefined();

    runtime.input.focus.focus(byRole(runtime, 'combobox'));
    press('Enter');
    frame();

    expect(record()?.states).toEqual(['expanded']);
    const chosen = [...runtime.semanticsTree().values()].filter(entry => entry.role === 'option');
    expect(chosen.map(entry => [entry.label, entry.states])).toEqual([
      ['Card', ['selected']],
      ['Bank transfer', undefined],
      ['Cash', undefined]
    ]);
  });

  it('sits beside its trigger, so the engine can flip it at the edge', () => {
    const changes: string[] = [];
    const { runtime, frame, press, entries } = mount(selectApp(changes));
    runtime.input.focus.focus(byRole(runtime, 'combobox'));
    press('Enter');
    frame();

    const entry = entries()[0];
    expect(entry.anchor).toBe(byRole(runtime, 'combobox'));
    expect(entry.placement).toBe('bottom-start');
  });
});

describe('Menu', () => {
  it('walks its items and chooses one, then closes', () => {
    const open = new BehaviorSubject(false);
    const chosen: string[] = [];
    const { frame, press, entries } = mount(
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
    frame();
    expect(entries()).toHaveLength(1);

    press('ArrowDown');
    press('Enter');
    frame();

    expect(chosen).toEqual(['duplicate']);
    expect(entries()).toHaveLength(0);
    expect(open.value).toBe(false);
  });
});
