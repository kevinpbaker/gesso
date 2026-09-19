import { percent, DefaultImageResolver, type ImageResolver, type UiImage } from '@gesso/core';
import { Avatar, Chip } from '@gesso/components';
import { computed, internalState, type ComponentContext, type Inputs } from '@gesso/framework';

// #region resolver
/**
 * The two portraits this page draws, painted rather than fetched.
 *
 * A documentation page has no business going to the network, so each
 * one is drawn into an `OffscreenCanvas` and handed over as an
 * `ImageBitmap`, which is exactly what `createImageBitmap` would have
 * produced from a downloaded JPEG. They are square, because that is
 * what an avatar's `cover` fit expects, and they differ in hue so that
 * two faces in a row are visibly two.
 *
 * Under a spec there is no `OffscreenCanvas` and nothing draws
 * anything: a stub with a size stands in, because the paint state
 * reads a bitmap's width and height and the recording canvas never
 * looks at its pixels.
 */
async function portrait(hue: number): Promise<UiImage> {
  const size = { width: 160, height: 160 };
  if (typeof OffscreenCanvas === 'undefined') {
    return { ...size, close: () => {} } as unknown as UiImage;
  }
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d');
  if (context === null) {
    return { ...size, close: () => {} } as unknown as UiImage;
  }
  const wash = context.createLinearGradient(0, 0, 0, size.height);
  wash.addColorStop(0, `hsl(${hue}, 62%, 62%)`);
  wash.addColorStop(1, `hsl(${hue + 40}, 52%, 38%)`);
  context.fillStyle = wash;
  context.fillRect(0, 0, size.width, size.height);
  context.fillStyle = 'rgba(255, 255, 255, 0.72)';
  context.beginPath();
  context.arc(80, 62, 30, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(80, 176, 62, Math.PI, Math.PI * 2);
  context.fill();
  return canvas.transferToImageBitmap();
}

/**
 * The resolver every `Avatar` on this page is served by.
 *
 * `DefaultImageResolver` with both of its seams replaced: `fetch`
 * answers with the url in a blob instead of making a request, and
 * `decode` reads that back and paints a portrait in a hue chosen from
 * it. Everything in front of those two is the real thing, so two
 * avatars naming one source still share one decode.
 */
export function portraitResolver(): ImageResolver {
  return new DefaultImageResolver({
    fetch: source => Promise.resolve(new Blob([source])),
    decode: async blob => portrait((await blob.text()) === 'grace.jpg' ? 268 : 196)
  });
}
// #endregion resolver

// #region avatar
/** Who the list is of, and whether a picture was ever uploaded. */
const PEOPLE = [
  { name: 'Ada Lovelace', handle: '@ada', picture: 'ada.jpg' },
  { name: 'Grace Hopper', handle: '@grace', picture: 'grace.jpg' },
  { name: 'Katherine Johnson', handle: '@katherine', picture: '' },
  { name: '', handle: 'not signed in', picture: '' }
] as const;

/**
 * A list of people, and the three grounds an avatar can stand on.
 *
 * Every row draws the same component with the same props. What differs
 * is only what the data has: Ada and Grace have a picture, Katherine
 * has a name and no picture, so her initials are derived from it, and
 * the last row has neither, so it gets the generic glyph. Turning
 * "Show pictures" off empties every `src`, which walks the first two
 * rows down the chain to their initials without anything else in the
 * tree changing.
 *
 * Note which avatars are announced. The ones in the list carry
 * `label=""`, which declares them decorative: the name is written
 * beside each one, and a reader who heard both would hear the person
 * twice. The four at the bottom stand alone, so each is an `image`
 * named by its person, and the last of those is silent again because
 * it has no person to name.
 *
 * Nothing here names a colour. The disc under a picture that has not
 * arrived, the ground behind a pair of initials and the ground behind
 * the glyph are all the theme's `placeholder`, which is the token that
 * exists for exactly this: something standing in for content that is
 * not there.
 */
export function People(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const pictures = internalState(true);

  return (
    <column gap={16} padding={20} width={percent(100)} height={percent(100)}>
      <row gap={8} y="center">
        <Chip
          label="Show pictures"
          variant="outlined"
          size="small"
          selected={pictures}
          onPress={next => (pictures.value = next)}
        />
        <text text="Turn it off to walk every row down the fallback chain." textStyle="bodySmall" color="textMuted" />
      </row>
      <column gap={10}>
        {PEOPLE.map(person => (
          <row key={person.handle} gap={10} y="center">
            <Avatar
              src={computed(() => (pictures.value ? person.picture : ''))}
              name={person.name}
              size="medium"
              label=""
            />
            <column gap={2}>
              <text text={person.name === '' ? 'Guest' : person.name} textStyle="body" />
              <text text={person.handle} textStyle="bodySmall" color="textMuted" />
            </column>
          </row>
        ))}
      </column>
      <row gap={12} y="center" flexWrap="wrap" rowGap={12}>
        <Avatar src={computed(() => (pictures.value ? 'ada.jpg' : ''))} name="Ada Lovelace" size="small" />
        <Avatar name="Grace Hopper" size="medium" />
        <Avatar name="Katherine Johnson" initials="KJ" size="large" shape="square" />
        <Avatar size={72} />
        <text
          text="Standing alone, each is announced by its person; the last has none, so it says nothing."
          textStyle="bodySmall"
          color="textMuted"
          flexShrink={1}
        />
      </row>
    </column>
  );
}
// #endregion avatar
