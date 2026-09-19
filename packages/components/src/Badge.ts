import { Row, Text, defaultSpacing, type UiChild, type UiLiveRegion, type UiRole } from '@gesso/core';

import { computed, input, type ComponentContext, type Inputs } from '@gesso/framework';

import { layoutOf, modifiersOf, type ControlLayoutProps } from './internals';

/**
 * A badge: a count or a short status marker attached to something else.
 *
 * The "3" on an inbox icon, the "Live" beside a title, the bare dot in
 * a sidebar that means something under here changed. It is the
 * smallest thing in the library: no interaction, no focus, no keyboard,
 * no state of its own. What it costs to get right is not the pill, it
 * is deciding what the pill *says*, and that is the whole of the design
 * below.
 *
 * Reach for `Chip` instead when the thing can be pressed. A chip is a
 * toggle and announces itself as a button; a badge is a fact about
 * something else and announces itself as little as it honestly can.
 *
 * ## Three tones, and no colour prop
 *
 * `neutral` is a `controlBackground` sheet with a `controlBorder` edge
 * and `controlForeground` words: the quiet one, for a count that is
 * only a count. `accent` and `danger` are the two loud ones, painted in
 * `controlAccent` and `danger` with `controlBackground` for words.
 *
 * That last pairing is not a guess. It is the one
 * `controlTokens.button.paint.filled` already makes for the same two
 * tones (`tokens.ts`), so a badge and a filled button of the same tone
 * agree, and whatever a theme does to keep its accent legible under a
 * button's words it has done for the badge's too. Every value here is a
 * palette name resolved at paint against the inherited theme, so the
 * table says nothing about light and dark and nothing about a
 * particular application (`COMPONENTS_ROADMAP.md` §2.3). There is no
 * colour prop and there will not be one; restyling a badge is a theme
 * provider around it.
 *
 * The table is local rather than a group on `controlTokens` for one
 * reason only: the tones map onto tokens that already exist, and adding
 * a `badge` group would be a fourth thing to keep in step for a
 * component with three colours. `Chip` carries its own table for the
 * same reason. When a second component wants these three grounds, they
 * move to the theme together.
 *
 * ## What it says, which is the whole design
 *
 * §2.4 is that semantics are declared and never inferred, and the
 * honest declaration for most badges is *nothing*:
 *
 *   - **A plain badge declares no role and no name.** The figure or the
 *     word inside it is a `Text` node, and the semantics tree gives
 *     prose a record of its own, so "3" and "Live" are already read by
 *     a screen reader walking the region they sit in. Wrapping them in
 *     a `status` nobody asked for would announce a number that has not
 *     changed, every time focus passes it. A decorative marker is
 *     better declaring nothing than having a role guessed for it.
 *   - **`live` is the opt-in for a badge whose changes matter.** It
 *     makes the pill `role: 'status'` with a polite live region, which
 *     is exactly the pair: `status` is the role, `polite` is the
 *     urgency, and the announcement happens because the text under the
 *     region changed rather than because focus went anywhere. An unread
 *     count that ticks up while the person is reading something else is
 *     what this is for. Most badges are not, so it is off by default.
 *   - **`name` is for when the drawn text cannot be the name.** Given
 *     one, the pill takes `role: 'image'` and carries the name: a
 *     graphic with a text alternative, which is what a marker with a
 *     meaning beyond its glyph actually is. The role matters as much as
 *     the name does, because `image` makes the pill's children
 *     presentational, so "3" is announced once as "3 unread messages"
 *     rather than twice, as itself and then as its alternative.
 *
 * ## The nameless dot is a defect, and says so
 *
 * `dot` draws a bare circle and no text. A dot with no `name` therefore
 * has nothing in it for the semantics tree to read and nothing declared
 * about it, so it is invisible to an assistive technology: the sighted
 * reader sees "something changed here" and nobody else is told
 * anything. That is not a style choice a caller can have meant, so the
 * component says so once, with `console.warn`, the way `each` warns
 * about an index-keyed list. It is a warning rather than a throw
 * because a missing name breaks one reader's experience of one marker,
 * and taking the application down over it would be worse than the
 * defect.
 *
 * ## Deviations from the proposed shape
 *
 * None in the props, and one in the reading of them. `dot`, `live` and
 * whether `name` was supplied are read **once**, when the badge is
 * built, because each decides the badge's shape or its role rather than
 * a value inside it, and a component body runs once (§2.1). A badge
 * that has to become live, or to stop being a dot, changes its `key`
 * and is built again, which is the same rule `Button` and `Chip` state
 * for their variants. Everything else, `label`, `count`, `max`, `tone`
 * and the text of `name`, is bound and follows a cell as it changes.
 */
