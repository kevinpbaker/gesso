import { afterEach, describe, expect, it, vi } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import { Box, Column, Text, UiGraph, type UiNode } from 'gesso-core';

import { Combobox, type ComboboxOption } from './Combobox';
import { DataTable, type DataColumn } from './DataTable';
import { LazyList } from './LazyList';
import { Tree, type TreeNode } from './Tree';

/**
 * Budgets for moving a selection, or a pointer, over a list.
 *
 * The risk is a row reading its own slice of one shared value through
 * a pipe of its own. Moving the highlight between two rows then runs
 * every visible row's pipes and writes every visible row's properties,
 * so an arrow key costs the height of the viewport rather than the two
 * rows it actually changed. `states` made it worse: a fresh array per
 * emission is never equal to the last, so every row was dirtied too.
 *
 * Counted as the graph sees it: every property write a binding hands
 * `UiGraph.updateNodeProperty` during the move, and the nodes those
 * writes land on. Each list is measured short and tall, and the claim
 * is that the two counts are the same: work proportional to the change,
 * not to the screen. Counts and not timings, in the shape
 * `form.budget.spec.ts` and the framework's budgets set.
 */

/** The properties a row's selection and hover are drawn with. */
const ROW_PROPERTIES = new Set(['states', 'backgroundColor', 'color']);

let ui: Rendered | null = null;
afterEach(() => {
  ui?.unmount();
  ui = null;
  vi.restoreAllMocks();
});

/** The row-state writes `act` causes, and how many nodes they reach. */
function measure(rendered: Rendered, act: () => void): { writes: number; nodes: number } {
  const touched = new Set<UiNode>();
  let writes = 0;
  const spy = vi
    .spyOn(UiGraph.prototype, 'updateNodeProperty')
    .mockImplementation(function (this: UiGraph, node, property, value, flags) {
      if (ROW_PROPERTIES.has(property)) {
        writes++;
        touched.add(node);
      }
      return UiGraph.prototype.updateNodePropertyNow.call(this, node, property, value, flags);
    });
  act();
  rendered.frame();
  spy.mockRestore();
  return { writes, nodes: touched.size };
}

/** Mounts a list showing `rows` rows, focuses it, and measures one ArrowDown. */
function arrowDown(build: (rows: number) => Parameters<typeof renderTest>[0], role: string, rows: number) {
  const rendered = renderTest(build(rows), { width: 400, height: 2000 });
  ui = rendered;
  rendered.fireEvent.focus(rendered.getAllByRole(role as never)[0]);
  rendered.frame();
  const move = measure(rendered, () => rendered.fireEvent.keyDown('ArrowDown'));
  rendered.unmount();
  ui = null;
  return move;
}

const ROW = 20;
const SHORT = 10;
const TALL = 60;

describe('moving the selection over a list', () => {
  it('LazyList tells the two rows it moved between, however many are on screen', () => {
    const build = (rows: number) =>
      createComponent(LazyList, {
        label: 'Files',
        count: 1000,
        height: rows * ROW,
        estimatedItemExtent: ROW,
        defaultSelectedIndex: 2,
        item: (index: number) => Box({ height: ROW }, Text({ text: `file ${index}` }))
      });
    const short = arrowDown(build, 'list', SHORT);
    const tall = arrowDown(build, 'list', TALL);

    // Two rows, each with its states, background and colour.
    expect(short).toEqual({ writes: 6, nodes: 2 });
    expect(tall).toEqual(short);
  });

  it('LazyList moves its hover between two rows, however many are on screen', () => {
    const build = (rows: number) =>
      createComponent(LazyList, {
        label: 'Files',
        count: 1000,
        height: rows * ROW,
        estimatedItemExtent: ROW,
        hover: true,
        item: (index: number) => Box({ height: ROW }, Text({ text: `file ${index}` }))
      });
    const hover = (rows: number) => {
      const rendered = renderTest(build(rows), { width: 400, height: 2000 });
      ui = rendered;
      rendered.frame();
      const items = rendered.getAllByRole('listitem');
      const over = (index: number): void => {
        const box = rendered.getLayout(items[index]!);
        rendered.fireEvent.pointerMove(box.x + box.width / 2, box.y + box.height / 2);
      };
      over(2);
      rendered.frame();
      const move = measure(rendered, () => over(3));
      rendered.unmount();
      ui = null;
      return move;
    };
    const short = hover(SHORT);
    const tall = hover(TALL);

    // The row the pointer left and the one it arrived on, each with its
    // three bindings; the graph's equality test stops the two that did
    // not change.
    expect(short).toEqual({ writes: 6, nodes: 2 });
    expect(tall).toEqual(short);
  });

  it('DataTable tells the two rows it moved between, however many are on screen', () => {
    interface Item {
      name: string;
    }
    const columns: DataColumn<Item>[] = [
      { key: 'name', header: 'Name', cell: (item, _, color) => Text({ text: item.name, color }) }
    ];
    const rows = Array.from({ length: 1000 }, (_, index) => ({ name: `row ${index}` }));
    const build = (visible: number) =>
      createComponent(DataTable<Item>, {
        label: 'Rows',
        columns,
        rows,
        height: (visible + 1) * ROW,
        rowHeight: ROW,
        defaultSelectedRow: 2
      });
    const short = arrowDown(build, 'grid', SHORT);
    const tall = arrowDown(build, 'grid', TALL);

    // Two rows' states and background, and the colour handed to each
    // row's one cell.
    expect(short).toEqual({ writes: 6, nodes: 4 });
    expect(tall).toEqual(short);
  });

  it('Tree tells the two rows it moved between, however many are on screen', () => {
    const nodes: TreeNode[] = Array.from({ length: 1000 }, (_, index) => ({
      key: `n${index}`,
      label: `node ${index}`
    }));
    const build = (rows: number) =>
      createComponent(Tree, {
        label: 'Files',
        nodes,
        height: rows * ROW,
        rowHeight: ROW,
        defaultSelectedKey: 'n2'
      });
    const short = arrowDown(build, 'tree', SHORT);
    const tall = arrowDown(build, 'tree', TALL);

    // Two rows' states and background, and the colour bound on each
    // row's label.
    expect(short).toEqual({ writes: 6, nodes: 4 });
    expect(tall).toEqual(short);
  });

  it('Combobox moves its highlight between two options, however many are listed', () => {
    const highlight = (count: number) => {
      const options: ComboboxOption[] = Array.from({ length: count }, (_, index) => ({
        value: `o${index}`,
        label: `Option ${index}`
      }));
      const rendered = renderTest(
        createComponent(() => Column({ padding: 10 }, createComponent(Combobox, { label: 'Pick', options })), {}),
        { width: 500, height: 2000 }
      );
      ui = rendered;
      rendered.fireEvent.focus(rendered.getByRole('combobox', { name: 'Pick' }));
      rendered.frame();
      // The first press opens the list; the second moves the highlight.
      rendered.fireEvent.press('ArrowDown');
      rendered.frame();
      const move = measure(rendered, () => rendered.fireEvent.press('ArrowDown'));
      rendered.unmount();
      ui = null;
      return move;
    };
    const short = highlight(SHORT);
    const tall = highlight(TALL);

    // The background of the option the highlight left and of the one it
    // arrived on; the choice did not move, so nothing else is told.
    expect(short).toEqual({ writes: 2, nodes: 2 });
    expect(tall).toEqual(short);
  });
});
