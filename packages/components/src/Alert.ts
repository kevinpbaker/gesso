import {
  Column,
  Row,
  Text,
  defaultShapes,
  defaultSpacing,
  type UiChild,
  type UiLiveRegion,
  type UiRole
} from 'gesso-core';

import { computed, createComponent, input, type ComponentContext, type Inputs } from 'gesso-framework';

import { layoutOf, modifiersOf, type ControlLayoutProps } from './internals';
import { Button } from './Button';

/**
 * An alert: a banner that stays where it was put.
 *
 * The strip across the top of a settings page saying the trial ends on
 * Friday, the line above a form saying the card was declined, the note
 * over a list saying the connection dropped and these numbers are an
 * hour old. It belongs to the region it sits in and it is still there
 * when the person comes back to that region, which is the whole
 * difference between it and `Toast`: a toast belongs to the screen,
 * says its piece over whatever is underneath and leaves on a timer. If
 * the message can be missed without cost, it is a toast. If the person
 * has to act on it, or will want to read it again, it is this.
 *
 * ## Three tones, because the palette has three
 *
 * `neutral`, `accent`, `danger`. Not four: `UiColors` has no `success`
 * token and no `warning` token, and a banner may not name a colour the
 * theme does not have. A `success` tone would have to be painted in a
 * green chosen here, which is the one thing a themed component cannot
 * do — it would survive the appearance toggle, ignore a nested theme
 * provider, and clash with the brand of the first application that
 * themed anything. An application that wants a green banner themes
 * `controlAccent`, or wraps the banner in a theme provider of its own;
 * that is the same answer `Button` and `Badge` give, and it is the
 * mechanism rather than a workaround.
 *
 * Adding `success` and `warning` to the palette is a defensible change.
 * It is a change to `UiColors`, both stock palettes, the two renderers'
 * fixtures and every theme an application has written, and it is not
 * this component's to make on the way past.
 *
 * ## The paint: an edge and an ink, not a ground
 *
 * A badge is a pill the size of a word, so a full `danger` ground on it
 * is a small red dot and reads as one. A banner is the width of a
 * region. The same treatment scaled up is a red wall with white words
 * across the top of a page, which is louder than nearly every message
 * that will ever go in one — a declined card is worth a sentence, not a
 * klaxon — and, painted in `danger` at that size, it takes over the
 * screen from the content it is a note about.
 *
 * So the ground is always `controlBackground`, the same sheet under all
 * three tones, and the tone is carried by two small things: the edge
 * around the banner and the ink of its title. That keeps the colour
 * proportional to the message, keeps the body text on the one ground
 * whose contrast against `controlForeground` and `textMuted` a theme
 * has already had to get right, and means a stack of banners in
 * different tones still reads as a stack rather than as a paint chart.
 *
 * The rejected alternative is the filled banner, `danger` edge to edge
 * with `controlBackground` words, matching `Badge`'s loud tones exactly.
 * It is more consistent with `Badge` and that is its whole case. It
 * loses on the two things that actually matter here: a filled banner
 * forces every word in it, including a dismiss button's, onto a ground
 * the theme only guaranteed for short labels, and it makes the
 * quietest thing on a page the loudest thing on it.
 *
 * The table is local to this file, as `Badge`'s and `Chip`'s are. That
 * is now the third local copy of the same three tones, which is one
 * past the point where a shared group is worth it: they should move
 * onto `controlTokens` together, as a `tone` group the three read, in a
 * change whose whole content is that move. Doing it from here would
 * edit a shared file to add a group only one of the three uses yet, and
 * leave the other two disagreeing with it.
 *
 * ## What it says, which is the rest of the design
 *
 * The same argument `Badge` makes, landing somewhere else because a
 * banner is not a decoration. A badge is a fact about something else
 * and declares as little as it honestly can; an alert is the thing
 * itself, it is why the region looks different, and a reader who is
 * told nothing about it is told nothing at all.
 *
 *   - **`live` defaults true**, because a banner that appears in
 *     response to something is news, and the person who needs it most
 *     is the one who is not looking at that part of the screen.
 *   - **`danger` and live is `role: 'alert'`, assertive.** `alert`
 *     carries an assertive live region in ARIA: it interrupts whatever
 *     is being read. That is correct for the card that was declined and
 *     wrong for everything else, and a library that made every banner
 *     assertive would teach people to turn the announcements off.
 *   - **Any other tone, live, is `role: 'status'`, polite.** The pair
 *     `Badge` uses: `status` is the role, `polite` is the urgency, and
 *     the announcement happens when the text under the region changes
 *     rather than when focus goes anywhere.
 *   - **`live={false}` is `role: 'region'` and no live region at all.**
 *     The standing banner: the trial-expiry notice that was on the page
 *     when it loaded and will be there tomorrow. Nothing about it has
 *     changed, so there is nothing to announce, and announcing it
 *     anyway every time focus passes is exactly the defect `Badge`
 *     refuses to commit with its decorative counts. As a `region` it is
 *     a landmark named by its title, so a reader can find it, skip it,
 *     and come back to it deliberately.
 *
 * ## The name, and why the banner is labelled even when it looks obvious
 *
 * The accessible name is the `title`. Given a `message` and no `title`,
 * the name is the message: a `region` with no name cannot be
 * introduced, listed among landmarks or navigated to, and the message
 * is the only sentence in the banner, so it is the best name available.
 *
 * The label is always declared, and not only for the reading of it. The
 * semantics tree names an unlabelled container from the text of its
 * transparent descendants and then *claims* those descendants, so they
 * stop being records of their own — and the walk stops at the claimed
 * subtree, taking the dismiss button inside it out of the tree
 * entirely. A labelled container claims nothing: its name introduces
 * it, its prose stays readable and its button stays reachable. That is
 * the defect this label exists to prevent, rather than a nicety.
 *
 * ## Dismissing is the caller's, and so is whether the banner is there
 *
 * `onDismiss` draws a real `Button` with the accessible name "Dismiss",
 * not a glyph with nothing behind it, because the close control of a
 * banner is the one control in it and a nameless one is a button a
 * screen reader can only describe as "button". Pressing it calls
 * `onDismiss` and does nothing else. The component does not hide
 * itself: whether the banner is in the tree is the caller's
 * conditional, because only the caller knows whether dismissing it
 * means forgetting it for this render, for this session or for good.
 *
 * ## What is read once, and why
 *
 * `live`, the tone the banner is *built* with, and whether `onDismiss`
 * was supplied. The first two decide the role and the live region, and
 * the third decides whether there is a button at all.
 *
 * The role has to be settled before the content it is about can change.
 * A live region is registered by the assistive technology and then
 * watched; one that is created, or made assertive, in the same frame as
 * the text inside it is typically not announced at all, because there
 * was no region to observe when the change happened. A role that
 * followed a bound `tone` would therefore be a live region that works
 * on every render except the one that mattered. A banner that has to
 * change its tone from `accent` to `danger`, or stop being live,
 * changes its `key` and is built again, which is the rule `Button`,
 * `Chip` and `Badge` all state for the props that decide their shape.
 *
 * Whether `title` and `message` were supplied is read once too, for the
 * ordinary reason: an empty `Text` still occupies a line, so a banner
 * with no title would carry a blank one. Their *text* is bound, and so
 * is `tone`'s paint, so the words and the colours follow a cell.
 */
