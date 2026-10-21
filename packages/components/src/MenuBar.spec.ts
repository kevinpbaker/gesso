import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column } from 'gesso-core';
import { Button } from './Button';
import { MenuBar } from './MenuBar';
import { MENU_SEPARATOR } from './menuBarModel';

type Command = 'light' | 'dark' | 'zoomIn';

const LABELS: Record<Command, string> = {
  light: 'Light',
  dark: 'Dark',
  zoomIn: 'Zoom in'
};

function mount(checkedOf?: (item: Command) => boolean | undefined) {
  const ui = renderTest(
    Column(
      createComponent(MenuBar<Command>, {
        menus: [
          {
            label: 'View',
            entries: ['light', 'dark', MENU_SEPARATOR, 'zoomIn']
          }
        ],
        labelOf: (item: Command) => LABELS[item],
        checkedOf
      })
    ),
    { width: 400, height: 400 }
  );
  ui.fireEvent.focus(ui.getByLabel('Main menu'));
  ui.fireEvent.keyDown('ArrowDown');
  ui.frame();
  const record = (label: string) => [...ui.semanticsTree().values()].find(entry => entry.label === label);
  return { ui, record };
}

describe('MenuBar checkedOf', () => {
  it('makes a setting a menuitemcheckbox, checked when it is on', () => {
    const { record } = mount(item => (item === 'zoomIn' ? undefined : item === 'dark'));

    expect(record('Dark')).toMatchObject({
      role: 'menuitemcheckbox',
      states: ['checked']
    });
    expect(record('Light')?.role).toBe('menuitemcheckbox');
    expect(record('Light')?.states ?? []).not.toContain('checked');
    expect(record('Zoom in')?.role).toBe('menuitem');
  });

  it('reads the setting again each time the menu opens', () => {
    let scheme: Command = 'dark';
    const { ui, record } = mount(item => (item === 'zoomIn' ? undefined : item === scheme));

    scheme = 'light';
    ui.fireEvent.keyDown('Escape');
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();

    expect(record('Light')?.states).toContain('checked');
    expect(record('Dark')?.states ?? []).not.toContain('checked');
  });

  it('draws a tick only on the command that is on, in one column for the whole menu', () => {
    const { ui } = mount(item => (item === 'zoomIn' ? undefined : item === 'dark'));
    const ticks = ui.getAllByText('✓');

    expect(ticks).toHaveLength(1);
    const labels = ['Light', 'Dark', 'Zoom in'].map(label => ui.getLayout(ui.getByText(label)).x);
    expect(new Set(labels).size).toBe(1);
  });

  it('leaves every row a plain menuitem without it', () => {
    const { record } = mount();

    expect(record('Dark')?.role).toBe('menuitem');
    expect(record('Zoom in')?.role).toBe('menuitem');
  });
});

/**
 * A menu longer than the window. Format in a spreadsheet has thirty
 * commands, and in a short window it ran off the bottom: nothing past
 * the edge could be reached, by the pointer or by anything else,
 * because the panel was one column as tall as its rows and nothing
 * told it there was less room than that.
 */
describe('MenuBar in a short window', () => {
  const COUNT = 40;
  const commands = Array.from({ length: COUNT }, (_, at) => `Command ${at + 1}`);

  function open(height: number, entries: readonly (string | typeof MENU_SEPARATOR)[]) {
    const ui = renderTest(
      Column(
        createComponent(MenuBar<string>, {
          menus: [{ label: 'Format', entries }],
          labelOf: (item: string) => item
        })
      ),
      { width: 400, height }
    );
    ui.fireEvent.focus(ui.getByLabel('Main menu'));
    const panel = () => ui.getLayout(ui.getByRole('menu'));
    const row = (label: string) => ui.getVisibleBox(ui.getByLabel(label));
    const title = () => ui.getLayout(ui.getByText('Format'));
    return { ui, panel, row, title };
  }

  it('lays a menu that fits out as it always was', () => {
    const { ui, panel, row, title } = open(400, ['Bold', 'Italic', MENU_SEPARATOR, 'Underline']);
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();

    // Under its title with the 2-pixel offset, as tall as its rows, 4
    // pixels of padding and 1 between each.
    const titleRow = ui.getLayout(ui.getByText('Format').parent!);
    expect(panel().y).toBe(titleRow.y + titleRow.height + 2);
    expect(row('Bold').y).toBe(panel().y + 4);
    expect(row('Italic').y).toBe(row('Bold').y + row('Bold').height + 1);
    // The rule keeps its pixel and its 3 above and below.
    expect(row('Underline').y).toBe(row('Italic').y + row('Italic').height + 1 + 3 + 1 + 3 + 1);
    expect(panel().y + panel().height).toBe(row('Underline').y + row('Underline').height + 4);
    expect(title().y).toBeGreaterThanOrEqual(0);
  });

  it('is cut to the room below its title, and the rest scrolls with the wheel', () => {
    const { ui, panel, row } = open(300, commands);
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();

    expect(panel().y + panel().height).toBe(300);
    const last = row(`Command ${COUNT}`);
    expect(last.y).toBeGreaterThan(300);

    ui.fireEvent.wheel({ x: panel().x + 20, y: panel().y + 100, deltaY: 2000 });
    ui.frame();
    ui.frame(1000);
    const scrolled = row(`Command ${COUNT}`);
    expect(scrolled.y + scrolled.height).toBeLessThanOrEqual(300);
    // The frame held still: the menu is where it was, and its role and
    // its name with it.
    expect(panel().y + panel().height).toBe(300);
    expect(ui.getSemantics(ui.getByRole('menu'))).toMatchObject({ role: 'menu', label: 'Format' });
  });

  it('scrolls the highlighted row into view as the arrows walk past the edge', () => {
    const { ui, panel, row } = open(300, commands);
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    for (let at = 1; at < COUNT; at++) {
      ui.fireEvent.keyDown('ArrowDown');
      ui.frame();
    }

    expect(panel().y + panel().height).toBe(300);
    const last = row(`Command ${COUNT}`);
    expect(last.y).toBeGreaterThanOrEqual(panel().y);
    expect(last.y + last.height).toBeLessThanOrEqual(panel().y + panel().height);
    // And back to the top with Home.
    ui.fireEvent.keyDown('Home');
    ui.frame();
    expect(row('Command 1').y).toBeGreaterThanOrEqual(panel().y);
  });

  it('opens on its last row with that row in view, from ArrowUp on the bar', () => {
    const { ui, panel, row } = open(300, commands);
    ui.fireEvent.keyDown('ArrowUp');
    ui.frame();
    ui.frame();

    expect(panel().y + panel().height).toBe(300);
    const last = row(`Command ${COUNT}`);
    expect(last.y + last.height).toBeLessThanOrEqual(panel().y + panel().height);
  });
});

