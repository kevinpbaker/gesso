import { describe, expect, it } from 'vitest';

import { Column, editorFor, Text, UiNode, UiNodeType } from 'gesso-core';
import { createComponent, type ShellRequest } from 'gesso-framework';
import { renderTest } from 'gesso-testing';

import { ContextMenus, menuFor } from './ContextMenus';
import { Link } from './Link';
import { TextInput } from './TextInput';

function field(props: Record<string, unknown> = {}): UiNode {
  const node = new UiNode('field', UiNodeType.EditableText);
  for (const [key, value] of Object.entries(props)) {
    node.setProperty(key, value);
  }
  return node;
}

const labels = (rows: ReturnType<typeof menuFor>) => rows.map(row => row.label);
/** The labels that start a group, with a rule drawn above them. */
const groups = (rows: ReturnType<typeof menuFor>) => rows.filter(row => row.separator === true).map(row => row.label);
const disabled = (rows: ReturnType<typeof menuFor>) => rows.filter(row => row.disabled === true).map(row => row.label);

describe('menuFor', () => {
  it('offers a field Cut, Copy, Paste and Select All, cutting and copying only a selection', () => {
    expect(labels(menuFor(field(), null, 'hi'))).toEqual(['Cut', 'Copy', 'Paste', 'Select All']);
    // The rule is drawn above Select All, by the item; there is no blank
    // row for it, which the arrows would stop on.
    expect(groups(menuFor(field(), null, 'hi'))).toEqual(['Select All']);
    expect(disabled(menuFor(field(), null, ''))).toEqual(['Cut', 'Copy']);
  });

  it('cuts and pastes nothing in a read-only field, and copies nothing from a secret one', () => {
    expect(disabled(menuFor(field({ readOnly: true }), null, 'hi'))).toEqual(['Cut', 'Paste']);
    expect(disabled(menuFor(field({ secret: true }), null, 'hi'))).toEqual(['Cut', 'Copy']);
  });

  it('offers a link somewhere new, and its address when it has one', () => {
    const outbound = { openElsewhere: () => {}, url: 'https://example.test/' };
    const route = { openElsewhere: () => {} };
    expect(labels(menuFor(null, outbound, ''))).toEqual(['Open Link in New Tab', 'Copy Link']);
    expect(labels(menuFor(null, route, ''))).toEqual(['Open Link in New Tab']);
    // A field or a selection inside the link starts a group of its own.
    expect(labels(menuFor(field(), outbound, ''))).toEqual([
      'Open Link in New Tab',
      'Copy Link',
      'Cut',
      'Copy',
      'Paste',
      'Select All'
    ]);
    expect(groups(menuFor(field(), outbound, ''))).toEqual(['Cut', 'Select All']);
    expect(groups(menuFor(null, outbound, 'the cat'))).toEqual(['Copy']);
  });

  it('offers Copy over selected text, and nothing over anything else', () => {
    expect(labels(menuFor(null, null, 'the cat'))).toEqual(['Copy']);
    expect(menuFor(null, null, '')).toEqual([]);
  });
});

