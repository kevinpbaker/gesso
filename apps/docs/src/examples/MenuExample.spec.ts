import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Menu, type MenuItem } from '@gesso/components';
import { OverlayService, createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Commands } from './MenuExample';

const SIZE = { width: 460, height: 340 };

const mount = () => renderTest(createComponent(Commands, {}), SIZE);

const entries = (ui: Rendered) => ui.runtime.services.get(OverlayService).entries.value;

/** The items the menu is showing, in order. */
const items = (ui: Rendered) => ui.getAllByRole('menuitem').map(node => ui.getSemantics(node).label);

/** The row the highlight is painted on, read off its background colour. */
function highlighted(ui: Rendered): string[] {
  return ui
    .getAllByRole('menuitem')
    .filter(node => node.properties.get('backgroundColor') === 'controlBackgroundHovered')
    .map(node => ui.getSemantics(node).label ?? '');
}

/**
 * The page claims a menu draws nothing where it is declared, hangs off
 * an anchor cell or off a point, traps the keyboard, walks its items
 * with the arrows and Home and End over anything disabled, chooses
 * with Enter and Space, closes on Escape, and announces a `menu` of
 * `menuitem`s with no highlight in the semantics. Each is a test.
 */
describe('the docs menu example', () => {
  it('draws nothing until it is opened, then draws in the overlay layer', () => {
    const ui = mount();

    expect(ui.queryByRole('menu')).toBeNull();
    expect(entries(ui)).toHaveLength(0);

    ui.fireEvent.click(ui.getByLabel('Actions'));
    ui.frame();

    expect(entries(ui)).toHaveLength(1);
    expect(items(ui)).toEqual(['Rename', 'Duplicate', 'Move to folder', 'Archive']);
  });

  it('hangs off the anchor the ref wrote into the cell', () => {
    const ui = mount();
    const button = ui.getByLabel('Actions');

    ui.fireEvent.click(button);
    ui.frame();

    const entry = entries(ui)[0];
    // The cell followed the ref, so the menu has a real anchor rather
    // than the null a plain field would still be holding.
    expect(entry.anchor).toBe(button);
    expect(entry.placement).toBe('bottom-start');
    expect(entry.offset).toBe(4);
    // Anchored, so the anchor is also what the layer re-provides the
    // theme from.
    expect(entry.environment).toBe(button);
  });

  it('opens at the point a context menu was asked for', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByLabel('The note'), { x: 120, y: 200 });
    ui.frame();

    const entry = entries(ui)[0];
    expect(entry.left).toBe(120);
    expect(entry.top).toBe(200);
    expect(entry.anchor ?? null).toBeNull();
    expect(items(ui)).toEqual(['Copy', 'Cut', 'Paste']);
  });

  it('takes the keyboard, and walks only the items that can be chosen', () => {
    const ui = mount();
    ui.fireEvent.click(ui.getByLabel('Actions'));
    ui.frame();

    expect(ui.runtime.input.focus.trapped).toBe(true);
    expect(highlighted(ui)).toEqual(['Rename']);

    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Duplicate']);

    // Archive is disabled, so the walk is three long and wraps here.
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Move to folder']);
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Rename']);

    ui.fireEvent.keyDown('ArrowUp');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Move to folder']);
  });

  it('answers Home and End with the first and last item that can be chosen', () => {
    const ui = mount();
    ui.fireEvent.click(ui.getByLabel('Actions'));
    ui.frame();

    ui.fireEvent.keyDown('End');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Move to folder']);

    ui.fireEvent.keyDown('Home');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Rename']);
  });

  it('chooses with Enter and closes', () => {
    const ui = mount();
    ui.fireEvent.click(ui.getByLabel('Actions'));
    ui.frame();

    ui.fireEvent.keyDown('ArrowDown');
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    expect(ui.getByText('Chose duplicate from Actions.')).toBeDefined();
    expect(entries(ui)).toHaveLength(0);
    expect(ui.runtime.input.focus.trapped).toBe(false);
  });

  it('chooses with Space as well', () => {
    const ui = mount();
    ui.fireEvent.click(ui.getByLabel('Actions'));
    ui.frame();

    ui.fireEvent.keyDown(' ');
    ui.frame();

    expect(ui.getByText('Chose rename from Actions.')).toBeDefined();
    expect(entries(ui)).toHaveLength(0);
  });

  it('closes on Escape without choosing', () => {
    const ui = mount();
    ui.fireEvent.click(ui.getByLabel('Actions'));
    ui.frame();

    ui.fireEvent.keyDown('Escape');
    ui.frame();

    expect(entries(ui)).toHaveLength(0);
    expect(ui.getByText('Nothing chosen yet.')).toBeDefined();
  });

  it('chooses an item on a click, and refuses a disabled one', () => {
    const ui = mount();
    ui.fireEvent.click(ui.getByLabel('Actions'));
    ui.frame();

    // Disabled, so the row and everything under it is inert: the
    // record carries `disabled` rather than the item being missing.
    expect(ui.getSemantics(ui.getByRole('menuitem', { name: 'Archive' })).disabled).toBe(true);

    ui.fireEvent.click(ui.getByRole('menuitem', { name: 'Move to folder' }));
    ui.frame();

    expect(ui.getByText('Chose move from Actions.')).toBeDefined();
    expect(entries(ui)).toHaveLength(0);
  });

  it('says it is a menu of menu items, and says nothing about the highlight', () => {
    const ui = mount();
    ui.fireEvent.click(ui.getByLabel('Actions'));
    ui.frame();

    expect(ui.getByRole('menu')).toHaveSemantics({ role: 'menu', name: 'Actions' });

    const record = ui.getSemantics(ui.getByRole('menuitem', { name: 'Rename' }));
    expect(record.role).toBe('menuitem');
    // The highlight is a background colour and nothing else: no
    // `selected`, no position in the set, so nothing announces
    // "2 of 4" or claims an item is chosen before it is.
    expect(record.states).toBeUndefined();
    expect(record.posInSet).toBeUndefined();
    expect(record.setSize).toBeUndefined();

    // An item's text is *not* claimed by the item, unlike a tab's or
    // an option's: `menuitem` is missing from the roles whose children
    // are presentational, so the text has a record of its own and the
    // name is on the tree twice. Asserted so the page can say so.
    expect(ui.querySemantics(ui.getByText('Rename'))?.label).toBe('Rename');
  });

  it('reports a close exactly once, on every path that closes it', () => {
    const open = new BehaviorSubject(false);
    const seen: boolean[] = [];
    const list: readonly MenuItem[] = [
      { value: 'one', label: 'One' },
      { value: 'two', label: 'Two' }
    ];
    const ui = renderTest(
      createComponent(Menu, {
        open,
        items: list,
        onSelect: () => {},
        onOpenChange: (next: boolean) => {
          seen.push(next);
          open.next(next);
        }
      }),
      SIZE
    );

    // Choosing an item closes the menu, and reports the close once.
    open.next(true);
    ui.frame();
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(seen).toEqual([false]);

    // Escape closes it, and reports once again. It is never called
    // with `true`; the caller does the opening.
    open.next(true);
    ui.frame();
    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(seen).toEqual([false, false]);

    // And so does a close the application asked for itself.
    open.next(true);
    ui.frame();
    open.next(false);
    ui.frame();
    expect(seen).toEqual([false, false, false]);
    expect(entries(ui)).toHaveLength(0);
  });

  it('highlights the item Enter would choose, wherever the disabled one sits', () => {
    const open = new BehaviorSubject(false);
    const chosen: string[] = [];
    const list: readonly MenuItem[] = [
      { value: 'archive', label: 'Archive', disabled: true },
      { value: 'rename', label: 'Rename' },
      { value: 'delete', label: 'Delete' }
    ];
    const ui = renderTest(
      createComponent(Menu, {
        open,
        items: list,
        onSelect: (value: string) => chosen.push(value),
        onOpenChange: (next: boolean) => open.next(next)
      }),
      SIZE
    );

    open.next(true);
    ui.frame();

    // Archive is disabled and first, so the highlight opens on Rename
    // rather than on the row nothing can choose, and Enter takes the
    // row the highlight is painted on.
    expect(highlighted(ui)).toEqual(['Rename']);
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Delete']);

    // Wrapping steps over Archive in both directions.
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Rename']);
    ui.fireEvent.keyDown('ArrowUp');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Delete']);

    // Home and End answer with the ends of what can be chosen.
    ui.fireEvent.keyDown('Home');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Rename']);
    ui.fireEvent.keyDown('End');
    ui.frame();
    expect(highlighted(ui)).toEqual(['Delete']);

    ui.fireEvent.keyDown('Home');
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(chosen).toEqual(['rename']);
  });

  it('refuses a disabled item, even on a click', () => {
    const open = new BehaviorSubject(false);
    const chosen: string[] = [];
    const list: readonly MenuItem[] = [
      { value: 'archive', label: 'Archive', disabled: true },
      { value: 'rename', label: 'Rename' }
    ];
    const ui = renderTest(
      createComponent(Menu, {
        open,
        items: list,
        onSelect: (value: string) => chosen.push(value),
        onOpenChange: (next: boolean) => open.next(next)
      }),
      SIZE
    );

    open.next(true);
    ui.frame();
    ui.fireEvent.click(ui.getByRole('menuitem', { name: 'Archive' }));
    ui.frame();

    expect(chosen).toEqual([]);
    expect(entries(ui)).toHaveLength(1);
  });
});
