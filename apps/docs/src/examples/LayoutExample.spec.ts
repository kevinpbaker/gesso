import { describe, expect, it } from 'vitest';

import { UiNodeType, type UiNode } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Layout } from './LayoutExample';

/** The three tiles inside the row, in document order. */
function tiles(ui: Rendered): UiNode[] {
  const found: UiNode[] = [];
  const visit = (node: UiNode): void => {
    if (node.type === UiNodeType.Box && node.getProperty('borderRadius') === 4) {
      found.push(node);
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(ui.runtime.debugRoot());
  return found;
}

/**
 * The page's claim is about geometry, so the spec asserts geometry: what
 * `x` does along the row and what `y` does across it, in numbers a
 * reader can check against the picture.
 */
describe('the docs layout example', () => {
  it('packs the tiles at the start, one gap apart', () => {
    const ui = renderTest(createComponent(Layout, {}), { width: 480, height: 260 });
    const [first, second, third] = tiles(ui);

    expect(ui.getLayout(second!).x - ui.getLayout(first!).x).toBe(82); // 72 wide + 10 gap
    expect(ui.getLayout(third!).x - ui.getLayout(second!).x).toBe(82);
  });

  it('stretches them to the row’s content height, because none of them chose one', () => {
    const ui = renderTest(createComponent(Layout, {}), { width: 480, height: 260 });

    // The row is 110 tall with 12 of padding on each side.
    expect(tiles(ui).map(node => ui.getLayout(node).height)).toEqual([86, 86, 86]);
  });

  it('centres them along the row when x is pressed', () => {
    const ui = renderTest(createComponent(Layout, {}), { width: 480, height: 260 });
    const [x] = ui.getAllByRole('button');

    ui.fireEvent.click(x!); // start -> center
    ui.frame();

    const [first, , third] = tiles(ui);
    const leading = ui.getLayout(first!).x;
    const trailing = 480 - (ui.getLayout(third!).x + ui.getLayout(third!).width);
    expect(Math.abs(leading - trailing)).toBeLessThan(1);
  });

  it('lets each tile fall back to its content height once y stops stretching', () => {
    const ui = renderTest(createComponent(Layout, {}), { width: 480, height: 260 });
    const y = ui.getAllByRole('button')[1];

    ui.fireEvent.click(y!); // stretch -> start
    ui.frame();

    for (const height of tiles(ui).map(node => ui.getLayout(node).height)) {
      expect(height).toBeLessThan(86);
    }
  });
});
