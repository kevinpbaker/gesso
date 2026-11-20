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

const labels = (rows: ReturnType<typeof menuFor>) => rows.filter(row => !row.separator).map(row => row.label);
const disabled = (rows: ReturnType<typeof menuFor>) => rows.filter(row => row.disabled === true).map(row => row.label);

describe('menuFor', () => {
  it('offers a field Cut, Copy, Paste and Select All, cutting and copying only a selection', () => {
    expect(labels(menuFor(field(), null, 'hi'))).toEqual(['Cut', 'Copy', 'Paste', 'Select All']);
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
});