describe('MenuBar under the keyboard, with nothing open', () => {
  function bar(said: string[] = [], direction: 'ltr' | 'rtl' = 'ltr') {
    const ui = renderTest(
      Column(
        { textDirection: direction },
        createComponent(MenuBar<string>, {
          menus: [
            { label: 'File', entries: ['New', 'Open'] },
            { label: 'Edit', entries: ['Undo', 'Redo'] },
            { label: 'View', entries: ['Zoom'] }
          ],
          labelOf: (item: string) => item,
          onChoose: (item: string) => said.push(`chose ${item}`),
          onDismiss: () => said.push('dismissed')
        })
      ),
      { width: 400, height: 400 }
    );
    const ringed = () =>
      ['File', 'Edit', 'View'].filter(
        title => ui.getByText(title).parent!.properties.get('borderColor') === 'focusRing'
      );
    return { ui, ringed };
  }

  it('marks the title the arrows are on', () => {
    // Left and Right moved the bar's focus between titles with nothing
    // on screen to say so: the title was lit only while its menu was
    // open or the pointer was on it.
    const { ui, ringed } = bar();
    expect(ringed()).toEqual([]);
    ui.fireEvent.tab();
    ui.frame();
    expect(ringed()).toEqual(['File']);
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(ringed()).toEqual(['Edit']);
    // Gone with the focus.
    ui.fireEvent.blur();
    ui.frame();
    expect(ringed()).toEqual([]);
  });

  it('walks toward the arrow under right to left, so Left is the next title', () => {
    // The titles run from the right, so the next one is to the left.
    // Left and Right still walked in reading order, which put the ring
    // on the title away from the arrow.
    const { ui, ringed } = bar([], 'rtl');
    expect(ui.getLayout(ui.getByText('Edit')).x).toBeLessThan(ui.getLayout(ui.getByText('File')).x);
    ui.fireEvent.tab();
    ui.frame();
    ui.fireEvent.keyDown('ArrowLeft');
    ui.frame();
    expect(ringed()).toEqual(['Edit']);
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(ringed()).toEqual(['File']);

    // Open, the same arrows walk from menu to menu.
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    ui.fireEvent.keyDown('ArrowLeft');
    ui.frame();
    expect(ui.getByRole('menuitem', { name: 'Undo' })).toBeTruthy();
  });

  it('dismisses after a choice made with the pointer, as after one made with the keys', () => {
    // The docs say choosing is followed by `onDismiss`; a click on a row
    // reported the choice and never gave the keyboard back.
    const said: string[] = [];
    const { ui } = bar(said);
    ui.fireEvent.click(ui.getByText('Edit').parent!);
    ui.frame();
    ui.fireEvent.click(ui.getByRole('menuitem', { name: 'Redo' }));
    ui.frame();
    expect(said).toEqual(['chose Redo', 'dismissed']);

    said.length = 0;
    ui.fireEvent.focus(ui.getByLabel('Main menu'));
    ui.fireEvent.keyDown('ArrowDown');
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(said).toEqual(['chose Undo', 'dismissed']);
  });
});

