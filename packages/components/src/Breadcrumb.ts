import { BehaviorSubject, combineLatest, map } from 'rxjs';

import { Row, Text, defaultSpacing, type UiChild, type UiElement, type UiNode, type UiSemanticState } from 'gesso-core';

import { FocusService, input, type ComponentContext, type InputCell, type Inputs } from 'gesso-framework';

import { CONTROL_FOCUS_RING, CONTROL_INTERACTION, layoutOf, modifiersOf, type ControlLayoutProps } from './internals';

export interface BreadcrumbItem {
  readonly value: string;
  readonly label: string;
}

/**
 * The trail of where you are: root first, this page last.
 *
 * A row of crumbs with a mark between them, at the top of a page that
 * sits inside something that sits inside something. It holds no state
 * an application would recognise — the trail is the caller's, and a
 * press on a crumb is reported rather than acted on — so the whole of
 * the design is two decisions: which crumb is not a link, and what
 * happens to a trail too long for the strip it is drawn in.
 *
 * ## The last crumb is not a link
 *
 * It is the one real rule, and everything else here follows from it.
 * The last crumb is the page you are already on. A control that
 * "navigates" to where you already are does nothing when it is
 * pressed, and a control that does nothing is not a control: it is a
 * thing that has to be tried before it can be ruled out. So the last
 * crumb is not focusable, declares no interactive role, and never
 * reaches `onSelect`.
 *
 * The defect that rule prevents is specific and it is not the mouse's.
 * Someone tabbing through a page hears "Home, link. Projects, link.
 * Build, link." and has no way to know the third one is a dead end:
 * they take the tab stop, press Enter and land where they started,
 * having spent the interaction that was supposed to move them. The
 * same trail with the rule applied is "Home, link. Projects, link.
 * Build." — two stops, and the third is heard as the destination it
 * is. That is one fewer tab stop on every page in the application.
 *
 * It is distinct to the eye as well, and by **weight** rather than by
 * colour alone: the current crumb is set at 600 in the same
 * `controlForeground` the links use. Colour alone would say nothing to
 * a reader who cannot resolve the two tokens apart, and a muted
 * current crumb would say the opposite of what is true, that the place
 * you are is the least important thing on the trail.
 *
 * ## What it declares
 *
 * A `navigation` landmark holding a `list` of `listitem`, which is the
 * shape HTML has for this and the shape a screen reader's landmark
 * list and "list, 4 items" summary are built to read. The landmark is
 * named — `label`, default `Breadcrumb` — because an unnamed landmark
 * in a list of landmarks is an entry that says "navigation" next to
 * three other entries that say "navigation", and is worse than useless
 * to the one person who opened that list to get somewhere.
 *
 * Each crumb before the last is a `link` inside its `listitem`, named
 * by the words it draws rather than by a `label` of its own. That is
 * not a style preference: `link` is not one of the roles whose
 * children the semantics tree makes presentational
 * (`PRESENTATIONAL_CHILDREN` in `UiSemanticsTree.ts`), so a `link`
 * carrying both a `label` and a `Text` would put "Projects" on the
 * tree twice, once as the link's name and once as prose beside it.
 * Left unlabelled, the crumb's text is *claimed* as its name and the
 * reader hears it once.
 *
 * **The current crumb declares no role at all.** It is a `Text` in a
 * `listitem`, so the listitem is named by it and a reader hears "list
 * item, Build" — content, not a control, which is exactly what it is.
 * The alternative, ARIA's `aria-current="page"` on a link, is not
 * available: `UiSemanticState` has no `current` member and inventing a
 * role to stand in for one would be guessing at semantics rather than
 * declaring them. Position carries the meaning instead. Every crumb's
 * `listitem` states `posInSet` and `setSize` from the **real** trail,
 * the way `LazyList` does for a windowed one, so the last crumb is
 * announced as "4 of 4": the end of the trail, which is the thing
 * `aria-current` would have said. A `current` state is the obvious
 * follow-up, and this component is its first caller.
 *
 * ## The separators are furniture, and say so
 *
 * "Home slash Projects slash Build" is not a reading anyone wants, and
 * the strings people pass here are worse than a solidus: a chevron
 * reads as "greater than", an arrow glyph as whatever the voice calls
 * it. So the separator declares `role: 'separator'` with an **empty
 * label**, which is the library's own mechanism used twice over. A
 * declared `label` wins over the text a node draws, so the empty one
 * claims the glyph and says it has nothing to announce; and
 * `separator` is in `PRESENTATIONAL_CHILDREN`, so nothing beneath it
 * is read either. What is left on the tree is a nameless separator
 * between crumbs, which is exactly what `Divider` declares a rule to
 * be. Nothing is hidden with `visible`, because the mark still has to
 * be drawn.
 *
 * ## Keyboard
 *
 * Tab reaches every crumb but the last, and Enter or Space follows the
 * one that has focus. Neither key is bound here, and that is the
 * decision rather than an omission: `UiKeyboardController` presses any
 * focused node whose role is `button` or `link` by synthesising a
 * click (`isPressable`), so a crumb answers the keyboard through the
 * same `onClick` the pointer and an assistive technology's activation
 * go through, and there is no second path to keep in step with the
 * first.
 *
 * HTML's rule is narrower — Enter follows a link, Space presses a
 * button and scrolls everything else — and this component does not
 * reimpose it. Doing so would mean binding Space to a handler that
 * swallows it, which would make the crumb the one pressable thing in
 * the library that ignores a key every other one answers. A person who
 * learned Space on a `Button` should not have to find out that it is
 * dead on a trail.
 *
 * ## Collapsing, and what the ellipsis does
 *
 * `maxItems` is off by default (0), because most trails are three
 * crumbs and a component should not decide for a caller that theirs
 * is too long. Above 0, a trail longer than `maxItems` keeps its first
 * crumb and its last — the root and where you are, the two a person
 * actually needs — and folds everything between them into one crumb.
 *
 * **The ellipsis expands in place**, and that is a choice against the
 * easier one. An inert ellipsis is crumb-shaped, sits in a row of
 * things that can be pressed, and answers a press with nothing: the
 * same defect as the last crumb being a link, moved one position to
 * the left. Expanding needs no popup, no overlay and no second
 * component, and it is honest about what it is: `role: 'button'` in a
 * `collapsed` state, named `Show 3 hidden steps` rather than left to
 * be announced as three full stops.
 *
 * Expanding removes the button that was pressed, which would drop the
 * keyboard back to the top of the page, so focus moves to the first
 * crumb the press revealed. The expansion is also remembered against
 * *that* trail and not in a bare flag: a breadcrumb is rebuilt every
 * time you navigate, and a trail expanded on one page would otherwise
 * arrive at the next one already unfolded.
 *
 * A **menu** of the elided crumbs, opened from the ellipsis, is the
 * obvious follow-up and is deliberately not here: `Menu` is a
 * component of its own with an overlay, a focus trap and an anchor,
 * and reaching for it from inside a strip of text would make this
 * component own a popup to solve a width problem.
 *
 * ## Edge cases, decided
 *
 *   - **No items is no landmark.** An empty trail draws nothing and is
 *     not in the semantics tree at all: a `navigation` landmark with
 *     nothing in it is another entry in the landmark list that leads
 *     nowhere, which is the same defect an unnamed one is.
 *   - **One item is the current one.** A trail of one is the page you
 *     are on, so nothing in it is a link, nothing takes focus and no
 *     separator is drawn.
 *   - **`maxItems` below 3 asks for something that does not exist.**
 *     The collapsed form is already three crumbs — first, ellipsis,
 *     last — so a smaller budget cannot be met. The component collapses
 *     as far as it can and stops there, and it never draws an ellipsis
 *     standing for nothing: `maxItems: 2` on a two-crumb trail has no
 *     middle to fold and is left alone.
 *
 * ## Deviations, and what lands next
 *
 * A crumb is drawn here rather than delegated. `Link` was written
 * beside this component, in the same batch and in parallel, so neither
 * could build on the other: the activatable crumb is a focusable row
 * with the library's own interaction and focus ring. Now that both
 * exist, a crumb should become a `Link` — that is where the underline,
 * the visited treatment and the href-or-handler question belong, and
 * this component should not answer any of them twice. It is a change
 * of its own because it moves a crumb's focus and paint onto another
 * component's, and the specs that pin both would move with it.
 */
