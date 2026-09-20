import { combineLatest, distinctUntilChanged, map, type Observable } from 'rxjs';

import {
  Button as ButtonElement,
  Row,
  Text,
  interactive,
  type UiChild,
  type UiElement,
  type UiSemanticState
} from 'gesso-core';

import {
  createComponent,
  each,
  input,
  themeTokenCell,
  type ComponentContext,
  type Inputs,
  type ThemeTokenCell
} from 'gesso-framework';

import { Button } from './Button';
import { controlled } from './controlled';
import { CONTROL_FOCUS_RING, foregroundToken, layoutOf, modifiersOf, type ControlLayoutProps } from './internals';
import { controlTokens, type ButtonPaint, type ButtonSize, type ButtonSizeTokens, type ControlTokens } from './tokens';

/**
 * A strip of page numbers, for a set of rows shown a page at a time.
 *
 * `[‹] [1] […] [4] [5] [6] […] [10] [›]`. It owns one number, the
 * page, and knows nothing about rows: the caller slices its own data
 * and puts this underneath, usually under a `DataTable`, which is the
 * component this was written to sit beneath.
 *
 * Reach for `LazyList` instead when the answer to "there is more than
 * fits" is *scroll*. An infinite list and a paged one solve the same
 * problem and disagree about one thing: whether a position in the set
 * is a place you can name. A paged list has page 7, which can be
 * linked to, bookmarked, read out, and returned to after a reload; a
 * lazy list has a scroll offset, which is none of those things but
 * costs nothing to move through. Rows a person searches, cites or
 * comes back to want pages. A feed wants a scroller. A table of a
 * hundred thousand rows wants `DataTable`, whose virtualization is
 * the reason paging it would be an answer to a question nobody asked.
 *
 * Everything below is two problems: an arithmetic one and an
 * accessibility one, and neither is the pill.
 *
 * ## The arithmetic
 *
 * `paginationItems` is a pure function of `page`, `pageCount`,
 * `siblings` and `boundaries`, exported and tested on its own, because
 * it is the whole component and mounting a tree to ask it what it
 * would draw is a slow way to find out. It answers the list of things
 * the strip draws, in order, as primitives: a page is its number,
 * `'previous'` and `'next'` are the ends, and `'gapBefore'` and
 * `'gapAfter'` are the two elisions. The rules that make it harder
 * than it looks:
 *
 *   - **An ellipsis that stands for exactly one page is worse than the
 *     page.** "…" instead of "2" hides a page behind a control that
 *     is not a control, to save exactly nothing: the two are the same
 *     width. So the gap appears only when it elides two pages or
 *     more, and otherwise the strip draws the page it would have
 *     covered. This is the single most commonly botched case in a
 *     pagination strip and the one the spec asserts hardest.
 *   - **The run does not shrink at the ends.** At page 1 the window
 *     around the current page has nothing to its left, and the naive
 *     arithmetic hands back a strip three slots narrower than the one
 *     at page 5. The strip would then change width as the person
 *     pages through it, moving the next button out from under the
 *     pointer that is clicking it repeatedly, which is a real defect
 *     and not a cosmetic one. So the window slides rather than
 *     clipping: the slots the left side does not need are spent on
 *     the right, the count of drawn slots is constant for a given
 *     `pageCount`, and each slot carries a `minWidth`, so "9" and
 *     "10" occupy the same space and an elision occupies exactly the
 *     slot of the page it replaced. The arithmetic is free; the
 *     reflow is not.
 *   - **`boundaries: false` drops the always-on first and last, and
 *     keeps the ellipses.** An elision with no page after it still
 *     says the true thing, that there are pages this way, and it
 *     keeps the width fixed. Dropping it too would leave a bare
 *     window that claims to be the whole set.
 *   - **A `page` outside 1..`pageCount` is clamped, and nothing is
 *     emitted.** The strip draws page 10 of 10 when it is handed 99,
 *     and `previous` from there goes to 9 rather than to 98. It does
 *     *not* call `onChange(10)`: a control reports what the person
 *     did, and nobody did this. An emission here would be a write the
 *     application never initiated, arriving while it renders, and in
 *     the uncontrolled form it would quietly overwrite the
 *     `defaultPage` the caller asked for. Out of range is the
 *     caller's bug to see, not this component's to paper over.
 *   - **Below a `pageCount` of 1 nothing is drawn at all**, landmark
 *     included: there is no set to move through, so there is nothing
 *     to announce and nothing to Tab into. A `pageCount` of exactly 1
 *     *is* drawn, as `[‹] [1] [›]` with both ends disabled, because
 *     one page is a set of one and because a strip that vanished when
 *     a filter narrowed the table to a single page would reflow
 *     everything under it. That is the same rule as the ends below:
 *     this component disables a control it cannot offer, it does not
 *     remove it.
 *
 * ## What it says
 *
 * A row of bare numerals is close to meaningless read aloud. "1 2 3 4
 * 5" says nothing about what any of them do.
 *
 *   - **A numbered control's name is a sentence, and its text is the
 *     numeral.** `label` is "Page 3"; the glyph drawn is "3". That is
 *     the one case `Button` names in as many words as the reason it
 *     has both a `label` and `children`, and it is the whole
 *     difference between a strip that can be operated by voice and
 *     one that cannot.
 *   - **The current page is `selected` in the semantics, not only in
 *     the paint.** `UiSemanticState` has no `current`, and inventing
 *     one would be a state the mirror cannot emit; `selected` is the
 *     honest member of that union and is what the accent pill means.
 *     It stays focusable and it is not `disabled`, because disabled
 *     would take the page you are on out of the Tab order for no
 *     reason a person could guess.
 *   - **Previous and next are named and are disabled at the ends,
 *     never absent.** A control that disappears from under the
 *     pointer mid-click is the defect; a disabled one says "not from
 *     here" and stays where it was.
 *   - **The elision is decorative.** It is a `Text` with no role, no
 *     name and no focus: it cannot be reached as a control, and it is
 *     read as the prose it is, which is what `Badge` says about a
 *     marker that has no meaning of its own to declare.
 *   - **The landmark takes the name.** `role: 'navigation'` with
 *     `label`, defaulting to "Pagination", because a landmark with no
 *     name is a line in somebody's landmark list reading "navigation"
 *     next to four others.
 *
 * ## No keymap
 *
 * Every control here is its own tab stop, so Tab and Shift+Tab already
 * walk the strip and each button answers Enter and Space itself. This
 * is not ARIA's toolbar pattern and the arrows are not bound, for the
 * reason `Toolbar` gives: a strip of buttons that swallowed the arrows
 * would take them from whatever the page around it uses them for.
 *
 * Home and End were written and then removed, which is worth
 * recording. They work, in the sense that the page changes; what they
 * also do is delete the button they were pressed on. Jumping from page
 * 5 to page 1 rebuilds the strip as `[1] [2] [3] […] [10]`, page 5 is
 * no longer in it, and the focus that was on it has nowhere to go. The
 * two controls that survive every jump are `previous` and `next`,
 * which is exactly why they are disabled at the ends rather than
 * removed, and a keyboard person paging with them never loses their
 * place. Clicking a numbered page is safe for the same reason in
 * reverse: the page you just chose is the current one, and the current
 * one is always in the window.
 *
 * ## Why the numbered button is built here
 *
 * The strip's ends are `Button`s. The numbered slots are not, and the
 * reason is one line of `Button`: `variant` is read once, because a
 * modifier list is fixed for the life of an element. Currentness is a
 * variant, and it changes under the person's hand every time they
 * page. Keying a numbered button on whether it is current would have
 * rebuilt it, which destroys the node, which drops the focus of the
 * keyboard user who just pressed Enter on it. So the numbered slot is
 * built from the same `ButtonElement`, the same `controlTokens` and
 * the same `filled`/`accent` and `plain`/`neutral` rows of the paint
 * table that `Button` would have used, with the choice between those
 * two rows *bound* rather than read. Nothing about it is a new colour,
 * and a theme that restyles its buttons restyles these with them.
 *
 * The consequence is that the element list is keyed by primitives and
 * every control in the strip outlives a page change: `each` reuses a
 * row whose item is `Object.is`-equal, a page's item is its number,
 * and the ends are two constant strings.
 */
