import { describe, expect, it } from 'vitest';

import type { LayoutBox, UiNode } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { BANNER_HEIGHT, COVER_SIZE, SharedElementStage } from './SharedElementExample';

/**
 * Where the cover is actually drawn, which is not where it is laid out.
 *
 * The morph is a translation and a scale about the node's centre, so
 * the box a person sees is the layout box scaled about its middle and
 * moved. Reading the layout alone would say the element jumped.
 */
function paintedBox(ui: Rendered, node: UiNode): LayoutBox {
  const box = ui.getLayout(node);
  const transform = node.properties.get('transform') as
    | { translateX?: number; translateY?: number; scaleX?: number; scaleY?: number }
    | undefined;
  const scaleX = transform?.scaleX ?? 1;
  const scaleY = transform?.scaleY ?? 1;
  const width = box.width * scaleX;
  const height = box.height * scaleY;
  return {
    x: box.x + box.width / 2 + (transform?.translateX ?? 0) - width / 2,
    y: box.y + box.height / 2 + (transform?.translateY ?? 0) - height / 2,
    width,
    height
  };
}

/** The cover on the arriving screen: the one laid out at `height`. */
function coverAt(ui: Rendered, height: number): UiNode {
  const found = ui.getAllByRole('image').find(node => Math.round(ui.getLayout(node).height) === height);
  expect(found).toBeDefined();
  return found!;
}

/** Two boxes to within a rounding error, field by field. */
function expectBox(actual: LayoutBox, expected: LayoutBox): void {
  expect(actual.x).toBeCloseTo(expected.x, 3);
  expect(actual.y).toBeCloseTo(expected.y, 3);
  expect(actual.width).toBeCloseTo(expected.width, 3);
  expect(actual.height).toBeCloseTo(expected.height, 3);
}

function drain(ui: Rendered, limit = 400): number {
  let frames = 0;
  while (ui.clock.isPending && frames < limit) {
    frames++;
    ui.frame();
  }
  return frames;
}

const mount = () => renderTest(createComponent(SharedElementStage, {}), { width: 480, height: 340 });

/**
 * The claim is that the cover travels between two layouts rather than
 * cutting from one to the other, so the spec measures the box it is
 * painted in on the frames in between.
 */
describe('the docs shared element example', () => {
  it('starts the arriving cover from the box the departing one was standing in', () => {
    const ui = mount();
    drain(ui);
    const small = ui.getLayout(coverAt(ui, COVER_SIZE));

    ui.fireEvent.click(ui.getByRole('button', { name: 'Open Aurora' }));
    ui.frame();

    // The banner is laid out at its full size on this very frame, and
    // drawn at the small cover's box instead: a FLIP, on the live node.
    const banner = coverAt(ui, BANNER_HEIGHT);
    expect(ui.getLayout(banner).height).toBe(BANNER_HEIGHT);

    const painted = paintedBox(ui, banner);
    expect(painted.x).toBeCloseTo(small.x, 1);
    expect(painted.y).toBeCloseTo(small.y, 1);
    expect(painted.width).toBeCloseTo(small.width, 1);
    expect(painted.height).toBeCloseTo(small.height, 1);
  });

  it('interpolates the box between the two layouts and then lets go', () => {
    const ui = mount();
    drain(ui);
    const small = ui.getLayout(coverAt(ui, COVER_SIZE));

    ui.fireEvent.click(ui.getByRole('button', { name: 'Open Aurora' }));
    ui.frame();
    const banner = coverAt(ui, BANNER_HEIGHT);
    const large = ui.getLayout(banner);

    // A handful of frames in, the cover is neither box.
    for (let i = 0; i < 5; i++) {
      ui.frame();
    }
    const midway = paintedBox(ui, banner);
    expect(midway.width).toBeGreaterThan(small.width);
    expect(midway.width).toBeLessThan(large.width);
    expect(midway.height).toBeGreaterThan(small.height);
    expect(midway.height).toBeLessThan(large.height);

    // Arrived, and the override handed back, so the element is laid
    // out by what it declared with no transform left on it.
    expect(drain(ui)).toBeGreaterThan(4);
    expect(banner.properties.has('transform')).toBe(false);
    expectBox(paintedBox(ui, banner), large);
  });

  it('morphs back the other way, because the name is claimed rather than diffed', () => {
    const ui = mount();
    drain(ui);
    const small = ui.getLayout(coverAt(ui, COVER_SIZE));

    ui.fireEvent.click(ui.getByRole('button', { name: 'Open Aurora' }));
    drain(ui);
    ui.fireEvent.click(ui.getByRole('button', { name: 'Back' }));
    ui.frame();

    // The arriving list cover starts from the banner's box, which is
    // the direction a diff of the tree could not have given: the
    // reconciler builds the new children before removing the old.
    const cover = coverAt(ui, COVER_SIZE);
    expect(paintedBox(ui, cover).height).toBeGreaterThan(COVER_SIZE);

    drain(ui);
    expect(cover.properties.has('transform')).toBe(false);
    expectBox(paintedBox(ui, cover), small);
  });

  it('hides the departing cover the moment the name changes hands', () => {
    const ui = mount();
    drain(ui);

    ui.fireEvent.click(ui.getByRole('button', { name: 'Open Aurora' }));
    ui.frame();

    // Two covers are in the tree while the screens overlap, and only
    // one of them is visible: the departing element yields at once
    // rather than fading, because the arriving one is about to be
    // drawn over exactly its box.
    const covers = ui.getAllByRole('image');
    expect(covers).toHaveLength(2);
    const departing = coverAt(ui, COVER_SIZE);
    expect(departing.properties.get('opacity')).toBe(0);
  });
});