export interface BreadcrumbProps extends ControlLayoutProps {
  /** Root first, current page last. The last one is never a link. */
  items: readonly BreadcrumbItem[];
  onSelect?: (value: string) => void;
  /** The landmark's accessible name. Default `Breadcrumb`. */
  label?: string;
  /** What is drawn between crumbs. Default a solidus. */
  separator?: string;
  /**
   * Collapse the middle to an ellipsis once there are more than this
   * many. Default 0, which never collapses.
   */
  maxItems?: number;
}

export function Breadcrumb(inputs: Inputs<BreadcrumbProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Breadcrumb');
  const separator = input(inputs.separator, SOLIDUS);
  const maxItems = input(inputs.maxItems, 0);
  const focus = ctx.inject(FocusService);

  /**
   * The crumbs that exist right now, by value, so expanding can put
   * the keyboard on one of them.
   *
   * A `ref` rather than a query, because the node an expansion reveals
   * did not exist when the press happened: the list rebuilds first and
   * the new rows hand themselves in here as they are built.
   */
  const crumbNodes = new Map<string, UiNode>();
  const track = (value: string, node: UiNode | null): void => {
    if (node === null) {
      crumbNodes.delete(value);
    } else {
      crumbNodes.set(value, node);
    }
  };

  /**
   * Which trail has been unfolded, rather than whether one has.
   *
   * A breadcrumb is the one component whose input changes every time
   * the person navigates, and a boolean here would carry the last
   * page's "show me the middle" onto the next page's trail. Keying the
   * state to the trail it was asked about makes a new trail collapse
   * again without anything having to reset it.
   */
  const expandedFor = new BehaviorSubject<string | null>(null);

  const activate = (item: BreadcrumbItem): void => {
    inputs.onSelect.value?.(item.value);
  };

  const expand = (): void => {
    const items = inputs.items.value;
    expandedFor.next(trailKey(items));
    // The button the press landed on is gone now. Without this the
    // keyboard would be back at the top of the document, which is
    // worse than not having expanded at all.
    const revealed = crumbNodes.get(items[1]?.value ?? '');
    if (revealed !== undefined) {
      focus.focus(revealed);
    }
  };

  const crumbs = combineLatest([inputs.items, maxItems, expandedFor]).pipe(
    map(([items, limit, unfolded]) => {
      const steps = planOf(items, limit, unfolded === trailKey(items));
      return steps.map((step, at) =>
        listItem(step, items.length, at < steps.length - 1, separator, activate, expand, track)
      );
    })
  );

  return Row(
    {
      ...layoutOf(inputs),
      modifiers: modifiersOf(inputs),
      y: 'center',
      // An empty trail is not a landmark: an invisible subtree is not
      // in the semantics tree at all, which is the one way to say "no
      // record" about a node that declares a role.
      visible: inputs.items.pipe(map(items => items.length > 0)),
      role: 'navigation',
      label
    },
    Row({ y: 'center', role: 'list' }, crumbs)
  );
}