export type AlertTone = 'neutral' | 'accent' | 'danger';

export interface AlertProps extends ControlLayoutProps {
  /** The headline, and the banner's accessible name. */
  title?: string;
  /**
   * The sentence under the title.
   *
   * With no `title`, this is the accessible name as well: a banner has
   * to be named by something, and this is the only sentence in it.
   */
  message?: string;
  /**
   * Which of the three tones it carries, in its edge and its title's
   * ink rather than in its ground. Default `neutral`.
   *
   * Bound for the paint and read once for the role, because `danger`
   * is the tone that interrupts: see the note above.
   */
  tone?: AlertTone;
  /**
   * Whether the banner's arrival is announced. Default true, because a
   * banner that appears is news. Read once: it decides the role.
   *
   * False is the standing banner that was on the page at load. It
   * becomes a named `region` with no live region, so it is a landmark
   * to be found rather than a sentence to be interrupted with.
   */
  live?: boolean;
  /**
   * Draws a dismiss button when given, and is called when it is
   * pressed.
   *
   * Nothing else happens: the banner does not remove itself, because
   * whether it is in the tree is the caller's conditional. Read once.
   */
  onDismiss?: () => void;
  /** Content under the message: an action row, a link, a list. */
  children?: UiChild;
}

export function Alert(inputs: Inputs<AlertProps>, _ctx: ComponentContext): UiChild {
  const title = input(inputs.title, '');
  const message = input(inputs.message, '');
  const tone = input(inputs.tone, 'neutral');

  // Read once. `live` and the tone the banner is built with decide the
  // role and the urgency, which have to be settled before the text they
  // are about changes; the other two decide whether an element exists
  // at all. See the note on reading once above.
  const announced = input(inputs.live, true).value !== false;
  const urgent = (inputs.tone.value ?? 'neutral') === 'danger';
  const dismissible = inputs.onDismiss.value !== undefined;
  const titled = inputs.title.value !== undefined;
  const described = inputs.message.value !== undefined;

  const ground = <R>(read: (paint: AlertGround) => R) => computed(() => read(TONES[tone.value ?? 'neutral']));

  /**
   * The title, falling back to the message.
   *
   * Bound rather than read once, so a banner whose title follows a cell
   * is renamed with it: the name of a live region is what a reader
   * hears the announcement introduced by, and a stale one is worse than
   * a plain one.
   */
  const name = computed(() => {
    const headline = title.value;
    return headline.length > 0 ? headline : message.value;
  });

  const lines: UiChild[] = [];
  if (titled) {
    lines.push(
      Text({
        text: title,
        // A role rather than a size, so a banner's headline is set in
        // the same type as the prose around it and follows the theme
        // with it. The weight is what makes it a headline.
        textStyle: 'body',
        fontWeight: 600,
        color: ground(paint => paint.title),
        selectable: false
      })
    );
  }
  if (described) {
    lines.push(
      Text({
        text: message,
        textStyle: 'body',
        // The body of a banner is prose, and prose on a control sheet
        // is `textMuted` everywhere else in the library. The tone is
        // said once, by the title and the edge; saying it again here
        // would make a declined card three sentences of red.
        color: 'textMuted',
        selectable: true
      })
    );
  }
  const content = inputs.children.value;
  if (content !== undefined) {
    lines.push(content);
  }

  const children: UiChild[] = [Column({ gap: LINE_GAP, flexGrow: 1 }, ...lines)];
  if (dismissible) {
    children.push(
      createComponent(Button, {
        // A word, not a glyph: this is the only control in the banner,
        // and "button" is all a nameless one can be announced as. The
        // word is fixed because the surface has no prop for it; an
        // application that needs another one builds its own banner or
        // passes its own control as `children`.
        label: 'Dismiss',
        // The quietest variant there is. A dismiss button that competed
        // with the message would be the loudest thing in a banner whose
        // point is the message.
        variant: 'plain',
        size: 'small',
        onClick: () => inputs.onDismiss.emit()
      })
    );
  }

  return Row(
    {
      ...layoutOf(inputs),
      // No modifiers of its own: a banner has no hover, no press and no
      // focus of its own, and the control inside it brings its own
      // ring. `modifiersOf` is still how the caller's `rootModifiers`
      // reach the root, which is the seam a motion needs to slide a
      // banner in.
      modifiers: modifiersOf(inputs),
      gap: GAP,
      padding: PADDING,
      borderRadius: RADIUS,
      borderWidth: 1,
      borderColor: ground(paint => paint.border),
      backgroundColor: SHEET,
      // Against the top, so the dismiss button sits on the title's line
      // rather than halfway down a message that runs to three.
      y: 'start',
      role: roleOf(announced, urgent),
      label: name,
      live: liveOf(announced, urgent)
    },
    ...children
  );
}