export interface PaginationProps extends ControlLayoutProps {
  /** The current page, counting from 1. */
  page?: number;
  defaultPage?: number;
  onChange?: (page: number) => void;
  /** How many pages there are. Below 1 the component draws nothing. */
  pageCount: number;
  /** Numbered buttons on each side of the current page. Default 1. */
  siblings?: number;
  /** Whether the first and last page are always drawn. Default true. */
  boundaries?: boolean;
  /** The landmark's accessible name. Default `Pagination`. */
  label?: string;
  disabled?: boolean;
  /** Default `small`. */
  size?: ButtonSize;
}

export function Pagination(inputs: Inputs<PaginationProps>, _ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Pagination');
  const disabled = input(inputs.disabled, false);
  const siblings = input(inputs.siblings, DEFAULT_SIBLINGS);
  const boundaries = input(inputs.boundaries, true);
  // Read once, as `Button` reads its own: a size chooses a row of the
  // token table and a component body runs once. A strip that has to
  // change size changes its `key` and is built again.
  const size = input(inputs.size, 'small').value;
  const tokens = themeTokenCell(controlTokens);

  const page = controlled({
    component: 'Pagination',
    name: 'page',
    source: inputs.page,
    initial: inputs.defaultPage,
    fallback: 1,
    onChange: inputs.onChange
  });

  /** The page actually shown: what the caller owns, brought into range. */
  const current = combineLatest([page.value, inputs.pageCount]).pipe(
    map(([value, pageCount]) => clampPage(value, pageCount)),
    distinctUntilChanged()
  );
  const currentNow = (): number => clampPage(page.current(), inputs.pageCount.value);

  const items = combineLatest([page.value, inputs.pageCount, siblings, boundaries]).pipe(
    map(([value, pageCount, sides, ends]) =>
      paginationItems({ page: value, pageCount, siblings: sides, boundaries: ends })
    ),
    // The strip is the same list for most of the presses that change
    // the page, and an identical list re-emitted would still walk
    // `each`'s reconciler. Compared by value because the arithmetic
    // returns a fresh array each time.
    distinctUntilChanged(sameItems)
  );

  const go = (target: number): void => {
    const pageCount = inputs.pageCount.value;
    if (disabled.value || pageCount < 1) {
      return;
    }
    const next = clampPage(target, pageCount);
    // Pressing the page you are on is not a change, and neither is
    // walking off the end. Emitting either would make `onChange` a
    // press counter rather than a report of a move.
    if (next === currentNow()) {
      return;
    }
    page.change(next);
  };

  /** Disabled by the caller, or by being at that end of the set. */
  const off = (atEnd: Observable<boolean>): Observable<boolean> =>
    combineLatest([atEnd, disabled]).pipe(
      map(([end, all]) => end || all),
      distinctUntilChanged()
    );

  const atFirst = current.pipe(map(value => value <= 1));
  const atLast = combineLatest([current, inputs.pageCount]).pipe(map(([value, pageCount]) => value >= pageCount));

  const draw = (item: PaginationItem): UiChild => {
    if (item === 'previous') {
      return endButton('Previous page', PREVIOUS_GLYPH, size, off(atFirst), () => go(currentNow() - 1));
    }
    if (item === 'next') {
      return endButton('Next page', NEXT_GLYPH, size, off(atLast), () => go(currentNow() + 1));
    }
    if (item === 'gapBefore' || item === 'gapAfter') {
      return elision(size, tokens);
    }
    return pageButton(item, size, tokens, current, disabled, () => go(item));
  };

  return Row(
    {
      ...layoutOf(inputs),
      // On the root rather than on each slot: the cell reads the theme
      // the element it is attached to inherits, and every slot is
      // under this row, so one attachment answers for all of them.
      modifiers: modifiersOf(inputs, tokens.modifier),
      gap: GAP,
      y: 'center',
      // An empty set is not an empty landmark. An invisible subtree is
      // not in the semantics tree at all, so below a `pageCount` of 1
      // there is no navigation region to list and nothing to Tab into.
      visible: items.pipe(map(list => list.length > 0)),
      role: 'navigation',
      label
    },
    each(items, item => String(item), draw)
  );
}