export type BadgeTone = 'neutral' | 'accent' | 'danger';

export interface BadgeProps extends ControlLayoutProps {
  /** The word on it: "Live", "Beta", "Failed". */
  label?: string;
  /**
   * A figure instead of a word, drawn through `max` so the caller does
   * no string arithmetic. Supplying both draws the count, because a
   * count is the more specific of the two.
   *
   * A count of 0 draws "0". Whether a badge with nothing to count
   * should be there at all is the caller's conditional, because only
   * the caller knows whether zero is worth saying.
   */
  count?: number;
  /**
   * The largest figure drawn as itself; above it the badge draws
   * `99+`. Default 99.
   *
   * It exists so that "99+" is not the caller's string arithmetic, and
   * so that the pill has a width it cannot outgrow.
   */
  max?: number;
  /** Which of the three grounds it is painted on. Default `neutral`. */
  tone?: BadgeTone;
  /**
   * A bare dot: no text, a fixed circle in the tone's ground.
   *
   * It needs a `name` to mean anything, and warns once when it has
   * none.
   */
  dot?: boolean;
  /**
   * The accessible name, when the drawn text cannot be it.
   *
   * "3" on an inbox is `name="3 unread messages"`; a dot has no text at
   * all and this is the only thing it can say. Given one, the pill is
   * an `image` carrying the name, and the text inside it is
   * presentational rather than announced twice.
   */
  name?: string;
  /**
   * Whether a change to the badge is announced. Default false.
   *
   * On, the pill is a `status` with a polite live region, so an
   * assistive technology reads the new value when it changes without
   * focus moving there. Read once: see the deviation note above.
   */
  live?: boolean;
}

export function Badge(inputs: Inputs<BadgeProps>, _ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const count = input(inputs.count, undefined);
  const max = input(inputs.max, DEFAULT_MAX);
  const tone = input(inputs.tone, 'neutral');
  const given = input(inputs.name, undefined);

  // Read once, as `Button` reads its variant and `Divider` its
  // direction: each of these decides the badge's shape or the role it
  // declares, not a value bound inside it, and a component body runs
  // once. A badge that has to change one of them changes its `key`.
  const dot = input(inputs.dot, false).value === true;
  const live = input(inputs.live, false).value === true;
  const named = inputs.name.value !== undefined;

  if (dot && !named) {
    warnNamelessDot();
  }

  const ground = <R>(read: (paint: BadgeGround) => R) => computed(() => read(TONES[tone.value ?? 'neutral']));

  /**
   * The figure, or the word.
   *
   * `count` wins over `label` because it is the more specific of the
   * two, and because a caller who passed both has said one thing twice
   * rather than asked for both to be drawn.
   */
  const content = computed(() => {
    const figure = count.value;
    return figure === undefined ? label.value : format(figure, max.value ?? DEFAULT_MAX);
  });

  const children: UiChild[] = dot
    ? []
    : [
        Text({
          text: content,
          // A role rather than a size, so the figure on a badge is set
          // in the same type as the words it sits beside and follows
          // the theme with them.
          textStyle: 'bodySmall',
          fontWeight: 600,
          color: ground(paint => paint.foreground),
          textWrap: 'none',
          selectable: false
        })
      ];

  return Row(
    {
      ...layoutOf(inputs),
      // No modifiers of its own: a badge has no hover, no press and no
      // focus ring to draw. `modifiersOf` is still how the caller's
      // `rootModifiers` reach the root, which is the seam a motion or a
      // shared element needs.
      modifiers: modifiersOf(inputs),
      width: dot ? DOT : undefined,
      height: dot ? DOT : undefined,
      paddingX: dot ? 0 : PADDING_X,
      paddingY: dot ? 0 : PADDING_Y,
      x: 'center',
      y: 'center',
      // Larger than any height a badge can have, so a dot is a circle
      // and a figure sits in a pill.
      borderRadius: PILL,
      backgroundColor: ground(paint => paint.background),
      borderWidth: ground(paint => (paint.border === undefined ? 0 : 1)),
      borderColor: ground(paint => paint.border),
      // A badge is attached to something, and that something is usually
      // the thing worth clicking. Transparent to the pointer, so a
      // count sitting over an inbox icon does not swallow the press on
      // the icon, for the reason `Divider` is.
      hitTestable: false,
      // A badge beside a title is the first thing a tight row gives up
      // width on, and half a count is worse than none.
      flexShrink: 0,
      role: roleOf(live, named),
      label: named ? given : undefined,
      live: live ? POLITE : undefined
    },
    ...children
  );
}