/** One drawn crumb: a link, the page you are on, or the fold. */
interface Crumb {
  readonly kind: 'link' | 'current' | 'ellipsis';
  /** Absent on the fold, which stands for several. */
  readonly item?: BreadcrumbItem;
  /** Its place in the whole trail, 1-based. Absent on the fold. */
  readonly position?: number;
  /** How many crumbs the fold stands for. */
  readonly hidden?: number;
}

/**
 * The crumbs to draw, from the trail and the budget.
 *
 * The middle is `slice(1, -1)`, so a trail of two or fewer has no
 * middle at all and cannot collapse however small `maxItems` is. That
 * is also the answer to `maxItems` below 3: the collapsed form is
 * three crumbs, there is nothing shorter, and folding a middle of
 * nothing into an ellipsis would draw a mark standing for no crumbs.
 */
function planOf(items: readonly BreadcrumbItem[], maxItems: number, expanded: boolean): readonly Crumb[] {
  const last = items.length - 1;
  const all: Crumb[] = items.map((item, at) => ({
    kind: at === last ? 'current' : 'link',
    item,
    position: at + 1
  }));
  if (expanded || maxItems <= 0 || items.length <= maxItems) {
    return all;
  }
  const middle = items.slice(1, last);
  if (middle.length === 0) {
    return all;
  }
  return [all[0], { kind: 'ellipsis', hidden: middle.length }, all[last]];
}

/** The trail a piece of state was about, so a new trail is a new question. */
function trailKey(items: readonly BreadcrumbItem[]): string {
  return JSON.stringify(items.map(item => item.value));
}

/**
 * One `listitem`, and the mark after it.
 *
 * The separator lives inside the crumb it follows rather than beside
 * it, so the `list` has exactly one child per crumb and a reader is
 * told the length of the trail rather than twice its length.
 */
function listItem(
  crumb: Crumb,
  total: number,
  separated: boolean,
  separator: InputCell<string>,
  activate: (item: BreadcrumbItem) => void,
  expand: () => void,
  track: (value: string, node: UiNode | null) => void
): UiElement {
  // Both children are keyed, and the crumb's key is *what it is*
  // rather than where it sits. A crumb that stops being a link — which
  // is what following one does to the crumb you land on — otherwise
  // reconciles against whichever unkeyed node held that position last,
  // and the tree keeps the properties the old element set: the first
  // draft turned the new current crumb into the separator that used to
  // follow it, announced as a nameless rule with the page's name in it.
  const children: UiElement[] = [body(crumb, activate, expand, track)];
  if (separated) {
    children.push(separatorMark(separator));
  }
  return Row(
    {
      key: crumb.item?.value ?? ELLIPSIS_KEY,
      y: 'center',
      gap: GAP,
      role: 'listitem',
      // The real index and the real count, as `LazyList` carries them
      // for rows that are not mounted: a collapsed trail still says
      // "4 of 4", which is how the last crumb announces that it is the
      // end of the trail.
      posInSet: crumb.position,
      setSize: crumb.position === undefined ? undefined : total
    },
    ...children
  );
}