/**
 * One thing the strip draws: a page, an end, or an elision.
 *
 * Primitives rather than records, for two reasons. `each` reuses a row
 * whose item is `Object.is`-equal to the one it built, so a strip
 * described this way keeps every element it already has across a page
 * change and keeps the focus sitting on one of them. And the spec's
 * table of cases reads as the strip does:
 * `[1, 'gapBefore', 4, 5, 6, 'gapAfter', 10]`.
 */
export type PaginationItem = number | 'previous' | 'next' | 'gapBefore' | 'gapAfter';

/** What the strip is a function of. */
export interface PaginationShape {
  readonly page: number;
  readonly pageCount: number;
  /** Default 1. */
  readonly siblings?: number;
  /** Default true. */
  readonly boundaries?: boolean;
}

/**
 * The strip, as a list, from the four numbers that decide it.
 *
 * Pure and exported so the table of cases in `Pagination.spec.ts` can
 * be a table rather than a dozen mounted trees.
 *
 * The shape is `[previous] [first] [gap] [run] [gap] [last] [next]`,
 * and the whole of the difficulty is in the two gaps and in keeping
 * the run the same width wherever it is:
 *
 *   - `runStart` and `runEnd` are the window around the current page.
 *     Each is pushed away from its own end by the `Math.max` and
 *     `Math.min` around it, which is what stops the window narrowing
 *     as it reaches an end: at page 1 it cannot start before the
 *     boundary, so it grows to the right instead, and the strip keeps
 *     the number of slots it had in the middle.
 *   - A gap is drawn only when `runStart` leaves two or more pages
 *     behind it, or `runEnd` two or more in front. Exactly one page
 *     left over is drawn as itself: an ellipsis standing for a single
 *     page is the same width as the page and tells you less.
 *
 * The four guards in the middle make the head, the run and the tail
 * provably disjoint, which is what `each` needs: two slots claiming
 * the same page would be two rows claiming the same key.
 */
