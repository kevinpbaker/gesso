import { describe, expect, it } from 'vitest';

import { UiNodeType, type UiNode } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Feed } from './VirtualizationExample';

const SIZE = { width: 460, height: 340 };
const ROW = 28;
const STARTING_ROWS = 50000;
/** The window is the 220 px viewport plus three rows of overscan each side. */
const WINDOW_CEILING = 20;

function example(): Rendered {
  return renderTest(createComponent(Feed, {}), SIZE);
}

/** The lazy list itself. */
function list(ui: Rendered): UiNode {
  const found: UiNode[] = [];
  const visit = (node: UiNode): void => {
    if (node.type === UiNodeType.ScrollView) {
      found.push(node);
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(ui.runtime.debugRoot());
  return found[0]!;
}

/** The indices of the rows that exist right now, in order. */
function mounted(ui: Rendered): number[] {
  const indices: number[] = [];
  const visit = (node: UiNode): void => {
    const index = node.getProperty('virtualIndex');
    if (typeof index === 'number') {
      indices.push(index);
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(list(ui));
  return indices;
}

/** Every node under the list, wrappers, spacers, rows and text alike. */
function nodesUnderList(ui: Rendered): number {
  let total = 0;
  const visit = (node: UiNode): void => {
    total++;
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(list(ui));
  return total;
}

function wheel(ui: Rendered, deltaY: number): void {
  const box = ui.getLayout(list(ui));
  ui.fireEvent.wheel({ x: box.x + box.width / 2, y: box.y + box.height / 2, deltaY });
  ui.frame();
  ui.frame();
}

function press(ui: Rendered, name: string): void {
  ui.fireEvent.click(ui.getByRole('button', { name }));
  ui.frame();
  ui.frame();
}

/**
 * What the page claims: the number of nodes a lazy list mounts is the
 * size of the window, not the size of the data; the window moves with
 * the scroll and the rows that left are gone; the scroll range still
 * spans every row; and the count and the meaning of an index are both
 * values the list follows.
 */
describe('the docs virtualization example', () => {
  it('mounts a window of fifty thousand rows, not fifty thousand rows', () => {
    const ui = example();
    const indices = mounted(ui);

    // 212 px of viewport inside the padding, at 28 a row, is eight rows
    // visible; the overscan band adds three past the bottom and there is
    // nothing above row 0 to add.
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(indices.length).toBeLessThan(WINDOW_CEILING);
    // The whole subtree, spacers and text included, is of that order
    // too: nothing is built and left unmounted off screen.
    expect(nodesUnderList(ui)).toBeLessThan(WINDOW_CEILING * 5);
  });

  it('keeps the scroll range over every row, mounted or not', () => {
    const ui = example();
    const scroll = ui.explain(list(ui)).scroll;

    // The extent is the estimate per row, corrected by the rows that
    // have actually been measured, so a list nobody has scrolled still
    // knows how tall it is.
    expect(scroll?.contentHeight).toBeCloseTo(STARTING_ROWS * ROW + 8, 0);
  });

  it('moves the window with the scroll and unmounts what left', () => {
    const ui = example();
    const before = mounted(ui);

    wheel(ui, 20000);
    const after = mounted(ui);

    expect(after.length).toBeLessThan(WINDOW_CEILING);
    // 20,000 px at 28 a row is row 714 or so, and none of the rows that
    // were mounted at the top survived the trip.
    expect(after[0]).toBeGreaterThan(650);
    expect(after.some(index => before.includes(index))).toBe(false);
    expect(ui.textOf()).toContain('50,000 rows, 20,000 px down');
  });

  it('follows a count that changes', () => {
    const ui = example();

    press(ui, 'Add 10,000');

    expect(ui.textOf()).toContain('60,000 rows, 0 px down');
    expect(ui.explain(list(ui)).scroll?.contentHeight).toBeCloseTo((STARTING_ROWS + 10000) * ROW + 8, 0);
    expect(mounted(ui).length).toBeLessThan(WINDOW_CEILING);
  });

  it('re-renders the mounted rows in place when an index means something new', () => {
    const ui = example();
    wheel(ui, 20000);
    const before = mounted(ui);

    press(ui, 'Reverse the order');

    // The same indices in the same places, drawing different data.
    expect(mounted(ui)).toEqual(before);
    expect(ui.textOf()).toContain('50,000 rows, 20,000 px down');
    expect(ui.textOf()).toContain(`Entry ${(STARTING_ROWS - 1 - before[0]!).toLocaleString('en-US')}`);
  });
});
