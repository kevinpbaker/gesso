import { combineLatest, filter, map, type Observable } from 'rxjs';

import { computed, createComponent, input, show, type ComponentContext, type Inputs } from '@gesso/framework';
import { Box, nextGraphemeEnd, Text, type UiChild, type UiNodeRef } from '@gesso/core';
import { layoutOf, type ControlLayoutProps, modifiersOf } from './internals';
import { Icon, Image } from './Media';

/**
 * A person or an entity, as a picture.
 *
 * The thing every screen with an account on it draws: a round picture
 * beside a name in a header, a column of them down a list of comments,
 * one large one at the top of a profile. Segue had written it twice
 * before this component existed, both times as a bare `Image` behind a
 * guard on a non-empty url (`AppHeader.tsx`, `ArtistScreen.tsx`), and
 * both times with the height hard-coded beside it. This absorbs that:
 * the guard is the fallback chain below, and the height is `size`.
 *
 * ## The fallback chain, and what limits it
 *
 * Three grounds, in order: the **picture** when there is a `src`, the
 * **initials** derived from `name` when there is not, and a **generic
 * glyph** when there is neither. Each layer is built the first time it
 * is shown and kept while it is shown (`show`), so an avatar whose
 * `src` arrives with the account swaps the initials for the picture
 * without rebuilding anything else, and one whose url merely changes
 * keeps the same `Image` and lets it follow the new source.
 *
 * **The chain cannot include a failed load, and this is the reason.**
 * `Image` is handed an `onState` by `imageSource` and hears `loading`,
 * `loaded` and `failed` — but it keeps that in an `internalState` of
 * its own and spends it on the placeholder tint. `ImageProps` has no
 * `onError`, no `onState` and no status output of any kind, so nothing
 * outside an `Image` can learn that its source did not resolve; the
 * `Image` documentation page says as much, in the words "there is no
 * error slot: draw your own beside it". So this component falls back
 * on an **absent or empty `src` only**, which is a question it can
 * actually answer, rather than pretending to a recovery it has no way
 * to trigger. A url that 404s leaves the avatar showing the
 * `placeholder` ground the `Image` is tinted with, which is the same
 * ground the initials would have stood on, so the failure degrades to
 * a blank disc rather than to a hole. If `ImageProps` ever grows a
 * status output, the third branch of `layer` below is the one line
 * that changes.
 *
 * ## Nothing here is a colour prop
 *
 * The ground is `placeholder`, the palette token added for exactly
 * this role: something standing in for content that has not arrived.
 * Not `border`, which would tie a filled disc to the colour of a rule,
 * and not `controlBackgroundPressed`, which would move every avatar on
 * the screen when a theme adjusted how a button looks while held. The
 * initials are `text` and the glyph is `textMuted`, and the difference
 * is deliberate: initials are information and have to be read, while
 * the glyph says only "no picture" and should not shout it.
 */
export type AvatarShape = 'circle' | 'square';
export type AvatarSize = 'small' | 'medium' | 'large';

export interface AvatarProps extends ControlLayoutProps {
  /** Receives the node that *is* the avatar, for anchoring a menu to it. */
  ref?: UiNodeRef;
  /**
   * The picture: a url, or several for the same face tried in order
   * until one resolves, as `Image` takes them. Absent or empty falls
   * through to the initials.
   *
   * Empty rather than merely absent, because the shape an application
   * actually holds is `account.avatar`, which is sometimes `''` and
   * sometimes an empty list; making the caller turn either into
   * `undefined` is the guard this component exists to absorb. Segue's
   * header held exactly that list, with a `show()` around it doing the
   * emptiness check by hand.
   */
  src?: string | readonly string[];
  /**
   * The person or entity. The initials are derived from it, and it is
   * the accessible name unless `label` says otherwise.
   *
   * One prop for both because they cannot disagree: an avatar that
   * draws "AL" and announces someone else is a bug that two props
   * would make available.
   */
  name?: string;
  /**
   * The initials to draw, when the derived ones are wrong.
   *
   * For a name the rule below cannot read the way a reader would: a
   * company that goes by three letters, a handle that is not a name,
   * a person whose family name comes first. Empty is the same as
   * absent, so a caller may pass a bound value that is sometimes blank
   * without having to map it to `undefined`.
   */
  initials?: string;
  /**
   * SVG path data for the last-resort glyph, on the usual 24 grid.
   * Defaults to a generic person.
   */
  icon?: string;
  /**
   * A named step, or the side in logical pixels.
   *
   * `small` is 24, the size `AppHeader` draws beside a word; `medium`
   * is 40, a row in a list of comments; `large` is 64, a card. A
   * number is for the sizes a scale should not carry a name for: the
   * 128 at the top of `ArtistScreen` is a page's hero, not a step
   * every caller should have to choose between.
   */
  size?: AvatarSize | number;
  /** `circle`, the default, or a rounded `square`. */
  shape?: AvatarShape;
  /**
   * The accessible name, overriding `name`.
   *
   * **`''` declares the avatar decorative**: no role, no name, and
   * nothing in the semantics tree at all. That is the case an
   * application hits most often and gets wrong most often. An avatar
   * beside the name it depicts is a picture of a word that is already
   * on the screen, and announcing it makes a reader hear "Ada
   * Lovelace, image, Ada Lovelace"; `AppHeader` passes `alt=""` to its
   * bare `Image` today for precisely this reason. An avatar that
   * stands alone, in a grid of faces or a stack of authors, is the
   * only thing naming the person and must announce them.
   *
   * The default is `name`, so the standalone case is the one that
   * works without thinking and the silent one is declared. Leaving
   * both off is also decorative, because an avatar with no name has
   * nothing to say.
   */
  label?: string;
}