export function paginationItems(shape: PaginationShape): readonly PaginationItem[] {
  const pageCount = Math.floor(shape.pageCount);
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    return EMPTY;
  }
  const siblings = Math.max(0, Math.floor(shape.siblings ?? DEFAULT_SIBLINGS));
  // 1 when the first and last pages are pinned, 0 when they are not,
  // and every expression below is written in terms of it so that
  // `boundaries: false` is arithmetic rather than a second branch.
  const ends = (shape.boundaries ?? true) ? 1 : 0;
  const page = clampPage(shape.page, pageCount);

  const head = range(1, Math.min(ends, pageCount));
  const tail = range(Math.max(pageCount - ends + 1, ends + 1), pageCount);

  const runStart = Math.max(Math.min(page - siblings, pageCount - ends - siblings * 2 - 1), ends + 2);
  const runEnd = Math.min(Math.max(page + siblings, ends + siblings * 2 + 2), pageCount - ends - 1);

  const before: readonly PaginationItem[] =
    runStart > ends + 2 ? GAP_BEFORE : ends + 1 < pageCount - ends ? [ends + 1] : EMPTY;
  const after: readonly PaginationItem[] =
    runEnd < pageCount - ends - 1 ? GAP_AFTER : pageCount - ends > ends ? [pageCount - ends] : EMPTY;

  return ['previous', ...head, ...before, ...range(runStart, runEnd), ...after, ...tail, 'next'];
}

/** Into 1..`pageCount`, which is the only range the strip can draw. */
function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) {
    return 1;
  }
  return Math.min(Math.max(Math.round(page), 1), Math.max(1, Math.floor(pageCount)));
}

/** Inclusive, and empty when `to` is below `from`. */
function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let value = from; value <= to; value++) {
    out.push(value);
  }
  return out;
}

