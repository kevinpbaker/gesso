import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Gallery, swatchResolver } from './ImageExample';

// The resolver goes in through the `media` option, exactly as the
// page's worker entry declares it with `useMedia`: the tree is built
// inside the runtime's constructor and every `Image` in it asks for
// its bitmap then.
const mount = () =>
  renderTest(createComponent(Gallery, {}), { width: 560, height: 300, media: { resolver: swatchResolver() } });

/**
 * The page claims four things about `Image`: that the bitmap comes
 * from the resolver in `MediaService`, that several pictures of one
 * source share one decode, that `objectFit` is what decides how the
 * bitmap meets its box, and that a picture with no `alt` is not in the
 * semantics tree.
 */
describe('the docs image example', () => {
  it('names every picture that has an alt, and leaves the decorative one out', async () => {
    const ui = mount();
    await ui.settle();

    // Five alts, and a sixth picture that has none: the bullet is
    // drawn and is not announced.
    expect(ui.getAllByRole('image')).toHaveLength(5);
    expect(ui.getByRole('image', { name: 'cover' })).toHaveSemantics({ role: 'image', name: 'cover' });
    expect(ui.queryByRole('image', { name: '' })).toBeNull();
  });

  it('writes one decoded bitmap onto every box that named the source', async () => {
    const ui = mount();
    const cover = ui.getByRole('image', { name: 'cover' });

    // Nothing is decoded on the first frame: a resolve is a promise.
    expect(cover.properties.get('image')).toBeUndefined();
    await ui.settle();

    const bitmap = cover.properties.get('image');
    expect(bitmap).toBeDefined();
    for (const fit of ['contain', 'fill', 'none']) {
      // The same object, which is the de-duplication: four pictures of
      // one source cause one fetch and one decode between them.
      expect(ui.getByRole('image', { name: fit }).properties.get('image')).toBe(bitmap);
    }
  });

  it('passes each fit through to the node that draws the bitmap', () => {
    const ui = mount();

    for (const fit of ['cover', 'contain', 'fill', 'none']) {
      expect(ui.getByRole('image', { name: fit }).properties.get('objectFit')).toBe(fit);
    }
  });

  it('tints the box while it decodes, drops the tint when it arrives, and keeps it when it fails', async () => {
    const ui = mount();
    const cover = ui.getByRole('image', { name: 'cover' });
    const failed = ui.getByRole('image', { name: 'A swatch that failed' });

    expect(cover.properties.get('backgroundColor')).toBe('controlBackground');

    await ui.settle();

    // Loaded: the tint goes, so the bitmap is not drawn over a colour.
    expect(cover.properties.get('backgroundColor')).toBeUndefined();
    // Failed: the tint stays, which is the whole of what a broken
    // source looks like.
    expect(failed.properties.get('image')).toBeUndefined();
    // And it is the colour that picture asked for: `placeholderColor`
    // is the caller's answer for a picture the theme's control
    // background does not suit.
    expect(failed.properties.get('backgroundColor')).toBe('danger');
  });
});
