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
