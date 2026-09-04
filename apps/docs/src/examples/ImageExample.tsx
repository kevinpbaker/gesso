import { percent, DefaultImageResolver, type ImageResolver, type UiImage } from '@gesso/core';
import { Image } from '@gesso/components';
import type { ComponentContext, Inputs } from '@gesso/framework';

// #region resolver
/**
 * The picture this page draws, made rather than fetched.
 *
 * A documentation page has no business going to the network, so the
 * swatch is painted into an `OffscreenCanvas` and handed over as an
 * `ImageBitmap`, which is exactly what `createImageBitmap` would have
 * produced from a downloaded PNG. It is 180 by 60, three times as wide
 * as it is tall, so the fits below have something to disagree about.
 *
 * Under a spec there is no `OffscreenCanvas`, and nothing draws
 * anything: a stub with a size stands in, because the paint state
 * reads a bitmap's width and height and the recording canvas never
 * looks at its pixels.
 */
async function swatch(): Promise<UiImage> {
  const size = { width: 180, height: 60 };
  if (typeof OffscreenCanvas === 'undefined') {
    return { ...size, close: () => {} } as unknown as UiImage;
  }
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d');
  if (context === null) {
    return { ...size, close: () => {} } as unknown as UiImage;
  }
  const wash = context.createLinearGradient(0, 0, size.width, size.height);
  wash.addColorStop(0, '#2f6f97');
  wash.addColorStop(1, '#8f4f9c');
  context.fillStyle = wash;
  context.fillRect(0, 0, size.width, size.height);
  context.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (let x = -60; x < size.width; x += 24) {
    context.beginPath();
    context.moveTo(x, size.height);
    context.lineTo(x + 30, 0);
    context.lineTo(x + 40, 0);
    context.lineTo(x + 10, size.height);
    context.fill();
  }
  return canvas.transferToImageBitmap();
}

/**
 * The resolver every `Image` on this page is served by.
 *
 * `DefaultImageResolver` with both of its seams replaced: `fetch`
 * answers with an empty blob instead of a request, and `decode`
 * ignores it and paints the swatch. Everything in front of those two
 * is the real thing, which is what the page is about: one decode for
 * however many `Image`s name a source, reference counting so the
 * bitmap outlives none of them, and a rejection that is not cached.
 *
 * `missing.png` fails, because a page that only ever showed the happy
 * path would not say what a broken source looks like.
 */
export function swatchResolver(): ImageResolver {
  return new DefaultImageResolver({
    fetch: source =>
      source === 'missing.png' ? Promise.reject(new Error(`'${source}' is not there.`)) : Promise.resolve(new Blob()),
    decode: () => swatch()
  });
}
// #endregion resolver

// #region image
/**
 * One picture, four boxes, and the four ways a bitmap can meet one.
 *
 * The swatch is 3:1 and every box is 112 by 72, so `cover` crops the
 * sides, `contain` leaves a gap above and below, `fill` squashes it,
 * and `none` draws it at its own size and lets the box clip. Nothing
 * here fetches anything: the resolver above paints the swatch, and all
 * four `Image`s name the same source, so between them they cause one
 * decode and share one bitmap.
 *
 * The fifth names a source that fails, and the sixth has no `alt`, so
 * it is decorative: no role, no name, and nothing in the semantics
 * tree at all.
 *
 * The resolver is not installed here. It is declared by the worker
 * entry that renders this page, with `renderRoot(...).useMedia(...)`,
 * because an `Image` asks for its bitmap the moment it is built and
 * the tree is built inside the runtime's constructor.
 */
export function Gallery(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <column gap={16} padding={20} width={percent(100)} height={percent(100)}>
      <row gap={12}>
        <Fitted fit="cover" />
        <Fitted fit="contain" />
        <Fitted fit="fill" />
        <Fitted fit="none" />
      </row>
      <row gap={10} y="center">
        <Image
          src="missing.png"
          alt="A swatch that failed"
          placeholderColor="danger"
          width={112}
          height={72}
          borderRadius={8}
        />
        <column gap={4}>
          <text text="A source that fails keeps the placeholder tint, here danger." fontSize={12} />
          <text text="There is no error slot: draw your own beside it." fontSize={12} color="textMuted" />
        </column>
      </row>
      <row gap={8} y="center">
        <Image src="swatch.png" width={12} height={12} borderRadius={6} />
        <text text="The bullet has no alt, so it is decorative." fontSize={12} color="textMuted" />
      </row>
    </column>
  );
}

/** One box, captioned with the fit it was given. */
function Fitted(inputs: Inputs<{ fit: 'cover' | 'contain' | 'fill' | 'none' }>) {
  const fit = inputs.fit.value;
  return (
    <column gap={6}>
      <Image src="swatch.png" alt={fit} width={112} height={72} objectFit={fit} borderRadius={8} />
      <text text={fit} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion image
