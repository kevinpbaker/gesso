import { map } from 'rxjs/operators';

import { Avatar, type AvatarShape, type AvatarSize, Button, Chip } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const SIZES: readonly (AvatarSize | number)[] = ['small', 'medium', 'large', 96];
const SHAPES: readonly AvatarShape[] = ['circle', 'square'];

/** 96 by 54, served by the playground itself: wider than it is tall, so `cover` has something to crop. */
const SWATCH = '/swatch.png';
/** A 16 by 16 PNG of four coloured quarters, inline, so it needs no request at all. */
const QUARTERS =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJ0lEQVR42mN4FmCDFdn0PMOKGEY10ETDrxNGWJHNqiisaFQDTTQAAA3GlRBYBvOwAAAAAElFTkSuQmCC';

/** A ring, on the usual 24 grid, to stand in for the default person glyph. */
const RING = 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 7a5 5 0 1 1 0 10a5 5 0 1 1 0-10z';

/** Pictures that can be switched off, walking each avatar down to its initials and back. */
function Pictures(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const on = internalState(true);
  return (
    <column gap={10} x="start">
      <Chip label="Show pictures" size="small" variant="outlined" selected={on} onPress={next => (on.value = next)} />
      <row gap={10} y="center">
        <Avatar src={on.pipe(map(yes => (yes ? SWATCH : '')))} name="Ada Lovelace" />
        <Avatar src={on.pipe(map(yes => (yes ? QUARTERS : '')))} name="Grace Hopper" shape="square" />
        <Avatar src={on.pipe(map(yes => (yes ? [SWATCH] : [])))} name="Katherine Johnson" size="large" />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {on.pipe(map(yes => (yes ? 'Pictures on' : 'Pictures off: initials')))}
      </text>
    </column>
  );
}

/** One avatar whose size steps through the scale, so a resize can be watched. */
function Growing(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const steps: readonly (AvatarSize | number)[] = ['small', 'medium', 'large', 128];
  const at = internalState(0);
  const size = at.pipe(map(index => steps[index % steps.length]));
  return (
    <column gap={10} x="start">
      <Button label="Next size" size="small" onClick={() => (at.value += 1)} />
      <row gap={10} y="center">
        <Avatar name="Ada Lovelace" size={size} />
        <Avatar src={SWATCH} name="Ada Lovelace" size={size} shape="square" />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {size.pipe(map(value => `size: ${value}`))}
      </text>
    </column>
  );
}

export const avatarFixture: WorkbenchFixture = {
  id: 'avatar',
  name: 'Avatar',
  source: 'packages/components/src/Avatar.ts',
  states: [
    {
      name: 'Sizes and shapes',
      try: 'Four sizes per row (24, 40, 64, 96), centres on one line. The initials are centred in each disc and grow with it. Square ones have rounded corners, not sharp ones.',
      width: 360,
      render: () => (
        <column gap={12} x="start">
          {SHAPES.map(shape => (
            <row key={shape} gap={10} y="center">
              {SIZES.map(size => (
                <Avatar key={String(size)} name="Grace Hopper" size={size} shape={shape} />
              ))}
            </row>
          ))}
        </column>
      )
    },
    {
      name: 'Fallback chain',
      try: 'Left to right: a picture (cropped, not squashed), a tiny inline picture, initials AL from the name, KJ given explicitly, and the person glyph when there is no name at all.',
      width: 360,
      render: () => (
        <row gap={10} y="center">
          <Avatar src={SWATCH} name="Ada Lovelace" size="large" />
          <Avatar src={QUARTERS} name="Grace Hopper" size="large" />
          <Avatar name="Ada Lovelace" size="large" />
          <Avatar name="Katherine Johnson" initials="KJ" size="large" />
          <Avatar size="large" />
        </row>
      )
    },
    {
      name: 'Pictures on and off',
      try: 'Turn Show pictures off: each disc keeps its size and shows initials; on again, the pictures return without a flash of the glyph.',
      width: 320,
      render: () => <Pictures />
    },
    {
      name: 'Initials from awkward names',
      try: 'Each disc shows one or two whole characters, centred, never a box or a half character (no �): A, AL, AL, ÉZ, 🦊F, अक, 山太, and the padded name trims to JD.',
      width: 360,
      render: () => (
        <row gap={8} y="center" flexWrap="wrap">
          {[
            'Ada',
            'Ada B. Lovelace',
            'ada lovelace',
            'émile zola',
            '🦊 Fox',
            'अनिल कुमार',
            '山田 太郎',
            '   jane   doe  '
          ].map(name => (
            <Avatar key={name} name={name} />
          ))}
        </row>
      )
    },
    {
      name: 'Broken picture',
      try: 'The source 404s. Look at what is left: today it is an empty placeholder disc, not the GH initials beside it. Decide whether that is acceptable.',
      render: () => (
        <row gap={10} y="center">
          <Avatar src="/no-such-avatar.png" name="Grace Hopper" size="large" />
          <Avatar name="Grace Hopper" size="large" />
        </row>
      )
    },
    {
      name: 'Blank sources',
      try: 'An empty string, an empty list and a list of blanks all fall straight through to the initials, with no placeholder pause first.',
      render: () => (
        <row gap={10} y="center">
          <Avatar src="" name="Ada Lovelace" />
          <Avatar src={[]} name="Ada Lovelace" />
          <Avatar src={['  ', '']} name="Ada Lovelace" />
        </row>
      )
    },
    {
      name: 'Growing',
      try: 'Press Next size: both avatars step 24 → 40 → 64 → 128 and back, staying round or rounded-square, with the initials and the picture rescaled, not clipped.',
      width: 320,
      render: () => <Growing />
    },
    {
      name: 'Custom glyph',
      try: 'A ring instead of a person, centred in the disc and in the muted ink at every size.',
      render: () => (
        <row gap={10} y="center">
          <Avatar icon={RING} size="small" />
          <Avatar icon={RING} size="medium" />
          <Avatar icon={RING} size="large" shape="square" />
        </row>
      )
    },
    {
      name: 'Squeezed row',
      try: 'The avatar keeps its full circle while the name beside it wraps or clips.',
      width: 140,
      stretch: true,
      render: () => (
        <row gap={8} y="center">
          <Avatar name="Katherine Johnson" />
          <text flexShrink={1} minWidth={0}>
            Katherine Coleman Goble Johnson
          </text>
        </row>
      )
    }
  ]
};
