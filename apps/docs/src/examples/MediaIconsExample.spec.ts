import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IconRasterizer, type IconCanvas, type IconContext, type UiImage } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { MediaIcons } from './MediaIconsExample';

/**
 * What the icons page claims, measured.
 *
 * The rasteriser is injected through the `media` runtime option, and
 * the canvas under it records what it was asked to draw instead of
 * drawing it, so the counts below are rasters rather than pixels.
 */

/** A canvas that records the colour of every fill and stroke. */
function recordingRasterizer(): { rasterizer: IconRasterizer; fills: string[]; strokes: string[] } {
  const fills: string[] = [];
  const strokes: string[] = [];
  const createCanvas = (): IconCanvas => {
    const ctx: IconContext = {
      scale: () => {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      fill: () => fills.push(ctx.fillStyle),
      stroke: () => strokes.push(ctx.strokeStyle)
    };
    return {
      getContext2D: () => ctx,
      toBitmap: () => Promise.resolve({ width: 8, height: 8, close: vi.fn() } as unknown as UiImage)
    };
  };
  return { rasterizer: new IconRasterizer({ createCanvas }), fills, strokes };
}

async function mountExample() {
  const { rasterizer, fills, strokes } = recordingRasterizer();
  const ui = renderTest(createComponent(MediaIcons, {}), { width: 520, height: 320, media: { rasterizer } });
  await ui.settle();
  return { ui, rasterizer, fills, strokes };
}

describe('the docs icons example', () => {
  beforeEach(() => {
    // `new Path2D(d)` is a platform type the recording canvas never
    // looks at, but the rasteriser still constructs one.
    (globalThis as { Path2D?: unknown }).Path2D = class {
      constructor(readonly d: string) {}
    };
  });
  afterEach(() => {
    delete (globalThis as { Path2D?: unknown }).Path2D;
  });

  it('rasterises once per distinct icon, not once per node', async () => {
    const { rasterizer, fills, strokes } = await mountExample();

    // Five icons are on screen. The check mark appears twice at one
    // size in one colour, and one of the two carries a name, which is
    // not part of what a raster is keyed on.
    expect(strokes).toHaveLength(2);
    // The pair below differ only in `fillRule`, which is part of the
    // key, so one path is two rasters.
    expect(fills).toHaveLength(2);
    expect(rasterizer.size).toBe(4);
  });

  it('draws every icon again when the theme under it changes', async () => {
    const { ui, fills, strokes } = await mountExample();
    const before = [...strokes];

    ui.fireEvent.click(ui.getByRole('button'));
    await ui.settle();

    // A raster has its colour baked in, so a card that turns dark
    // cannot resolve the same palette name at paint: every icon under
    // it is drawn again, in the other palette's value.
    expect(strokes).toHaveLength(4);
    expect(fills).toHaveLength(4);
    expect(strokes[2]).not.toBe(before[0]);
    expect(strokes[2]).toBe(strokes[3]);
  });

  it('names the icon that was given a label and leaves the rest decorative', async () => {
    const { ui } = await mountExample();

    const named = ui.getAllByRole('image');
    expect(named).toHaveLength(1);
    expect(ui.getSemantics(named[0]!)).toMatchObject({ role: 'image', label: 'Done' });
  });
});