function body(
  crumb: Crumb,
  activate: (item: BreadcrumbItem) => void,
  expand: () => void,
  track: (value: string, node: UiNode | null) => void
): UiElement {
  if (crumb.kind === 'ellipsis') {
    return fold(crumb.hidden ?? 0, expand);
  }
  const item = crumb.item as BreadcrumbItem;
  if (crumb.kind === 'current') {
    return Text({
      key: crumb.kind,
      text: item.label,
      paddingX: PADDING_X,
      paddingY: PADDING_Y,
      color: 'controlForeground',
      // Weight rather than a colour of its own: the place you are is
      // not the quiet thing on the trail, and a reader who cannot tell
      // two tokens apart can still tell these two apart.
      fontWeight: CURRENT_WEIGHT,
      textWrap: 'none',
      selectable: false
    });
  }
  return Row(
    {
      key: crumb.kind,
      ref: node => track(item.value, node),
      focusable: true,
      modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING],
      paddingX: PADDING_X,
      paddingY: PADDING_Y,
      borderRadius: RADIUS,
      // The standing rule: a thing that can be pressed says so under
      // the pointer.
      cursor: 'pointer',
      role: 'link',
      // No `label`. `link` is not a role whose children are
      // presentational, so a label here would put the crumb's words on
      // the tree twice; unlabelled, the text below is claimed as the
      // name and read once.
      // Enter and Space both reach this, and neither is bound here:
      // `UiKeyboardController` presses any focused node whose role is
      // `button` or `link` by synthesising a click, so `onClick` is the
      // one handler for the pointer, the keyboard and an assistive
      // technology's activation alike.
      onClick: () => activate(item)
    },
    Text({ text: item.label, color: 'controlForeground', textWrap: 'none', selectable: false })
  );
}

/** The fold: a button, because it does something. */
function fold(hidden: number, expand: () => void): UiElement {
  return Row(
    {
      key: 'ellipsis',
      focusable: true,
      modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING],
      paddingX: PADDING_X,
      paddingY: PADDING_Y,
      borderRadius: RADIUS,
      cursor: 'pointer',
      role: 'button',
      // Named, because "…" is three full stops to a screen reader and
      // a name here is the only thing that says what pressing it does.
      // `button` makes its children presentational, so the glyph is
      // not announced after the name.
      label: `Show ${hidden} hidden ${hidden === 1 ? 'step' : 'steps'}`,
      states: COLLAPSED,
      onClick: expand
    },
    Text({ text: ELLIPSIS, color: 'textMuted', textWrap: 'none', selectable: false })
  );
}

/**
 * The mark between two crumbs.
 *
 * `role: 'separator'` with an empty `label` is two of the library's
 * rules doing one job: a declared label wins over the text a node
 * draws, so the empty one claims the glyph and announces nothing, and
 * `separator` makes a node's children presentational, so nothing under
 * it is read either. Transparent to the pointer, as `Divider` is: the
 * gap between two crumbs is not a third thing to press.
 */
function separatorMark(separator: InputCell<string>): UiElement {
  return Text({
    key: 'separator',
    text: separator,
    color: 'textMuted',
    textWrap: 'none',
    selectable: false,
    hitTestable: false,
    role: 'separator',
    label: '',
    // The listitem's own gap sits before the mark; this sits after it,
    // so a crumb, its mark and the next crumb are evenly spaced rather
    // than the mark hugging whatever follows it.
    marginRight: GAP
  });
}

/** The default mark, and the fold's glyph. */
const SOLIDUS = '/';
const ELLIPSIS = '…';

/** One key for the fold, because there is never more than one. */
const ELLIPSIS_KEY = 'gesso-breadcrumb-ellipsis';

/**
 * The crumb's own metrics, from the spacing scale rather than from
 * numbers chosen here, and the default scale's values rather than the
 * inherited theme's, for the reason `Badge` gives: a component cannot
 * read the environment while its body runs.
 */
const GAP = defaultSpacing.small;
const PADDING_X = defaultSpacing.extraSmall;
const PADDING_Y = defaultSpacing.hairline;
const RADIUS = 4;

/** Heavier than the links beside it, which is how the current crumb differs. */
const CURRENT_WEIGHT = 600;

/** One shared value: a states array rebuilt per render would diff every frame. */
const COLLAPSED: readonly UiSemanticState[] = Object.freeze(['collapsed']) as readonly UiSemanticState[];