/** Two strips are the same strip when they draw the same slots in order. */
function sameItems(a: readonly PaginationItem[], b: readonly PaginationItem[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * A numbered slot.
 *
 * Built from `ButtonElement` rather than from `Button` because the
 * paint has to follow `current`, and `Button` reads its variant once.
 * Every value here is still the one `Button` would have resolved: the
 * `filled`/`accent` row of the token table when this is the page you
 * are on, the `plain`/`neutral` row when it is not, and the size's own
 * padding, radius and type role. Nothing is a colour and nothing is a
 * number chosen here.
 */
function pageButton(
  page: number,
  size: ButtonSize,
  tokens: ThemeTokenCell<ControlTokens>,
  current: Observable<number>,
  disabled: Observable<boolean>,
  press: () => void
): UiElement {
  const chosen = current.pipe(
    map(value => value === page),
    distinctUntilChanged()
  );
  const paint = <R>(read: (paint: ButtonPaint) => R): Observable<R> =>
    combineLatest([
      tokens.select(t => read(t.button.paint.filled.accent)),
      tokens.select(t => read(t.button.paint.plain.neutral)),
      chosen
    ]).pipe(map(([on, off, mine]) => (mine ? on : off)));
  const metrics = (read: (tokens: ButtonSizeTokens) => number): Observable<number> =>
    tokens.select(t => read(t.button.sizes[size]));
  // The current page has no state to move to under the pointer: it is
  // already the accent, and pressing it does nothing. So its hover and
  // its press keep the ground they have, and only the pages that can
  // be gone to answer the pointer at all.
  const ground = (hovered: string): Observable<string> =>
    combineLatest([tokens.select(t => t.button.paint.filled.accent.background), chosen]).pipe(
      map(([accent, mine]) => (mine ? accent : hovered))
    );

  return ButtonElement(
    {
      modifiers: [
        interactive({
          hover: true,
          press: true,
          hovered: { backgroundColor: ground('controlBackgroundHovered') },
          pressed: { backgroundColor: ground('controlBackgroundPressed') }
        }),
        CONTROL_FOCUS_RING
      ],
      // The size's vertical padding on both axes: a numbered slot is a
      // square with a numeral in it, not a button with a word in it,
      // and the word's padding would make a strip of ten pages as wide
      // as a sentence.
      paddingX: metrics(tokens => tokens.paddingY),
      paddingY: metrics(tokens => tokens.paddingY),
      // Every slot the same width, so the strip does not breathe as the
      // page goes from 9 to 10 and so an elision sits exactly where the
      // page it replaced would have been.
      minWidth: SLOT[size],
      x: 'center',
      y: 'center',
      borderRadius: metrics(tokens => tokens.radius),
      backgroundColor: paint(value => value.background),
      borderWidth: paint(value => (value.border === undefined ? 0 : 1)),
      borderColor: paint(value => value.border),
      cursor: chosen.pipe(map(mine => (mine ? 'default' : 'pointer'))),
      disabled,
      role: 'button',
      // The name is a sentence and the text is the numeral: "3" read
      // aloud in a list of numerals says nothing about what it does.
      label: `Page ${page}`,
      states: chosen.pipe(map(mine => (mine ? SELECTED : NO_STATES))),
      onClick: press
    },
    Text({
      text: String(page),
      textStyle: tokens.select(t => t.button.sizes[size].textStyle),
      fontWeight: chosen.pipe(map(mine => (mine ? 600 : 500))),
      color: foreground(
        paint(value => value.foreground),
        disabled
      ),
      textWrap: 'none',
      selectable: false
    })
  );
}

/**
 * Previous or next: an ordinary `Button`, because its paint never
 * changes. Only what it is allowed to do does, and that is `disabled`,
 * which is a bound property rather than a built-in variant.
 */
function endButton(
  name: string,
  glyph: string,
  size: ButtonSize,
  disabled: Observable<boolean>,
  press: () => void
): UiChild {
  return createComponent(Button, {
    variant: 'plain',
    tone: 'neutral',
    size,
    // The name a reader hears; the glyph is what is drawn. An arrow
    // announced as "‹" is an arrow announced as nothing.
    label: name,
    disabled,
    onClick: press,
    children: Text({
      text: glyph,
      color: foregroundToken(disabled),
      fontWeight: 600,
      textWrap: 'none',
      selectable: false
    })
  });
}

/**
 * The elision.
 *
 * A `Text` and nothing else: no role, no name, no `focusable`, so it
 * cannot be reached as a control and Tab passes it by. It is read as
 * the prose it is, which is what the library says about a decoration
 * that has nothing of its own to declare rather than having a role
 * guessed for it. It takes a page's slot so that swapping a number for
 * a gap moves nothing.
 */
function elision(size: ButtonSize, tokens: ThemeTokenCell<ControlTokens>): UiChild {
  return Text({
    text: ELLIPSIS,
    textStyle: tokens.select(t => t.button.sizes[size].textStyle),
    color: 'textMuted',
    width: SLOT[size],
    textAlign: 'center',
    textWrap: 'none',
    selectable: false,
    // Nothing to press, and nothing under it to press either.
    hitTestable: false
  });
}

/** The slot's own ink: the variant's, or the disabled token. */
function foreground(resting: Observable<string>, disabled: Observable<boolean>): Observable<string> {
  return combineLatest([resting, disabled]).pipe(map(([token, off]) => (off ? 'controlForegroundDisabled' : token)));
}

/** Numbered buttons on each side of the current page. */
const DEFAULT_SIBLINGS = 1;

/**
 * The narrowest a slot gets: two numerals and the size's padding.
 *
 * What it prevents is one slot being narrower than its neighbours and
 * the whole row shuffling sideways as the person walks through it: a
 * one-digit page takes the same space as a two-digit one, and an
 * elision takes exactly the slot of the page it replaced. Past two
 * digits the numeral sets the width, because a floor cannot be a
 * ceiling and clipping a page number would be worse than a strip that
 * is a few pixels wider around page 100.
 */
const SLOT: Readonly<Record<ButtonSize, number>> = { small: 28, medium: 36, large: 48 };

/** Between the slots: close enough to read as one strip, far enough to aim at. */
const GAP = 4;

const PREVIOUS_GLYPH = '‹';
const NEXT_GLYPH = '›';
const ELLIPSIS = '…';

const SELECTED: readonly UiSemanticState[] = Object.freeze(['selected'] as UiSemanticState[]);
const NO_STATES: readonly UiSemanticState[] = Object.freeze([] as UiSemanticState[]);

const EMPTY: readonly PaginationItem[] = Object.freeze([] as PaginationItem[]);
const GAP_BEFORE: readonly PaginationItem[] = Object.freeze(['gapBefore'] as PaginationItem[]);
const GAP_AFTER: readonly PaginationItem[] = Object.freeze(['gapAfter'] as PaginationItem[]);