/**
 * The role, decided once.
 *
 * `alert` only for a live banner in the tone that means something
 * broke, because `alert` is assertive and assertive interrupts. Every
 * other live banner is a polite `status`, the pair `Badge` uses. A
 * banner that is not live is a named `region`: a landmark a reader can
 * find and skip, which is what a notice that has not changed should be
 * rather than a sentence pushed in front of them again.
 */
function roleOf(live: boolean, urgent: boolean): UiRole {
  if (!live) {
    return 'region';
  }
  return urgent ? 'alert' : 'status';
}

/**
 * The urgency, said out loud beside the role.
 *
 * `alert` and `status` each imply one in ARIA, and the record carries
 * `live` as its own field, so writing it is the difference between the
 * mirror emitting what this component meant and it emitting whatever
 * default the platform picked.
 */
function liveOf(live: boolean, urgent: boolean): UiLiveRegion | undefined {
  if (!live) {
    return undefined;
  }
  return urgent ? ASSERTIVE : POLITE;
}

const POLITE: UiLiveRegion = 'polite';
const ASSERTIVE: UiLiveRegion = 'assertive';

/**
 * The banner's own metrics, from the spacing and shape scales rather
 * than from numbers chosen here, and the default scales' values rather
 * than the inherited theme's, for the reason `Badge` and `Chip` give: a
 * component cannot read the environment while its body runs.
 */
const PADDING = defaultSpacing.medium;
const GAP = defaultSpacing.medium;
const LINE_GAP = defaultSpacing.extraSmall;
const RADIUS = defaultShapes.medium;

/**
 * The one ground under all three tones.
 *
 * A constant rather than a column in the table, because the table would
 * then say `controlBackground` three times and imply that a tone could
 * change it. It cannot: the tone is the edge and the ink, and the sheet
 * is the sheet.
 */
const SHEET = 'controlBackground';

/** What one tone is painted with. Both values are palette names. */
interface AlertGround {
  /** The ring around the banner. */
  readonly border: string;
  /** The ink of the title, which is the tone's other half. */
  readonly title: string;
}

/**
 * Three tones, written out.
 *
 * `neutral` is a `controlBorder` ring and a `controlForeground` title:
 * a banner that is only a note, shaped like every other control on the
 * page. `accent` and `danger` take `controlAccent` and `danger` for
 * both halves, so the edge and the headline say the same thing once.
 *
 * Every value is a palette name resolved at paint against the inherited
 * theme, so the table says nothing about light and dark and nothing
 * about a particular application. There is no colour prop and there
 * will not be one; restyling a banner is a theme provider around it.
 */
const TONES: Readonly<Record<AlertTone, AlertGround>> = {
  neutral: {
    border: 'controlBorder',
    title: 'controlForeground'
  },
  accent: {
    border: 'controlAccent',
    title: 'controlAccent'
  },
  danger: {
    border: 'danger',
    title: 'danger'
  }
} as const;