/**
 * The role, decided once.
 *
 * `status` when the badge is live, because that is the role a polite
 * live region belongs to. `image` when it is merely named, because a
 * named marker is a graphic with a text alternative and because
 * `image` makes the pill's children presentational, which is what
 * stops a named count being announced as itself and then as its name.
 * Nothing otherwise: prose inside the badge is already read, and a role
 * invented for a decoration is §2.4's failure mode.
 */
function roleOf(live: boolean, named: boolean): UiRole | undefined {
  if (live) {
    return 'status';
  }
  return named ? 'image' : undefined;
}

/** The figure, capped. */
function format(count: number, max: number): string {
  return count > max ? `${max}+` : String(count);
}

/** Said once: every nameless dot has the same problem and the same fix. */
let warnedAboutNamelessDot = false;

function warnNamelessDot(): void {
  if (warnedAboutNamelessDot) {
    return;
  }
  warnedAboutNamelessDot = true;
  console.warn(
    `A Badge with \`dot\` and no \`name\` is invisible to a screen reader. A dot draws no text, so ` +
      `there is no prose inside it to read, and without a name nothing declares what the dot means: ` +
      `the sighted reader is told something changed and nobody else is told anything. ` +
      `Pass \`name\` saying what it marks: name="3 unread messages", or name="Unsaved changes".`
  );
}

/** Larger than any height a badge can have. */
const PILL = 999;

/** The bare dot, at the size a marker beside a line of text wants. */
const DOT = 8;

/**
 * The pill's own metrics, from the spacing scale rather than from
 * numbers chosen here, and the default scale's values rather than the
 * inherited theme's, for the reason `Chip` gives: a component cannot
 * read the environment while its body runs.
 */
const PADDING_X = defaultSpacing.small;
const PADDING_Y = defaultSpacing.hairline;

/** Above this a count draws as `99+`. */
const DEFAULT_MAX = 99;

const POLITE: UiLiveRegion = 'polite';

/** What one tone is painted with. Every value is a palette name. */
interface BadgeGround {
  readonly background: string;
  readonly foreground: string;
  readonly border?: string;
}

/**
 * Three grounds, written out.
 *
 * `neutral` is the only one with an edge, and it needs one: its ground
 * is `controlBackground`, which is the colour of a surface, so without
 * a `controlBorder` ring a neutral badge on a card would have no shape
 * at all. The two loud tones are their own shape.
 *
 * `controlBackground` is the words on both loud grounds, which is the
 * pairing `controlTokens.button.paint.filled` makes for `accent` and
 * `danger`. It inverts with the appearance by itself, and it means a
 * theme that has raised the contrast under its filled buttons has
 * raised it here too rather than leaving the badge behind.
 */
const TONES: Readonly<Record<BadgeTone, BadgeGround>> = {
  neutral: {
    background: 'controlBackground',
    foreground: 'controlForeground',
    border: 'controlBorder'
  },
  accent: {
    background: 'controlAccent',
    foreground: 'controlBackground'
  },
  danger: {
    background: 'danger',
    foreground: 'controlBackground'
  }
} as const;
