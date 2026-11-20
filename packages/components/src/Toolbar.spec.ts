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
  options: {
    width?: number | BehaviorSubject<number>;
    items?: ToolbarItem[] | BehaviorSubject<ToolbarItem[]>;
    wrap?: boolean;
  } = {}
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
        wrap: options.wrap,
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

  it('says when focus comes into it or its ⋯ menu, and when it leaves', () => {
    const seen: boolean[] = [];
    const ui = renderTest(
      Row(
        { width: 600 },
        createComponent(Toolbar, {
          label: 'Tools',
          items: TOOLS.map(tool => ({ ...tool, icon })),
          maxWidth: 140,
          keepFocus: true,
          onFocusChange: (on: boolean) => seen.push(on)
        }),
        Box({ focusable: true, label: 'Canvas', width: 50, height: 50 })
      ),
      { width: 600, height: 300 }
    );
    const canvas = ui.getByLabel('Canvas');
    ui.fireEvent.focus(canvas);
    // ⋯ pressed with the pointer: focus stays on the canvas until the menu takes it.
    const more = ui.getByLabel('More');
    const at = ui.getVisibleBox(more);
    ui.fireEvent.pointerDown(at.x + 4, at.y + 4);
    ui.fireEvent.pointerUp(at.x + 4, at.y + 4);
    ui.frame();
    expect(ui.getAllByRole('menuitem').length).toBeGreaterThan(0);
    expect(seen).toEqual([true]);
    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(seen).toEqual([true, false]);
    expect(ui.runtime.input.focus.focusedNode).toBe(canvas);
    ui.fireEvent.focus(ui.getAllByRole('button')[0]!);
    ui.fireEvent.focus(canvas);
    expect(seen).toEqual([true, false, true, false]);
  });

  it('chooses a tool on a mouse press that leaves focus where it was', () => {
    const chosen: string[] = [];
    const ui = renderTest(
      Row(
        { width: 600 },
        createComponent(Toolbar, {
          label: 'Tools',
          items: TOOLS.map(tool => ({ ...tool, icon })),
          keepFocus: true,
          onSelect: (value: string) => chosen.push(value)
        }),
        Box({ focusable: true, label: 'Canvas', width: 50, height: 50 })
      ),
      { width: 600, height: 300 }
    );
    const canvas = ui.getByLabel('Canvas');
    ui.fireEvent.focus(canvas);
    const rect = ui.getVisibleBox(ui.getByLabel('Rectangle'));
    ui.fireEvent.pointerDown(rect.x + 10, rect.y + 10);
    ui.fireEvent.pointerUp(rect.x + 10, rect.y + 10);
    expect(chosen).toEqual(['rect']);
    expect(ui.runtime.input.focus.focusedNode).toBe(canvas);
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

/**
 * `wrap`: the tools go onto more rows instead of into the ⋯ menu.
 * Calcwright docked its drawing tools in a 456 px inspector as three
 * toolbars, because one folded its tools away; that was three tab
 * stops, and the arrows stopped at each one's end.
 */
describe('Toolbar wrap', () => {
  /** The buttons' rows, by their tops, top first. */
  function rows(ui: ReturnType<typeof mount>['ui'], all: ReturnType<ReturnType<typeof mount>['buttons']>) {
    const tops = [...new Set(all.map(node => Math.round(ui.getLayout(node).y)))].sort((a, b) => a - b);
    return tops.map(top => all.filter(node => Math.round(ui.getLayout(node).y) === top));
  }

  it('wraps the tools onto more rows within its width, and folds none', () => {
    const { ui, names, buttons } = mount({ width: 140, wrap: true });
    expect(names()).toEqual(TOOLS.map(tool => tool.label));
    expect(ui.queryByLabel('More')).toBeNull();
    const toolbar = ui.getLayout(ui.getByRole('toolbar'));
    expect(toolbar.width).toBeLessThanOrEqual(140);
    const lines = rows(ui, buttons());
    expect(lines.length).toBeGreaterThan(1);
    for (const node of buttons()) {
      const box = ui.getLayout(node);
      expect(box.x + box.width).toBeLessThanOrEqual(toolbar.x + toolbar.width + 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(toolbar.y + toolbar.height + 0.5);
    }
  });

  it('is one row when there is room', () => {
    const { ui, buttons } = mount({ wrap: true });
    expect(rows(ui, buttons())).toHaveLength(1);
  });

  it('rewraps when its width changes, still with no ⋯', () => {
    const width = new BehaviorSubject(400);
    const { ui, buttons, names } = mount({ width, wrap: true });
    expect(rows(ui, buttons())).toHaveLength(1);
    width.next(100);
    ui.frame();
    ui.frame();
    expect(rows(ui, buttons()).length).toBeGreaterThan(1);
    expect(names()).toEqual(TOOLS.map(tool => tool.label));
  });

  it('is one tab stop whose Left and Right walk every tool across the rows', () => {
    const { ui, buttons } = mount({ width: 140, wrap: true });
    const all = buttons();
    const [first, second] = rows(ui, all);
    ui.fireEvent.focus(first.at(-1)!);
    ui.fireEvent.keyDown('ArrowRight');
    expect(ui.runtime.input.focus.focusedNode).toBe(second[0]);
    ui.fireEvent.keyDown('ArrowLeft');
    expect(ui.runtime.input.focus.focusedNode).toBe(first.at(-1));
    ui.fireEvent.keyDown('End');
    expect(ui.runtime.input.focus.focusedNode).toBe(all.at(-1));
    ui.fireEvent.keyDown('ArrowRight');
    expect(ui.runtime.input.focus.focusedNode).toBe(all[0]);
    expect(all.filter(node => node.getProperty('tabStop') !== false)).toEqual([all[0]]);
  });

  it('moves between rows with Up and Down, to the nearest tool', () => {
    const { ui, buttons } = mount({ width: 140, wrap: true });
    const [first, second] = rows(ui, buttons());
    const middle = (node: (typeof first)[number]) => {
      const box = ui.getLayout(node);
      return box.x + box.width / 2;
    };
    const nearest = (from: (typeof first)[number], row: typeof first) =>
      row.reduce((best, node) =>
        Math.abs(middle(node) - middle(from)) < Math.abs(middle(best) - middle(from)) ? node : best
      );
    ui.fireEvent.focus(first[0]);
    ui.fireEvent.keyDown('ArrowDown');
    expect(ui.runtime.input.focus.focusedNode).toBe(nearest(first[0], second));
    ui.fireEvent.focus(second.at(-1)!);
    ui.fireEvent.keyDown('ArrowUp');
    expect(ui.runtime.input.focus.focusedNode).toBe(nearest(second.at(-1)!, first));
    // No row above the first: the key is left alone.
    ui.fireEvent.focus(first[0]);
    ui.fireEvent.keyDown('ArrowUp');
    expect(ui.runtime.input.focus.focusedNode).toBe(first[0]);
  });

  it('without wrap, the same width still folds into ⋯', () => {
    const { names } = mount({ width: 140 });
    expect(names().at(-1)).toBe('More');
  });
});
