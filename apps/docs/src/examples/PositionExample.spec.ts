import { describe, expect, it } from 'vitest';

import { UiNodeType, type LayoutBox, type UiNode } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Anchored } from './PositionExample';

const SIZE = { width: 420, height: 320 };
/** The gap the example asks for between the button and its panel. */
const OFFSET = 8;

function example(): Rendered {
  const ui = renderTest(createComponent(Anchored, {}), SIZE);
  // The entry is opened on mount, so it is placed on the frame after
  // the one renderTest has already run.
  ui.frame();
  return ui;
}

/** The scroll container the anchor travels inside. */
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

/**
 * Where the anchor is *seen*.
 *
 * `getLayout` is the flow box, which a scroll never moves, and the
 * engine brings the anchor and the overlay into the same visible space
 * before placing one beside the other. So the comparison the page is
 * making needs the scroll offset taken off.
 */
function anchorSeen(ui: Rendered): LayoutBox {
  const box = ui.getLayout(ui.getByRole('button', { name: 'Details' }));
  const scroll = Number(list(ui).getProperty('scrollY') ?? 0);
  return { ...box, y: box.y - scroll };
}

function panelBox(ui: Rendered): LayoutBox {
  return ui.getLayout(ui.getByRole('group', { name: 'Panel' }));
}

/**
 * The gap between the panel and the anchor, on whichever side the panel
 * took. The side it is on decides which of the two differences is the
 * real distance; the other one spans both boxes and is negative.
 */
function gapToAnchor(panel: LayoutBox, anchor: LayoutBox): number {
  return Math.max(panel.y - (anchor.y + anchor.height), anchor.y - (panel.y + panel.height));
}

function press(ui: Rendered, name: string): void {
  ui.fireEvent.click(ui.getByRole('button', { name }));
  ui.frame();
  ui.frame();
}

/**
 * What the page claims: an anchored overlay is placed beside its
 * anchor by the layout engine, on the same frame the anchor moves; it
 * flips to the opposite side when the side it asked for has no room;
 * and it is shifted along the anchor rather than being allowed to
 * leave the viewport.
 */
describe('the docs positioning example', () => {
  it('places the panel below its anchor while there is room', () => {
    const ui = example();
    const anchor = anchorSeen(ui);

    expect(panelBox(ui).y).toBeCloseTo(anchor.y + anchor.height + OFFSET, 3);
  });

  it('shifts the panel along the anchor rather than letting it leave the viewport', () => {
    const ui = example();
    const anchor = anchorSeen(ui);
    const panel = panelBox(ui);

    // 'bottom-start' asks for the leading edges to line up, and that
    // would put the panel's trailing edge past the canvas.
    expect(anchor.x + panel.width).toBeGreaterThan(SIZE.width);
    expect(panel.x).toBeLessThan(anchor.x);
    expect(panel.x + panel.width).toBeCloseTo(SIZE.width, 3);
  });

  it('flips the panel above the anchor when the scroll leaves no room below', () => {
    const ui = example();
    press(ui, 'Move the button down');

    const anchor = anchorSeen(ui);
    const panel = panelBox(ui);
    // No room for the panel under the button, and plenty over it.
    expect(SIZE.height - (anchor.y + anchor.height) - OFFSET).toBeLessThan(panel.height);
    expect(panel.y + panel.height).toBeCloseTo(anchor.y - OFFSET, 3);
    expect(panel.y).toBeGreaterThanOrEqual(0);
  });

  it('follows the anchor back and puts the panel underneath again', () => {
    const ui = example();
    press(ui, 'Move the button down');
    const low = anchorSeen(ui).y;

    press(ui, 'Move the button up');
    const anchor = anchorSeen(ui);

    // The anchor really moved, and the panel is beside it again.
    expect(anchor.y).toBeLessThan(low);
    expect(panelBox(ui).y).toBeCloseTo(anchor.y + anchor.height + OFFSET, 3);
  });

  it('follows the anchor when the notice above it pushes it down the list', () => {
    const ui = example();
    const before = anchorSeen(ui).y;

    // Nothing scrolls here: the notice above the button grows, the flow
    // carries the button down with it, and the panel is placed again on
    // whichever side of the button now has the room.
    press(ui, 'Expand the notice');
    const anchor = anchorSeen(ui);

    expect(anchor.y).toBeGreaterThan(before);
    expect(gapToAnchor(panelBox(ui), anchor)).toBeCloseTo(OFFSET, 3);

    press(ui, 'Collapse the notice');
    const back = anchorSeen(ui);
    expect(back.y).toBeCloseTo(before, 3);
    expect(panelBox(ui).y).toBeCloseTo(back.y + back.height + OFFSET, 3);
  });

  it('closes and reopens the panel from its anchor', () => {
    const ui = example();
    expect(ui.queryByRole('group', { name: 'Panel' })).not.toBeNull();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Details' }));
    ui.frame();
    expect(ui.queryByRole('group', { name: 'Panel' })).toBeNull();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Details' }));
    ui.frame();
    ui.frame();
    const anchor = anchorSeen(ui);
    expect(panelBox(ui).y).toBeCloseTo(anchor.y + anchor.height + OFFSET, 3);
  });
});
