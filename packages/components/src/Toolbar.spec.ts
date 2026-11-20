import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Box, Row } from 'gesso-core';
import { Toolbar } from './Structure';
import type { ToolbarItem } from './ToolbarItems';

/**
 * A toolbar given `items` draws its own buttons: one tab stop the
 * arrows walk, a tooltip with each tool's shortcut, and the tools past
 * its width folded into a ⋯ menu. Calcwright's drawing toolbar was
 * hand-built at a fixed 460 px and ran past the page on a drawing near
 * its right edge.
 */
const TOOLS: ToolbarItem[] = [
  { value: 'choose', label: 'Choose', shortcut: 'V' },
  { value: 'line', label: 'Line', shortcut: 'L', separator: true },
  { value: 'rect', label: 'Rectangle', shortcut: 'R' },
  { value: 'circle', label: 'Circle', shortcut: 'O' },
  { value: 'text', label: 'Text', shortcut: 'T', separator: true },
  { value: 'dimension', label: 'Dimension', shortcut: 'D' }
];

function icon() {
  return Box({ width: 18, height: 18, backgroundColor: 'text' });
}

function mount(
  options: { width?: number | BehaviorSubject<number>; items?: ToolbarItem[] | BehaviorSubject<ToolbarItem[]> } = {}
) {
  const chosen: string[] = [];
  const items = options.items ?? TOOLS.map(tool => ({ ...tool, icon }));
  const ui = renderTest(
    Row(
      { width: 600 },
      createComponent(Toolbar, {
        label: 'Drawing tools',
        items,
        maxWidth: options.width,
        shortcutBadges: true,
        onSelect: (value: string) => chosen.push(value)
      })
    ),
    { width: 600, height: 300 }
  );
  const buttons = () => ui.getAllByRole('button');
  const names = () => buttons().map(node => ui.getSemantics(node).label);
  return { ui, chosen, buttons, names };
}

describe('Toolbar items', () => {
  it('draws every tool when there is room, named and with its shortcut', () => {
    const { ui, names, buttons } = mount();
    expect(names()).toEqual(['Choose', 'Line', 'Rectangle', 'Circle', 'Text', 'Dimension']);
    expect(ui.getSemantics(buttons()[2]).description).toBe('Shortcut: R');
    expect(ui.getAllByRole('separator')).toHaveLength(2);
  });

  it('folds the tools that do not fit into a ⋯ menu at its end', () => {
    // Six 28 px buttons, two rules and the gaps want about 200 px.
    const { ui, names } = mount({ width: 140 });
    const shown = names();
    expect(shown.at(-1)).toBe('More');
    expect(shown.length).toBeLessThan(7);
    expect(shown.slice(0, -1)).toEqual(TOOLS.map(tool => tool.label).slice(0, shown.length - 1));
    const toolbar = ui.getByRole('toolbar');
    expect(ui.getLayout(toolbar).width).toBeLessThanOrEqual(140);
  });

  it('brings tools back onto the bar when it is given room again', () => {
    const width = new BehaviorSubject(140);
    const { ui, names } = mount({ width });
    expect(names().at(-1)).toBe('More');
    width.next(400);
    ui.frame();
    ui.frame();
    expect(names()).toEqual(TOOLS.map(tool => tool.label));
    width.next(120);
    ui.frame();
    ui.frame();
    expect(names().at(-1)).toBe('More');
  });

  it('lists the folded tools in the ⋯ menu, and choosing one selects it', () => {
    const { ui, names, chosen } = mount({ width: 140 });
    const onBar = names().length - 1;
    ui.fireEvent.click(ui.getByLabel('More'));
    ui.frame();
    const rows = ui.getAllByRole('menuitem').map(node => ui.getSemantics(node).label);
    expect(rows).toEqual(TOOLS.slice(onBar).map(tool => `${tool.label}, ${tool.shortcut}`));
    ui.fireEvent.click(ui.getAllByRole('menuitem').at(-1)!);
    expect(chosen).toEqual(['dimension']);
  });

  it('is one tab stop whose arrows walk the buttons, ⋯ included', () => {
    const { ui, buttons } = mount({ width: 140 });
    const all = buttons();
    ui.fireEvent.focus(all[0]);
    ui.fireEvent.keyDown('ArrowRight');
    expect(ui.runtime.input.focus.focusedNode).toBe(all[1]);
    ui.fireEvent.keyDown('End');
    expect(ui.getSemantics(ui.runtime.input.focus.focusedNode!).label).toBe('More');
    ui.fireEvent.keyDown('ArrowRight');
    expect(ui.runtime.input.focus.focusedNode).toBe(all[0]);
    // Only the focused button is a tab stop.
    const stops = all.filter(node => node.getProperty('tabStop') !== false);
    expect(stops).toEqual([all[0]]);
  });

  it('presses a tool with Enter, and a pressed tool says so without losing focus', () => {
    const items = new BehaviorSubject<ToolbarItem[]>(TOOLS);
    const { ui, chosen, buttons } = mount({ items });
    const line = buttons()[1];
    ui.fireEvent.focus(line);
    ui.fireEvent.keyDown('Enter');
    expect(chosen).toEqual(['line']);
    items.next(TOOLS.map(tool => ({ ...tool, pressed: tool.value === 'line' })));
    ui.frame();
    expect(ui.getSemantics(line).states).toContain('pressed');
    expect(ui.runtime.input.focus.focusedNode).toBe(line);
  });

  it("draws a short shortcut in its own button's corner", () => {
    const { ui, buttons } = mount();
    const rect = buttons()[2];
    const badge = ui.getByText('R');
    const box = ui.getLayout(rect);
    const mark = ui.getLayout(badge);
    expect(mark.x).toBeGreaterThan(box.x);
    expect(mark.x + mark.width).toBeLessThanOrEqual(box.x + box.width);
    expect(mark.y + mark.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
  });

  it('a toolbar with children and no items is the plain row it was', () => {
    const ui = renderTest(createComponent(Toolbar, { label: 'Plain', children: Box({ width: 20, height: 20 }) }), {
      width: 300,
      height: 100
    });
    expect(ui.queryByRole('button')).toBeNull();
    expect(ui.getSemantics(ui.getByRole('toolbar')).label).toBe('Plain');
  });
});
