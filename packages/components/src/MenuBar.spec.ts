import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Column } from 'gesso-core';
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