/** Which of the three grounds an avatar is showing. */
type AvatarLayer = 'picture' | 'initials' | 'glyph';

/**
 * The named steps, in logical pixels.
 *
 * Three rather than the five a palette of sizes might have, because
 * `size` also takes a number: a named step earns its name by being
 * reached for repeatedly, and these are the three the two applications
 * reach for. Anything else is a number at the call site, where the
 * reason for it is visible.
 */
const SIZES: Readonly<Record<AvatarSize, number>> = {
  small: 24,
  medium: 40,
  large: 64
} as const;

/**
 * How much of the box the initials and the glyph take.
 *
 * Proportions rather than a table of sizes, because `size` is a number
 * as often as it is a step and a table would have nothing to say about
 * 128. The type is 40% of the side, which keeps two capitals inside a
 * disc at every size, and the glyph is 60%, which is what a
 * shoulders-up figure needs to look centred rather than small.
 */
const TYPE_RATIO = 0.4;
const GLYPH_RATIO = 0.6;

/**
 * A rounded square's radius, as a fraction of its side.
 *
 * Proportional for the reason the type is: one number would be a blob
 * at 24 and a sharp corner at 128. It is not a step of the shape scale
 * on purpose, for the reason `decisions/0096` gives: the shared scale
 * has no name for a radius that is a function of a box, and inventing
 * one for a library's sake puts the library's taste in everyone's
 * vocabulary.
 */
const SQUARE_RATIO = 1 / 6;

/**
 * The most a derived pair of initials can be.
 *
 * Two, because three is a monogram and a monogram needs a middle name
 * nobody stores. A caller who wants three passes `initials`.
 */
const MAX_INITIALS = 2;

/** A generic person, shoulders up, on the 24 grid every icon here uses. */
const PERSON =
  'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z';

