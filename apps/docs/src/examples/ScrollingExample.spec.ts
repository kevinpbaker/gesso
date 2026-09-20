import { describe, expect, it } from 'vitest';

import { UiNodeType, type UiNode } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { ScrollingList } from './ScrollingExample';

/** The scroll container itself. */
function list(ui: Rendered): UiNode {
  return find(ui, node => node.type === UiNodeType.ScrollView)[0]!;
}

/** The ten rows, in order. */
function rows(ui: Rendered): UiNode[] {
  return find(ui, node => node.type === UiNodeType.Row && node.getProperty('height') === 36);
}

function find(ui: Rendered, matches: (node: UiNode) => boolean): UiNode[] {
  const found: UiNode[] = [];
  const visit = (node: UiNode): void => {
    if (matches(node)) {
      found.push(node);
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(ui.runtime.debugRoot());
  return found;
}

/** What the readout under the list currently says, as a number. */
function readout(ui: Rendered): number {
  return Number.parseInt(String(ui.getByText(/from the top/).getProperty('text')), 10);
}

/** A wheel notch delivered over the middle of the list. */
function wheelOverList(ui: Rendered, deltaY: number): void {
  const box = ui.getLayout(list(ui));
  ui.fireEvent.wheel({ x: box.x + box.width / 2, y: box.y + box.height / 2, deltaY });
  ui.frame();
  ui.frame();
}

/**
 * The page claims three things about a scroll container, and each one
 * is a number: rows keep the size they asked for rather than being
 * squeezed into the viewport, a wheel moves the offset without moving
 * anything's layout box, and an offset past the end is clamped to the
 * content that is actually there.
 */
describe('the docs scrolling example', () => {
  it('gives every row the height it asked for, though ten of them do not fit', () => {
    const ui = renderTest(createComponent(ScrollingList, {}), { width: 480, height: 320 });

    // A ScrollView measures its children with the scrolling axis
    // unbounded, so nothing shrinks to fit: ten 36px rows in a 180px
    // window are ten 36px rows.
    expect(rows(ui).map(row => ui.getLayout(row).height)).toEqual(Array(10).fill(36));
    expect(ui.getLayout(list(ui)).height).toBe(180);
  });

  it('moves the offset under the wheel and leaves every layout box where it was', () => {
    const ui = renderTest(createComponent(ScrollingList, {}), { width: 480, height: 320 });
    const before = rows(ui).map(row => ui.getLayout(row).y);

    wheelOverList(ui, 90);

    expect(readout(ui)).toBe(90);
    // Scrolling translates the content; it does not lay it out again.
    // Layout boxes are pre-scroll, which is why they are unchanged and
    // why an animation reading one does not mistake a scroll for a move.
    expect(rows(ui).map(row => ui.getLayout(row).y)).toEqual(before);
  });

  it('clamps a wheel that overshoots to the content extent', () => {
    const ui = renderTest(createComponent(ScrollingList, {}), { width: 480, height: 320 });
    const scroller = ui.getLayout(list(ui));
    const all = rows(ui);
    const first = ui.getLayout(all[0]!);
    const last = ui.getLayout(all[all.length - 1]!);
    // The content extent is measured from the placed rows and the
    // container's own padding, which is the gap above the first row.
    const padding = first.y - scroller.y;
    const overflow = last.y + last.height + padding - (scroller.y + scroller.height);

    wheelOverList(ui, 5000);

    // 8 + 10 rows of 36 + 9 gaps of 4 + 8 = 412 of content in a 180px
    // window, so there are 232 pixels to travel and no more.
    expect(overflow).toBe(232);
    expect(readout(ui)).toBe(overflow);
  });

  it('puts the list back at the top when the button asks it to', () => {
    const ui = renderTest(createComponent(ScrollingList, {}), { width: 480, height: 320 });
    wheelOverList(ui, 120);
    expect(readout(ui)).toBe(120);

    ui.fireEvent.click(ui.getByRole('button', { name: 'Back to top' }));
    ui.frame();
    ui.frame();

    // Writing the bound cell is the whole of programmatic scrolling.
    expect(readout(ui)).toBe(0);
  });
});
