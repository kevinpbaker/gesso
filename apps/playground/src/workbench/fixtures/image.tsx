import { map } from 'rxjs/operators';

import { percent, type ObjectFit } from 'gesso-core';
import { Button, Image } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** 96 by 54, served by the playground itself, so nothing goes to another host. */
const SWATCH = '/swatch.png';
/** A 16 by 16 PNG of four coloured quarters (red, blue, yellow, green), inline. */
const QUARTERS =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJ0lEQVR42mN4FmCDFdn0PMOKGEY10ETDrxNGWJHNqiisaFQDTTQAAA3GlRBYBvOwAAAAAElFTkSuQmCC';
/** Served by the dev server as a 404. */
const MISSING = '/no-such-image.png';
/** A data url that decodes to bytes that are not a picture. */
const CORRUPT = 'data:image/png;base64,AAAAAAAAAAAAAAAA';

const FITS: readonly ObjectFit[] = ['cover', 'contain', 'fill', 'none'];

/** One box whose source is cycled through good, inline, missing and back. */
function Cycling(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const sources = [SWATCH, QUARTERS, MISSING];
  const at = internalState(0);
  const src = at.pipe(map(index => sources[index % sources.length]));
  return (
    <column gap={8} x="start">
      <Image src={src} alt="Cycling picture" width={112} height={72} borderRadius={8} />
      <row gap={8} y="center">
        <Button label="Next source" size="small" onClick={() => (at.value += 1)} />
        <text textStyle="bodySmall" color="textMuted">
          {src.pipe(map(value => (value.startsWith('data:') ? 'inline quarters' : value)))}
        </text>
      </row>
    </column>
  );
}

export const imageFixture: WorkbenchFixture = {
  id: 'image',
  name: 'Image',
  source: 'packages/components/src/Media.ts',
  states: [
    {
      name: 'Fits',
      try: 'The swatch in four 112 by 72 boxes. cover fills and crops the sides, contain shows it whole with bands above and below, fill squashes it, none draws it at its own 96 by 54 and centred. Nothing spills out of a box.',
      width: 560,
      render: () => (
        <row gap={12}>
          {FITS.map(fit => (
            <column key={fit} gap={4} x="start">
              <Image src={SWATCH} alt={fit} width={112} height={72} objectFit={fit} borderRadius={8} />
              <text textStyle="bodySmall" color="textMuted">
                {fit}
              </text>
            </column>
          ))}
        </row>
      )
    },
    {
      name: 'Tiny source scaled up',
      try: 'A 16 by 16 inline picture at 16, 48 and 96: four clean quarters, red and blue on top, yellow and green below, the same at every size.',
      width: 320,
      render: () => (
        <row gap={12} y="end">
          {[16, 48, 96].map(side => (
            <Image key={String(side)} src={QUARTERS} alt="Quarters" width={side} height={side} />
          ))}
        </row>
      )
    },
    {
      name: 'Broken sources',
      try: 'A 404 and a corrupt inline picture: each keeps its placeholder tint (the default, and danger), stays the size it was given, and nothing else on the page breaks.',
      width: 320,
      render: () => (
        <row gap={12}>
          <Image src={MISSING} alt="Missing" width={112} height={72} borderRadius={8} />
          <Image src={CORRUPT} alt="Corrupt" width={112} height={72} borderRadius={8} placeholderColor="danger" />
        </row>
      )
    },
    {
      name: 'Fallback list',
      try: 'The first source is missing, so the second is shown: the swatch appears, not a placeholder.',
      render: () => <Image src={[MISSING, SWATCH]} alt="Mirrored swatch" width={112} height={72} borderRadius={8} />
    },
    {
      name: 'Changing source',
      try: 'Press Next source: swatch → quarters → missing → swatch. Each new picture replaces the old one completely; on missing the box goes back to its tint, not to the last picture.',
      width: 320,
      render: () => <Cycling />
    },
    {
      name: 'Rounding',
      try: 'Corners of 0, 12 and 36 on a 72 square: the picture is clipped to the rounding, and 36 is a circle with no square corners showing.',
      width: 320,
      render: () => (
        <row gap={12}>
          {[0, 12, 36].map(radius => (
            <Image key={String(radius)} src={SWATCH} alt="Rounded" width={72} height={72} borderRadius={radius} />
          ))}
        </row>
      )
    },
    {
      name: 'Stretched to its cell',
      try: 'A percentage width: the picture spans the whole cell at 80 high, cropped top and bottom (cover) rather than stretched out of shape.',
      width: 360,
      stretch: true,
      render: () => <Image src={SWATCH} alt="Wide" width={percent(100)} height={80} borderRadius={8} />
    },
    {
      name: 'Many of one source',
      try: 'Twelve thumbnails of the same picture appear together, all identical, with none stuck on its tint.',
      width: 360,
      render: () => (
        <row gap={6} rowGap={6} flexWrap="wrap">
          {Array.from({ length: 12 }, (_, index) => (
            <Image key={String(index)} src={SWATCH} width={48} height={48} borderRadius={6} />
          ))}
        </row>
      )
    }
  ]
};
