import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from '@gesso/framework';
import {
  Column,
  darkTheme,
  lightTheme,
  IconRasterizer,
  type IconCanvas,
  type IconContext,
  type UiImage,
  type UiTheme
} from '@gesso/core';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Glyphs } from './IconExample';

/**
 * A rasteriser that records the colours it was asked for instead of
 * drawing them. There is no canvas here, and the point of the test is
 * which colour was baked in, not what the glyph looked like.
 */
function recordingRasterizer(): { rasterizer: IconRasterizer; fills: string[]; strokes: string[] } {
  const fills: string[] = [];
  const strokes: string[] = [];
  const createCanvas = (): IconCanvas => {
    const context: IconContext = {
      scale: () => {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      fill: () => fills.push(context.fillStyle),
      stroke: () => strokes.push(context.strokeStyle)
    };
    return {
      getContext2D: () => context,
      toBitmap: () => Promise.resolve({ width: 24, height: 24, close: () => {} } as unknown as UiImage)
    };
  };
  return { rasterizer: new IconRasterizer({ createCanvas }), fills, strokes };
}

/**
 * The page claims three things about `Icon`: that a labelled icon is
 * announced and an unlabelled one is not, that the raster reaches the
 * node as its picture, and that the colour is baked in, so a theme
 * change is a second raster rather than a different paint.
 */
describe('the docs icon example', () => {
  beforeEach(() => {
    // `new Path2D(d)` is a platform type the recording canvas never
    // looks at; the modifier still constructs one.
    (globalThis as { Path2D?: unknown }).Path2D = class {
      constructor(readonly d: string) {}
    };
  });
  afterEach(() => {
    delete (globalThis as { Path2D?: unknown }).Path2D;
    vi.restoreAllMocks();
  });

  it('announces the six icons that were given a label, and not the one that was not', () => {
    const { rasterizer } = recordingRasterizer();
    const ui = renderTest(createComponent(Glyphs, {}), { width: 520, height: 240, media: { rasterizer } });

    expect(ui.getAllByRole('image')).toHaveLength(6);
    expect(ui.getByRole('image', { name: 'Search' })).toHaveSemantics({ role: 'image', name: 'Search' });
    expect(ui.getByRole('image', { name: 'Recent' })).toHaveSemantics({ role: 'image', name: 'Recent' });
  });

  it('draws the raster onto the node once it is ready', async () => {
    const { rasterizer } = recordingRasterizer();
    const ui = renderTest(createComponent(Glyphs, {}), { width: 520, height: 240, media: { rasterizer } });
    const done = ui.getByRole('image', { name: 'Done' });

    expect(done.properties.get('image')).toBeUndefined();
    await ui.settle();

    expect(done.properties.get('image')).toBeDefined();
    // Sized by `size`, not by the 24-unit box the path is authored in.
    expect(done.properties.get('width')).toBe(24);
  });

  it('rasterises once per icon, and again in the other palette when the theme changes', async () => {
    const { rasterizer, fills, strokes } = recordingRasterizer();
    const theme = new BehaviorSubject<UiTheme>(lightTheme);
    const ui = renderTest(Column({ theme }, createComponent(Glyphs, {})), {
      width: 520,
      height: 240,
      media: { rasterizer }
    });
    await ui.settle();

    // Four stroked, three filled: seven distinct icons, seven rasters.
    expect(strokes).toHaveLength(4);
    expect(fills).toHaveLength(3);

    theme.next(darkTheme);
    ui.frame();
    await ui.settle();

    // Every icon on screen is drawn again, because a raster's colour
    // is its pixels. This is the one thing in the library that cannot
    // resolve a palette name at paint.
    expect(strokes).toHaveLength(8);
    expect(fills).toHaveLength(6);
    expect(strokes[4]).not.toBe(strokes[0]);
  });
});
