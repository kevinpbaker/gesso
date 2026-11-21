import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Workspace } from './ContextMenusExample';

const SIZE = { width: 460, height: 340 };

const mount = () => {
  const ui = renderTest(createComponent(Workspace, {}), SIZE);
  ui.frame();
  return ui;
};

/** The items the open menu is showing, in order. */
const items = (ui: Rendered) => ui.getAllByRole('menuitem').map(node => ui.getSemantics(node).label);

/**
 * The page claims the field, the selected text and the link get the
 * browser's menus from `ContextMenus`, that the file row's own
 * `contextMenu` answers first, that the Menu key and Shift+F10 ask the
 * focused node for the same menu a right-click does, from under a
 * field's caret or a node's lower left, and that a right-click on
 * nothing in particular opens nothing. Each is a test.
 */
describe('the docs context menus example', () => {
  it('opens the row’s own menu on a right-click, not the browser’s', () => {
    const ui = mount();
    const row = ui.getByLabel('report.pdf');
    const box = ui.getLayout(row);

    ui.fireEvent.contextMenu(row, { x: box.x + 30, y: box.y + 10 });
    ui.frame();

    expect(items(ui)).toEqual(['Open', 'Rename', 'Delete']);
    const menu = ui.getLayout(ui.getByRole('menu'));
    expect([menu.x, menu.y]).toEqual([box.x + 30, box.y + 10]);
  });

  it('opens the same menu from the Menu key on the focused row, from its lower left, and chooses with Enter', () => {
    const ui = mount();
    const row = ui.getByLabel('report.pdf');
    ui.runtime.input.focus.focus(row);
    ui.frame();

    ui.fireEvent.keyDown('ContextMenu');
    ui.frame();

    expect(items(ui)).toEqual(['Open', 'Rename', 'Delete']);
    const box = ui.getLayout(row);
    const menu = ui.getLayout(ui.getByRole('menu'));
    expect([menu.x, menu.y]).toEqual([box.x, box.y + box.height]);

    ui.fireEvent.keyDown('ArrowDown');
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(ui.queryByRole('menu')).toBeNull();
    expect(ui.getByText('Chose rename on report.pdf.')).toBeTruthy();
  });

  it('gives the focused field its editing menu from Shift+F10, under the caret', () => {
    const ui = mount();
    const field = ui.getByRole('textbox', { name: 'Title' });
    ui.runtime.input.focus.focus(field);
    ui.frame();

    ui.fireEvent.keyDown('F10', { shift: true });
    ui.frame();

    expect(items(ui)).toEqual(['Cut', 'Copy', 'Paste', 'Select All']);
    const caret = ui.runtime.input.editing.caretRectOf(field)!;
    const box = ui.getLayout(field);
    const menu = ui.getLayout(ui.getByRole('menu'));
    expect([menu.x, menu.y]).toEqual([box.x + caret.x, box.y + caret.y + caret.height]);
  });

  it('gives the focused link its menu from the keyboard', () => {
    const ui = mount();
    ui.runtime.input.focus.focus(ui.getByRole('link', { name: 'The Menu component' }));
    ui.frame();

    ui.fireEvent.keyDown('ContextMenu');
    ui.frame();

    expect(items(ui)).toEqual(['Open Link in New Tab', 'Copy Link']);
  });

  it('offers Copy for selected words from the keyboard with nothing focused, from the sentence', () => {
    const ui = mount();
    const sentence = ui.getByText('Select a few words of this sentence, then ask for a menu over them.');
    ui.runtime.input.selection.selectRange(sentence, 0, 'Select a few words'.length);
    ui.frame();
    expect(ui.runtime.input.focus.focusedNode).toBeNull();

    ui.fireEvent.keyDown('ContextMenu');
    ui.frame();

    expect(items(ui)).toEqual(['Copy']);
    const box = ui.getLayout(sentence);
    const menu = ui.getLayout(ui.getByRole('menu'));
    expect([menu.x, menu.y]).toEqual([box.x, box.y + box.height]);
  });

  it('opens nothing over text that is not selected', () => {
    const ui = mount();
    const sentence = ui.getByText('Select a few words of this sentence, then ask for a menu over them.');
    const box = ui.getLayout(sentence);

    ui.fireEvent.contextMenu(sentence, { x: box.x + 4, y: box.y + 4 });
    ui.frame();

    expect(ui.queryByRole('menu')).toBeNull();
  });
});
