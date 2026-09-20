import { describe, expect, it } from 'vitest';

import type { LayoutBox, UiNode } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { StickyList } from './StickyExample';

const OFFSET = 120;

/**
 * Mounts the example and keeps every mirrored node's *visible* box.
 *
 * `getLayout` answers where a node sits in the flow, and a sticky shift
 * is deliberately not part of that: the shift is applied when the node
 * is painted and undone when it is hit tested. The accessibility mirror
 * is handed the visible rectangle for the same reason a screen reader
 * needs it, so a spec can read the projection the renderer and the hit
 * tester agree on without reaching into the engine.
 */
function mount(): { ui: Rendered; seen: (node: UiNode) => LayoutBox } {
  const boxes = new Map<string, LayoutBox>();
  const ui = renderTest(createComponent(StickyList, {}), {
    width: 480,
    height: 340,
    onCreate: runtime =>
      runtime.onSemantics(update => {
        for (const entry of update.boxes) {
          boxes.set(entry.id, entry.box);
        }
      })
  });
  return {
    ui,
    seen: node => {
      const box = boxes.get(node.id);
      if (box === undefined) {
        throw new Error(`Nothing mirrored for '${node.id}'.\n\n${ui.debug()}`);
      }
      return box;
    }
  };
}

/** A wheel over the middle of the list, and the frames it asks for. */
function scrollList(ui: Rendered, deltaY: number): void {
  const box = ui.getLayout(ui.getByRole('list'));
  ui.fireEvent.wheel({ x: box.x + box.width / 2, y: box.y + box.height / 2, deltaY });
  ui.frame();
  ui.frame();
}

/**
 * The claim is that the header holds at the list's edge while its own
 * rows travel under it, and leaves when its group does. Both are
 * geometry, so both are measured: the visible box against the flow box
 * it keeps, and the pointer against the row the header is covering.
 */
describe('the docs sticky example', () => {
  it('holds the header at the top of the list while the rows move under it', () => {
    const { ui, seen } = mount();
    const list = ui.getLayout(ui.getByRole('list'));
    const coast = ui.getByRole('heading', { name: 'Coast' });
    const tofino = ui.getByRole('button', { name: 'Tofino' });
    const flow = ui.getLayout(coast);

    expect(seen(coast).y).toBe(list.y);

    scrollList(ui, OFFSET);

    // Seen at the same place, laid out at the same place: the shift is
    // not a layout change, which is why nothing around it re-measured.
    // Offsets are floats, so the comparison is to a fraction of a pixel.
    expect(seen(coast).y).toBeCloseTo(list.y, 6);
    expect(ui.getLayout(coast)).toEqual(flow);
    // Its rows are not sticky, so they moved by the whole offset.
    expect(seen(tofino).y).toBe(ui.getLayout(tofino).y - OFFSET);
  });

  it('lets the header leave with its group, and hands the edge to the next one', () => {
    const { ui, seen } = mount();
    const list = ui.getLayout(ui.getByRole('list'));
    const coast = ui.getByRole('heading', { name: 'Coast' });
    const last = ui.getLayout(ui.getByRole('button', { name: 'Bamfield' }));
    const groupBottom = last.y + last.height;

    // Far enough that the first group has gone: 28 + four rows of 36 is
    // 172, so at 250 the second group owns the edge.
    scrollList(ui, 250);

    const gone = seen(coast);
    expect(gone.y).toBeLessThan(list.y);
    // It stopped exactly on its group's bottom edge rather than
    // carrying on to the top of the list.
    expect(gone.y + gone.height).toBe(groupBottom - 250);
    expect(seen(ui.getByRole('heading', { name: 'Interior' })).y).toBeCloseTo(list.y, 6);
  });

  it('puts the header, and not the row behind it, under the pointer', () => {
    const { ui } = mount();
    const list = ui.getLayout(ui.getByRole('list'));
    const rows = ui.getAllByRole('button');

    scrollList(ui, OFFSET);

    // Which row each point would meet if nothing were sticky: a visible
    // position is the flow position less the container's offset, so the
    // row under a point is the one whose flow box covers it.
    const rowAt = (y: number): UiNode =>
      rows.find(row => {
        const box = ui.getLayout(row);
        return y + OFFSET >= box.y && y + OFFSET < box.y + box.height;
      })!;
    const covered = rowAt(list.y + 8);
    const clear = rowAt(list.y + 46);
    expect(covered).not.toBe(clear);

    ui.fireEvent.pointerMove(list.x + 40, list.y + 8);
    ui.frame();
    // The header is over it, so the row never sees the pointer.
    expect(covered.getProperty('backgroundColor')).toBe('background');

    ui.fireEvent.pointerMove(list.x + 40, list.y + 46);
    ui.frame();
    // A row below the header band answers normally, which is what says
    // the first result was the header and not a dead list.
    expect(clear.getProperty('backgroundColor')).toBe('controlBackgroundHovered');
  });
});