export function Avatar(inputs: Inputs<AvatarProps>, _ctx: ComponentContext): UiChild {
  // Normalised to a candidate list, so the two places that ask
  // "is there a picture?" and the one that hands it to `Image` all
  // read the same shape, and a list of nothing but blanks counts as
  // no picture rather than as a fetch that can only fail.
  const source = input(inputs.src, '' as string | readonly string[]).pipe(
    map(value => (typeof value === 'string' ? [value] : value).map(url => url.trim()).filter(url => url.length > 0))
  );
  const name = input(inputs.name, '').pipe(map(person => person.trim()));
  const given = input(inputs.initials, '').pipe(map(text => text.trim()));

  // Every metric follows `size`, rather than being read once, because
  // an avatar that grows is a thing a screen does: the header's
  // picture becomes the profile's when a page opens under it. Reading
  // the step once would make that a `key` change, and a `key` change
  // is exactly what a shared-element morph between the two must not
  // have.
  const sizeCell = input(inputs.size, 'medium' as AvatarSize | number);
  const shape = input(inputs.shape, 'circle' as AvatarShape);
  const side = computed(() => sideOf(sizeCell.value));
  const radius = computed(() => (shape.value === 'square' ? Math.round(side.value * SQUARE_RATIO) : side.value / 2));
  const typeSize = computed(() => Math.round(side.value * TYPE_RATIO));
  const glyphSize = computed(() => Math.round(side.value * GLYPH_RATIO));

  const initials = combineLatest([given, name]).pipe(
    map(([explicit, person]) => (explicit.length > 0 ? explicit : deriveInitials(person)))
  );

  const layer: Observable<AvatarLayer> = combineLatest([source, initials]).pipe(
    map(([candidates, text]) => (candidates.length > 0 ? 'picture' : text.length > 0 ? 'initials' : 'glyph'))
  );
  const showing = (which: AvatarLayer): Observable<boolean> => layer.pipe(map(current => current === which));

  /**
   * What is announced: `label` if it was given, else `name`, and
   * nothing at all when whichever one applies is empty.
   *
   * One stream for the role and the name, so the two can never
   * disagree and produce the unnamed `image` record `Image`'s docblock
   * warns about.
   */
  const announced = combineLatest([inputs.label, name]).pipe(map(([override, person]) => (override ?? person).trim()));

  return Box(
    {
      ...layoutOf(inputs),
      ref: inputs.ref?.value,
      modifiers: modifiersOf(inputs),
      width: side,
      height: side,
      borderRadius: radius,
      // An avatar in a row of things that do not fit is the last thing
      // that should give way: it is the only one of them that is a
      // person.
      flexShrink: 0,
      backgroundColor: 'placeholder',
      // The picture is clipped by its own radius as well, so this
      // matters only for the glyph at a large size; it costs nothing
      // and it is what makes the disc a disc whatever is inside it.
      overflow: 'hidden',
      x: 'center',
      y: 'center',
      role: announced.pipe(map(text => (text.length > 0 ? ('image' as const) : undefined))),
      label: announced.pipe(map(text => (text.length > 0 ? text : undefined))),
      // A face is not selectable text, and must not swallow a drag
      // meant for the list it sits in. The same rule `Image` follows.
      selectable: false
    },
    // Three siblings rather than a nested choice, because `show`
    // builds its child once and keeps it: the picture is not rebuilt
    // when the initials it replaced come back, and exactly one of the
    // three is in the tree at a time.
    show(showing('picture'), () =>
      createComponent(Image, {
        // Never the empty string: an `Image` given one asks the
        // resolver to fetch it, which is a request that can only fail.
        src: source.pipe(filter(candidates => candidates.length > 0)),
        width: side,
        height: side,
        borderRadius: radius,
        objectFit: 'cover',
        // The same ground the initials stand on, so the disc does not
        // change colour between waiting for a picture and having none.
        placeholderColor: 'placeholder'
        // No `alt`: the avatar itself carries the role and the name,
        // and a second record inside it would announce the person
        // twice.
      })
    ),
    show(showing('initials'), () =>
      Text({
        text: initials,
        // A size rather than a type role, which is the one place this
        // component departs from the house rule that text names a
        // role. A role is a fixed size and these have to be a fraction
        // of a box that ranges from 24 to 128; `bodySmall` inside a
        // 128 disc is a typo rather than a monogram.
        fontSize: typeSize,
        fontWeight: 600,
        color: 'text',
        textWrap: 'none',
        selectable: false
      })
    ),
    show(showing('glyph'), () =>
      createComponent(Icon, {
        path: computed(() => inputs.icon.value ?? PERSON),
        size: glyphSize,
        color: 'textMuted'
      })
    )
  );
}

/** A named step's side, or the number the caller gave. */
function sideOf(size: AvatarSize | number): number {
  return typeof size === 'number' ? size : SIZES[size];
}

/**
 * The initials for a name: one letter from a single name, two from a
 * name with parts.
 *
 * "Ada Lovelace" is "AL", "Ada" is "A", and "Ada B. Lovelace" is "AL"
 * rather than "AB", because the pair a reader expects is the given and
 * the family name and a middle initial is neither. An empty name has
 * no initials, which is not a failure: it is what makes the glyph the
 * third link of the chain rather than a fourth prop to set.
 *
 * **The slice is by grapheme, never by code unit.** A name beginning
 * with an emoji, a flag, a Devanagari cluster or a letter with
 * combining marks is one visible character made of several code units,
 * and `text[0]` cuts it in half: half a surrogate pair is U+FFFD on
 * screen, and a base letter without its marks is the wrong letter.
 * `nextGraphemeEnd` is the runtime's own answer to this question, used
 * by the caret so that Backspace deletes a flag rather than half of
 * one, and it is the right answer here for the same reason. See
 * `TextBoundaries.ts`.
 *
 * Case is raised with `toLocaleUpperCase`, which is a no-op in the
 * scripts that have no case (CJK, Arabic, Hebrew, Devanagari) and
 * correct in the ones that do.
 */
export function deriveInitials(name: string): string {
  const parts = name.split(/\s+/u).filter(part => part.length > 0);
  if (parts.length === 0) {
    return '';
  }
  const chosen = parts.length === 1 ? [parts[0]] : [parts[0], parts[parts.length - 1]];
  const letters = chosen.slice(0, MAX_INITIALS).map(part => part.slice(0, nextGraphemeEnd(part, 0)));
  return letters.join('').toLocaleUpperCase();
}