describe('MenuBar reached from elsewhere in the application', () => {
  /**
   * A button with focus, and a bar beside it. The bar's keys are heard
   * at the root, so nothing here focuses the bar first: that is the gap
   * these close. `altKey` is given outright in most of them so the
   * result does not hang on which platform the test runner reports.
   */
  function app(options: { altKey?: boolean; f10Key?: boolean } = { altKey: true }) {
    const said: string[] = [];
    const ui = renderTest(
      Column(
        createComponent(Button, { label: 'Elsewhere' }),
        createComponent(MenuBar<string>, {
          menus: [
            { label: 'File', mnemonic: 'f', entries: ['New', 'Open'] },
            { label: 'Edit', mnemonic: 'e', entries: ['Undo', 'Redo'] }
          ],
          labelOf: (item: string) => item,
          onChoose: (item: string) => said.push(`chose ${item}`),
          onDismiss: () => said.push('dismissed'),
          ...options
        })
      ),
      { width: 400, height: 400 }
    );
    const elsewhere = ui.getByRole('button', { name: 'Elsewhere' });
    const bar = ui.getByLabel('Main menu');
    ui.fireEvent.focus(elsewhere);
    ui.frame();
    const ringed = () =>
      ['File', 'Edit'].filter(title => ui.getByText(title).parent!.properties.get('borderColor') === 'focusRing');
    const open = () => ui.queryByRole('menu');
    return { ui, said, elsewhere, bar, ringed, open };
  }

  it('takes focus on F10 and gives it back on a second F10', () => {
    const { ui, elsewhere, bar, ringed } = app();
    ui.fireEvent.keyDown('F10');
    ui.frame();
    expect(bar).toHaveFocus();
    expect(ringed()).toEqual(['File']);

    ui.fireEvent.keyDown('F10');
    ui.frame();
    expect(elsewhere).toHaveFocus();
  });

  it('gives focus back on Escape, after closing an open menu first', () => {
    const { ui, elsewhere, bar, open } = app();
    ui.fireEvent.keyDown('F10');
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    expect(open()).not.toBeNull();

    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(open()).toBeNull();
    expect(bar).toHaveFocus();

    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(elsewhere).toHaveFocus();
  });

  it('comes back to the title it was left on', () => {
    const { ui, ringed } = app();
    ui.fireEvent.keyDown('F10');
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('F10');
    ui.fireEvent.keyDown('F10');
    ui.frame();
    expect(ringed()).toEqual(['Edit']);
  });

  it('gives focus back after a command is chosen', () => {
    const { ui, said, elsewhere } = app();
    ui.fireEvent.keyDown('F10');
    ui.fireEvent.keyDown('ArrowDown');
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(said).toEqual(['chose New', 'dismissed']);
    expect(elsewhere).toHaveFocus();
  });

  it('takes and gives back focus on Alt pressed and released alone', () => {
    const { ui, elsewhere, bar } = app();
    ui.fireEvent.keyDown('Alt', { alt: true });
    ui.fireEvent.keyUp('Alt');
    ui.frame();
    expect(bar).toHaveFocus();

    ui.fireEvent.keyDown('Alt', { alt: true });
    ui.fireEvent.keyUp('Alt');
    ui.frame();
    expect(elsewhere).toHaveFocus();
  });

  it('leaves Alt alone when another key came between, which makes it a chord', () => {
    const { ui, elsewhere } = app();
    ui.fireEvent.keyDown('Alt', { alt: true });
    ui.fireEvent.keyDown('ArrowLeft', { alt: true });
    ui.fireEvent.keyUp('ArrowLeft', { alt: true });
    ui.fireEvent.keyUp('Alt');
    ui.frame();
    expect(elsewhere).toHaveFocus();
  });

  it('opens the menu a mnemonic names on Alt and its letter, from anywhere', () => {
    const { ui, bar, open, said, elsewhere } = app();
    ui.fireEvent.keyDown('Alt', { alt: true });
    ui.fireEvent.keyDown('e', { alt: true }, { code: 'KeyE' });
    ui.fireEvent.keyUp('e', { alt: true }, { code: 'KeyE' });
    ui.fireEvent.keyUp('Alt');
    ui.frame();
    expect(bar).toHaveFocus();
    expect(open()).not.toBeNull();
    expect(ui.getSemantics(open()!).label).toBe('Edit');
    expect(said).toEqual([]);

    ui.fireEvent.keyDown('Escape');
    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(elsewhere).toHaveFocus();
  });

  it('can be told to leave Alt to the application', () => {
    const { ui, elsewhere, open } = app({ altKey: false });
    ui.fireEvent.keyDown('Alt', { alt: true });
    ui.fireEvent.keyUp('Alt');
    ui.fireEvent.keyDown('e', { alt: true }, { code: 'KeyE' });
    ui.frame();
    expect(elsewhere).toHaveFocus();
    expect(open()).toBeNull();
  });

  it('can be told to leave F10 to the application', () => {
    const { ui, elsewhere } = app({ f10Key: false });
    ui.fireEvent.keyDown('F10');
    ui.frame();
    expect(elsewhere).toHaveFocus();
  });

  it('leaves F10 with a modifier alone: Shift+F10 is a context menu', () => {
    const { ui, elsewhere } = app();
    ui.fireEvent.keyDown('F10', { shift: true });
    ui.frame();
    expect(elsewhere).toHaveFocus();
  });
});