describe('ContextMenus', () => {
  function mount() {
    let input: UiNode | null = null;
    const ui = renderTest(
      createComponent(ContextMenus, {
        children: Column(
          { gap: 8, padding: 16 },
          createComponent(TextInput, {
            label: 'Name',
            defaultValue: 'hello world',
            ref: (n: UiNode | null) => (input = n)
          }),
          Text({ text: 'plain words' }),
          createComponent(Link, { label: 'Docs', href: 'https://example.test/docs' })
        )
      }),
      { width: 400, height: 300 }
    );
    ui.frame();
    const requests: ShellRequest[] = [];
    ui.runtime.onShellRequest(request => requests.push(request));
    return { ui, input: () => input!, requests };
  }

  function rightClick(ui: ReturnType<typeof mount>['ui'], node: UiNode): void {
    const box = ui.getLayout(node);
    ui.fireEvent.contextMenu(node, { x: box.x + 4, y: box.y + 4 });
    ui.frame();
  }

  it('opens over a field with its commands, focusing it, and Select All selects its text', () => {
    const { ui, input } = mount();
    rightClick(ui, input());
    expect(ui.runtime.input.focus.focusedNode).not.toBeNull();
    ui.fireEvent.click(ui.getByRole('menuitem', { name: 'Select All' }));
    ui.frame();
    const model = editorFor(input());
    expect([model.start, model.end]).toEqual([0, 'hello world'.length]);
  });

  it('copies a link’s address from its menu', () => {
    const { ui, requests } = mount();
    rightClick(ui, ui.getByRole('link', { name: 'Docs' }));
    ui.fireEvent.click(ui.getByRole('menuitem', { name: 'Copy Link' }));
    ui.frame();
    expect(
      requests.filter(request => request.type === 'clipboard').map(request => 'text' in request && request.text)
    ).toEqual(['https://example.test/docs']);
  });

  it('opens nothing over text that is not selected', () => {
    const { ui } = mount();
    rightClick(ui, ui.getByText('plain words'));
    expect(ui.queryByRole('menu')).toBeNull();
  });

  it('opens from the Menu key on a focused field, under its caret', () => {
    const { ui, input } = mount();
    ui.runtime.input.focus.focus(input());
    ui.frame();
    ui.fireEvent.keyDown('ContextMenu');
    ui.frame();

    const menu = ui.getByRole('menu');
    expect(ui.getByRole('menuitem', { name: 'Select All' })).toBeTruthy();
    // From the bottom of the caret, not the field's centre, where a
    // press would land, or the canvas's corner.
    const field = ui.getLayout(input());
    const caret = ui.runtime.input.editing.caretRectOf(input())!;
    const box = ui.getLayout(menu);
    expect([box.x, box.y]).toEqual([field.x + caret.x, field.y + caret.y + caret.height]);
    expect(ui.runtime.input.focus.focusedNode).not.toBe(input());

    // Escape closes it, and the field has its focus back.
    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(ui.queryByRole('menu')).toBeNull();
    expect(ui.runtime.input.focus.focusedNode).toBe(input());
  });

  it('opens a field’s menu when a screen reader asks for it, under its caret', () => {
    const { ui, input } = mount();
    ui.runtime.input.focus.focus(input());
    ui.frame();
    // Found as a reader finds it: through the semantics tree, which an
    // action has to name a record in.
    const textbox = ui.getByRole('textbox', { name: 'Name' });
    expect(textbox).toBe(input());

    ui.runtime.applySemanticsAction({ id: textbox.id, action: 'showMenu' });
    ui.frame();

    expect(ui.getByRole('menuitem', { name: 'Select All' })).toBeTruthy();
    const field = ui.getLayout(input());
    const caret = ui.runtime.input.editing.caretRectOf(input())!;
    const box = ui.getLayout(ui.getByRole('menu'));
    expect([box.x, box.y]).toEqual([field.x + caret.x, field.y + caret.y + caret.height]);
  });

  it('opens a link’s menu when a screen reader asks for it, wherever the focus is', () => {
    const { ui } = mount();
    const link = ui.getByRole('link', { name: 'Docs' });

    ui.runtime.applySemanticsAction({ id: link.id, action: 'showMenu' });
    ui.frame();

    expect(ui.getByRole('menuitem', { name: 'Copy Link' })).toBeTruthy();
    const at = ui.getLayout(link);
    const box = ui.getLayout(ui.getByRole('menu'));
    expect([box.x, box.y]).toEqual([at.x, at.y + at.height]);
  });

  it('opens a focused link’s menu from Shift+F10', () => {
    const { ui } = mount();
    const link = ui.getByRole('link', { name: 'Docs' });
    ui.runtime.input.focus.focus(link);
    ui.frame();
    ui.fireEvent.keyDown('F10', { shift: true });
    ui.frame();
    expect(ui.getByRole('menuitem', { name: 'Copy Link' })).toBeTruthy();
    // From the link's lower left, as a list drops from its control.
    const at = ui.getLayout(link);
    const box = ui.getLayout(ui.getByRole('menu'));
    expect([box.x, box.y]).toEqual([at.x, at.y + at.height]);
  });
});
