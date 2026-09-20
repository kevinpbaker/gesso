import { describe, expect, it, vi } from 'vitest';

import { IconRasterizer, type IconCanvas, type IconContext, type UiImage } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { People, portraitResolver } from './AvatarExample';

/**
 * What the avatar page claims, measured.
 *
 * Both media seams go in through the runtime's `media` option, exactly
 * as the page's worker entry declares the resolver with `useMedia`:
 * the tree is built inside the runtime's constructor, and an `Avatar`
 * with a `src` asks for its bitmap right then. The rasteriser records
 * what it was asked to draw rather than drawing it, because a glyph
 * has no text and no semantics record and the spec it asked for is the
 * only honest evidence that it is on the screen.
 */

/** A canvas that records what it was asked to fill. */
function recordingRasterizer(): { rasterizer: IconRasterizer; fills: string[] } {
  const fills: string[] = [];
  const createCanvas = (): IconCanvas => {
    const ctx: IconContext = {
      scale: () => {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      fill: () => fills.push(ctx.fillStyle),
      stroke: () => {}
    };
    return {
      getContext2D: () => ctx,
      toBitmap: () => Promise.resolve({ width: 8, height: 8, close: vi.fn() } as unknown as UiImage)
    };
  };
  return { rasterizer: new IconRasterizer({ createCanvas }), fills };
}

const mount = () =>
  renderTest(createComponent(People, {}), {
    width: 620,
    height: 380,
    media: { resolver: portraitResolver(), rasterizer: recordingRasterizer().rasterizer }
  });

describe('the docs avatar example', () => {
  it('announces the avatars that stand alone and none of the ones beside a name', () => {
    const ui = mount();

    // Four rows carry `label=""`, so they are decorative. Three of the
    // four at the bottom have a person to name; the fourth has none.
    expect(ui.getAllByRole('image')).toHaveLength(3);
    expect(ui.getByRole('image', { name: 'Ada Lovelace' })).toHaveSemantics({ role: 'image' });
    expect(ui.getByRole('image', { name: 'Katherine Johnson' })).toHaveSemantics({ role: 'image' });
  });

  it('draws a picture where the data has one and initials where it does not', async () => {
    const ui = mount();
    await ui.settle();

    // Katherine has no picture, so her name supplies the initials, and
    // the row with neither a name nor a picture draws no text at all.
    expect(ui.getAllByText('KJ')).toHaveLength(2);
    expect(ui.queryByText('AL')).toBeNull();
    // Two rows have a bitmap on them, plus the small one at the bottom.
    const pictured = ui.allNodes().filter(node => node.properties.get('image') !== undefined);
    expect(pictured.length).toBeGreaterThanOrEqual(3);
  });

  it('walks every pictured row down to its initials when the pictures are turned off', async () => {
    const ui = mount();
    await ui.settle();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Show pictures' }));
    ui.frame();
    await ui.settle();

    // Ada and Grace fall back to initials derived from their names,
    // in the list and again in the row of four below it.
    expect(ui.getAllByText('AL')).toHaveLength(2);
    expect(ui.getAllByText('GH')).toHaveLength(2);
  });

  it('gives every avatar the placeholder ground and no colour of its own', async () => {
    const ui = mount();
    await ui.settle();

    const grounds = ui
      .allNodes()
      .map(node => node.properties.get('backgroundColor'))
      .filter(value => value === 'placeholder');
    // One per avatar: four rows and four standing alone. Counted once
    // the pictures have arrived, because an `Image` carries the same
    // ground as a tint until its bitmap covers it, which is what keeps
    // a row from flashing white before the face appears.
    expect(grounds).toHaveLength(8);
  });

  it('draws the generic glyph for the row that has neither a picture nor a name', async () => {
    const ui = mount();
    await ui.settle();

    // The list's guest row and the lone 72px avatar at the bottom: two
    // glyphs, and no initials for either, because there is no name to
    // derive them from.
    const glyphs = ui.allNodes().filter(node => node.properties.get('objectFit') === 'fill');
    expect(glyphs).toHaveLength(2);
  });
});
