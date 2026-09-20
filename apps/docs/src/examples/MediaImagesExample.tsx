import { percent, type ObjectFit } from 'gesso-core';
import { Image } from 'gesso-components';
import type { ComponentContext, Inputs } from 'gesso-framework';

/**
 * The picture every box on this page shows.
 *
 * It is a file in the site's `public/` directory, so the resolver
 * fetches it from the same origin the page came from. 320 by 180, which
 * is what makes the four fits below look different from each other.
 */
export const SAMPLE = '/media/sample.png';
export const SAMPLE_WIDTH = 320;
export const SAMPLE_HEIGHT = 180;

/** The side of each fitted box, in logical pixels. */
export const BOX = 110;

export const FITS: readonly ObjectFit[] = ['fill', 'cover', 'contain', 'none'];

// #region fits
/**
 * One 110 by 110 box, and a 320 by 180 picture put into it.
 *
 * Every one of these resolves the same `src`. The resolver fetches and
 * decodes it once and hands the same `ImageBitmap` to all of them, so
 * what differs between the boxes is only how the bitmap is fitted.
 *
 * No `alt`, so each is decorative: the caption underneath is what a
 * screen reader reads, and four announcements of one picture would be
 * noise.
 */
function Fitted(inputs: Inputs<{ fit: ObjectFit }>, _ctx: ComponentContext) {
  const fit = inputs.fit.value;
  return (
    <column gap={6} x="center">
      <Image src={SAMPLE} objectFit={fit} width={BOX} height={BOX} borderRadius={8} />
      <text text={fit} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion fits

// #region named
/**
 * A picture that carries information, so it says what it is.
 *
 * `alt` is what makes an `Image` appear in the semantics tree at all:
 * with it the node is an `image` with that name, and without it there
 * is no record. There is deliberately no way to get a nameless one.
 */
function Card(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <row
      gap={12}
      padding={12}
      y="center"
      borderRadius={10}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface">
      <Image src={SAMPLE} alt="The sample picture" width={72} height={48} objectFit="cover" borderRadius={6} />
      <column gap={2}>
        <text text="sample.png" fontSize={13} fontWeight={600} color="text" />
        <text text="320 x 180, fetched once and decoded once" fontSize={12} color="textMuted" />
      </column>
    </row>
  );
}
// #endregion named

/** The whole example: four fits of one bitmap, and a named picture. */
export function MediaImages(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <column gap={18} x="center" y="center" width={percent(100)} height={percent(100)} padding={20}>
      <row gap={14} y="start">
        {FITS.map(fit => (
          <Fitted key={fit} fit={fit} />
        ))}
      </row>
      <Card />
    </column>
  );
}
