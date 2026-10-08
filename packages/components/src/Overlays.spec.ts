import { describe, expect, it } from 'vitest';
import { BehaviorSubject, combineLatest, map } from 'rxjs';

import {
  createComponent,
  EditingService,
  OverlayService,
  type ComponentContext,
  type OverlayRect
} from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import {
  Box,
  Button,
  Column,
  EditableText,
  percent,
  Row,
  Text,
  type UiNode,
  type UiRole,
  type UiSemanticsRecord
} from 'gesso-core';
import { Dialog } from './Dialog';
import { Menu } from './Menu';
import { Select } from './Select';
import { useOverlay, type OverlayHandle } from './overlay';

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

  it('gives its content the dialog’s whole width, inside its padding', () => {
    const open = new BehaviorSubject(true);
    const ui = mount(
      Column(
        createComponent(Dialog, {
          open,
          title: 'Wide',
          width: 300,
          content: Row({ label: 'body', width: percent(100) }, Text({ text: 'x' })),
          onClose: () => open.next(false)
        })
      )
    );
    ui.frame();
    const dialog = ui.getLayout(ui.getByRole('dialog'));
    expect(dialog.width).toBe(300);
    expect(ui.getLayout(ui.getByLabel('body')).width).toBe(300 - 2 * 20);
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

    // Centred on both axes and pinned to no edge but a margin each side,
    // so the box the layer gives it spans the canvas and the dialog sits
    // in the middle of it however tall the content turns out to be, and
    // a dialog wider than a phone or taller than a short window stays
    // inside it.
    const entry = ui.entries()[0];
    expect(entry.center).toBe('both');
    expect([entry.top, entry.right, entry.bottom, entry.left]).toEqual([16, 16, 16, 16]);
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

  it('follows a title given as an observable, open and reopened', () => {
    // gessologic's program editor: a title from two streams, whose
    // suffix was reported as sticking. It does not, in a test.
    const program = new BehaviorSubject('alu');
    const edited = new BehaviorSubject(false);
    const title = combineLatest([program, edited]).pipe(map(([name, dirty]) => (dirty ? `${name} (edited)` : name)));
    const open = new BehaviorSubject(true);
    const ui = mount(createComponent(Dialog, { open, title, content: Row() }));
    const seen = (): string[] => [
      ui.recordFor('dialog')?.label ?? '',
      ...ui.getAllByText(/alu|mul/).map(n => String(n.properties.get('text')))
    ];
    ui.frame();
    expect(seen()).toEqual(['alu', 'alu']);
    edited.next(true);
    ui.frame();
    expect(seen()).toEqual(['alu (edited)', 'alu (edited)']);
    edited.next(false);
    program.next('mul');
    ui.frame();
    expect(seen()).toEqual(['mul', 'mul']);
    open.next(false);
    ui.frame();
    edited.next(true);
    open.next(true);
    ui.frame();
    expect(seen()).toEqual(['mul (edited)', 'mul (edited)']);
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

  it('keeps a hidden label as its name, and draws none', () => {
    const shown = mount(createComponent(Select, { label: 'Payment', options, defaultValue: 'card' }));
    const hidden = mount(
      createComponent(Select, { label: 'Payment', options, defaultValue: 'card', labelHidden: true, compact: true })
    );
    const texts = (ui: typeof shown) => ui.allNodes().filter(node => node.properties.get('text') === 'Payment');
    expect(texts(shown)).toHaveLength(1);
    expect(texts(hidden)).toHaveLength(0);
    expect(hidden.getByRole('combobox', { name: 'Payment' })).toBeDefined();
    // Compact is shorter than the form-sized trigger.
    expect(hidden.getLayout(hidden.getByRole('combobox')).height).toBeLessThan(
      shown.getLayout(shown.getByRole('combobox')).height
    );
  });

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

  /**
   * A choice that opens a dialog — another rate… — had the list release
   * its focus trap after the dialog had taken its own, which popped the
   * dialog's, and the keyboard was left in a list no longer on screen.
   */
  it('closes before a choice that opens a dialog, which keeps the keyboard', () => {
    const dialog = new BehaviorSubject(false);
    const ui = mount(
      Column(
        createComponent(Select, { label: 'Payment', options, defaultValue: 'card', onChange: () => dialog.next(true) }),
        createComponent(Dialog, {
          open: dialog,
          title: 'Details',
          content: Button({ text: 'Cancel', label: 'Cancel' }),
          onClose: () => dialog.next(false)
        })
      )
    );
    ui.fireEvent.focus(ui.getByRole('combobox'));
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    ui.fireEvent.keyDown('ArrowDown');
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(dialog.value).toBe(true);
    expect(ui.entries()).toHaveLength(1);

    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(dialog.value).toBe(false);
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

/**
 * A list under the word being typed: `@ada` in a comment, the people
 * it could be under the `@`. Under the whole field, it sat at the
 * field's left edge whatever line the word was on; at a point, it
 * stayed behind when the page scrolled. It is placed against a part of
 * the field now, which can move without the list opening again.
 */
describe('an overlay at a character in a field', () => {
  it('opens under the character and moves with it, without opening again', () => {
    let field: UiNode | null = null;
    let handle!: OverlayHandle;
    function Host(_inputs: unknown, ctx: ComponentContext) {
      handle = useOverlay(ctx, 'at-caret');
      return Column(
        { padding: 20, width: percent(100) },
        EditableText({ value: 'ping @ada', width: 300, label: 'Comment', ref: (node: UiNode | null) => (field = node) })
      );
    }
    const ui = mount(createComponent(Host, {}));
    ui.frame();
    const at = ui.runtime.services.get(EditingService).caretRectOf(field, 5)!;
    expect(at.x).toBeGreaterThan(0);
    const rect = new BehaviorSubject<OverlayRect | undefined>({ x: at.x, y: at.y, width: 0, height: at.height });
    handle.show(Box({ role: 'listbox', label: 'People', width: 80, height: 30 }), {
      anchor: field,
      anchorRect: rect,
      placement: 'bottom-start'
    });
    ui.frame();

    const fieldBox = ui.getVisibleBox(field!);
    const list = () => ui.getVisibleBox(ui.getByRole('listbox'));
    expect(list().x).toBeCloseTo(fieldBox.x + at.x, 5);
    expect(list().y).toBeCloseTo(fieldBox.y + at.y + at.height, 5);

    const shown = ui.entries()[0];
    rect.next({ x: 0, y: at.y, width: 0, height: at.height });
    ui.frame();
    expect(list().x).toBeCloseTo(fieldBox.x, 5);
    expect(ui.entries()[0]).toBe(shown);
  });
});

describe('Menu', () => {
  /**
   * A context menu asked for near the bottom of the window. It opened
   * downward from the point and ran off the screen, because a point was
   * a `top` and a `left` and nothing more; it is a point to open beside
   * now, and flips above it when there is no room below.
   */
  it('stays on the screen when opened at a point near the bottom edge', () => {
    const open = new BehaviorSubject(false);
    const ui = mount(
      createComponent(Menu, {
        open,
        at: { x: 20, y: 390 },
        items: [
          { value: 'a', label: 'First' },
          { value: 'b', label: 'Second' },
          { value: 'c', label: 'Third' }
        ],
        onOpenChange: (next: boolean) => open.next(next)
      })
    );
    open.next(true);
    ui.frame();

    const menu = ui.getLayout(ui.getByRole('menu'));
    expect(menu.y + menu.height).toBeLessThanOrEqual(400);
    expect(menu.y + menu.height).toBeCloseTo(390, 0);
    expect(menu.x).toBe(20);
  });

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

  /**
   * A choice that opens a dialog — Rename… — left the menu open behind
   * it, unreported, so the next right-click only closed it; and the
   * menu's focus trap, released after the dialog had taken its own,
   * popped the dialog's. The menu closes before the choice is acted on.
   */
  it('closes, and says so, before a choice that opens a dialog, which keeps the keyboard', () => {
    const open = new BehaviorSubject(false);
    const dialog = new BehaviorSubject(false);
    const ui = mount(
      Column(
        createComponent(Menu, {
          open,
          at: { x: 20, y: 20 },
          items: [{ value: 'rename', label: 'Rename…' }],
          onSelect: () => dialog.next(true),
          onOpenChange: (next: boolean) => open.next(next)
        }),
        createComponent(Dialog, {
          open: dialog,
          title: 'Rename',
          content: Button({ text: 'Cancel', label: 'Cancel' }),
          onClose: () => dialog.next(false)
        })
      )
    );
    open.next(true);
    ui.frame();

    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(open.value).toBe(false);
    expect(dialog.value).toBe(true);
    expect(ui.entries()).toHaveLength(1);

    // The keyboard is the dialog's: Escape closes it.
    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(dialog.value).toBe(false);
    expect(ui.entries()).toHaveLength(0);
  });
});
