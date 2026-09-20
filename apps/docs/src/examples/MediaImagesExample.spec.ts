import { describe, expect, it, vi } from 'vitest';

import { DefaultImageResolver, type UiImage } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { BOX, MediaImages, SAMPLE_HEIGHT, SAMPLE_WIDTH } from './MediaImagesExample';

/**
 * What the images page claims, measured.
 *
 * The resolver is injected through the `media` runtime option rather
 * than installed afterwards, for the reason the page gives: the tree is
 * built inside the runtime's constructor and every `Image` in it asks
 * for its bitmap at that moment. It stands in for the network here, so
 * the numbers below are about the resolver and the fit, not about a
 * decoder: nothing in node can decode a PNG.
 */

/** A bitmap-shaped stand-in at the sample's real size; `parseImage` wants width and height. */
function fakeBitmap(): UiImage {
  return { width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT, close: vi.fn() } as unknown as UiImage;
}

interface Drawn {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** Scaling a bitmap is floating point, so sizes are compared with a tolerance. */
function about(value: number, expected: number): boolean {
  return Math.abs(value - expected) < 0.001;
}

async function mountExample() {
  const bitmap = fakeBitmap();
  const fetchBlob = vi.fn(() => Promise.resolve(new Blob()));
  const decode = vi.fn(() => Promise.resolve(bitmap));
  const resolver = new DefaultImageResolver({ fetch: fetchBlob, decode });
  const ui = renderTest(createComponent(MediaImages, {}), { width: 640, height: 340, media: { resolver } });
  await ui.settle();
  const drawn: Drawn[] = ui.draws
    .filter(call => call.name === 'drawImage')
    .map(call => {
      const [, dx, dy, dw, dh] = call.args as [UiImage, number, number, number, number];
      return { dx, dy, dw, dh };
    });
  return { ui, bitmap, fetchBlob, decode, drawn };
}

describe('the docs images example', () => {
  it('fetches and decodes one source once, however many images ask for it', async () => {
    const { fetchBlob, decode, drawn, bitmap, ui } = await mountExample();

    // Five `Image`s, one source: four fitted boxes and the card.
    expect(fetchBlob).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(drawn.length).toBeGreaterThanOrEqual(5);
    for (const call of ui.draws.filter(one => one.name === 'drawImage')) {
      expect(call.args[0]).toBe(bitmap);
    }
  });

  it('fits the same bitmap four ways, and the drawn rectangle proves which', async () => {
    const { drawn } = await mountExample();

    // `fill` takes the box exactly, whatever that does to the shape.
    expect(drawn.filter(one => about(one.dw, BOX) && about(one.dh, BOX))).toHaveLength(1);
    // `cover` scales until both sides are covered, so a 16:9 picture in
    // a square box is drawn wider than the box and cropped by it.
    const cover = drawn.filter(one => about(one.dh, BOX) && one.dw > BOX);
    expect(cover).toHaveLength(1);
    expect(cover[0]!.dw).toBeCloseTo((SAMPLE_WIDTH / SAMPLE_HEIGHT) * BOX, 5);
    // `contain` scales until both sides fit, so the same picture is
    // shorter than the box and centred in it.
    const contain = drawn.filter(one => about(one.dw, BOX) && one.dh < BOX);
    expect(contain).toHaveLength(1);
    expect(contain[0]!.dh).toBeCloseTo((SAMPLE_HEIGHT / SAMPLE_WIDTH) * BOX, 5);
    // `none` draws it at its own size, from the box's top left, and the
    // box clips whatever hangs out.
    expect(drawn.filter(one => about(one.dw, SAMPLE_WIDTH) && about(one.dh, SAMPLE_HEIGHT))).toHaveLength(1);
  });

  it('puts only the named picture in the semantics tree', async () => {
    const { ui } = await mountExample();

    // Four decorative images and one with an `alt`: an image with no
    // name emits no role at all, so a reader is told about one picture.
    const images = ui.getAllByRole('image');
    expect(images).toHaveLength(1);
    expect(ui.getSemantics(images[0]!)).toMatchObject({ role: 'image', label: 'The sample picture' });
  });
});
