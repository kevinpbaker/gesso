import { BehaviorSubject, combineLatest, distinctUntilChanged, map, Subject, type Observable } from 'rxjs';

import {
  createComponent,
  FocusService,
  input,
  RouterService,
  ScrollService,
  ShellService,
  type ComponentContext,
  type Inputs,
  type OutputCell,
  type RouteTarget
} from 'gesso-framework';
import {
  Box,
  Column,
  Row,
  Text,
  measureFlow,
  resolveString,
  type LayoutBox,
  type UiChild,
  type UiColorValue,
  type UiKeyboardEvent,
  type UiLength,
  type UiNode,
  type UiPointerEvent,
  type UiSemanticState
} from 'gesso-core';

import { Badge } from './Badge';
import { chevron, CHEVRON_DOWN } from './chevron';
import { controlled } from './controlled';
import { followRoute, middlePress, opensElsewhere } from './follow';
import {
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  keymap,
  layoutOf,
  modifiersOf,
  type ControlLayoutProps
} from './internals';
import { Icon } from './Media';
import { movedBetween, NO_STATES, rowCells } from './rowCells';
import { tooltip } from './Tooltip';

/**
 * A row's glyph: SVG path data on a 24 grid, or a description of how to
 * draw it.
 *
 * A string is one filled path, which is what an icon always was here.
 * The object form is for the icon sets drawn as lines, Heroicons'
 * outline set, Lucide, Feather: `style: 'stroke'` draws the path as a
 * line `strokeWidth` wide (in the grid's units, default 2), and `path`
 * may be several paths, each drawn as `Icon` draws one and laid over
 * the others in the same square, as an SVG's `<path>` elements are.
 * `fillRule` is passed to a filled path as `Icon` takes it; Heroicons'
 * solid set wants `'evenodd'`.
 */
export type NavigationIcon =
  | string
  | {
      readonly path: string | readonly string[];
      readonly style?: 'fill' | 'stroke';
      readonly strokeWidth?: number;
      readonly fillRule?: 'nonzero' | 'evenodd';
    };

/**
 * One place the rail can take the reader: a screen, a section, a
 * mailbox.
 */
export interface NavigationDestination {
  /**
   * The destination's identity: what `value` holds and `onChange`
   * reports. Unique across the whole rail, groups included, because
   * the rows are drawn as one list and a key is what each row is kept by.
   */
  readonly key: string;
  /**
   * The row's text, and its accessible name in both widths: a collapsed
   * rail draws no label but still announces it, and shows it as a
   * tooltip.
   */
  readonly label: string;
  /**
   * Drawn as `Icon` draws one, in the row's text colour: a string is a
   * filled path on a 24 grid, and the object form can stroke it or
   * draw several (see `NavigationIcon`). A collapsed rail draws a
   * destination without one as the first letter of its label, so it is
   * never an empty square.
   */
  readonly icon?: NavigationIcon;
  /**
   * A count or a short marker at the row's end: `3`, `New`. A number is
   * drawn through `Badge`, so 120 is `99+`. A collapsed rail draws it
   * as a dot on the icon.
   */
  readonly badge?: number | string;
  /**
   * What the badge means, said after the label to a screen reader:
   * `3 unread`. Without it the badge's own text is said, which is
   * right for `New` and thin for a bare `3`.
   */
  readonly badgeLabel?: string;
  /** Announced as unavailable, skipped by every key, and inert to the pointer. */
  readonly disabled?: boolean;
  /**
   * Where in this application the destination is, as `Link`'s `to`
   * takes it: a url of the router's, or a `RouteTarget`.
   *
   * Optional, and what lets the rail open the destination somewhere
   * new without the application wiring it. Pressed plainly, the rail
   * reports the key through `onChange` and then the router navigates
   * there. With Command or Control held, with the middle button, or
   * with Command-Enter or Control-Enter, the rail reports it through
   * `onOpenElsewhere` and the shell opens the app there somewhere new
   * (`ShellService.openRoute`); the value does not move.
   */
  readonly to?: string | RouteTarget;
}

/**
 * A heading that holds destinations, and opens and closes.
 *
 * A group is not a destination: activating one opens or closes it, and
 * it is never the `value`.
 */
export interface NavigationGroup {
  /** Unique across the whole rail, as a destination's is: it is what the open set holds. */
  readonly key: string;
  readonly label: string;
  /** Drawn as a destination's is, and as the group's mark in a collapsed rail. */
  readonly icon?: NavigationIcon;
  /** What it holds: destinations, and groups inside it. */
  readonly items: readonly NavigationItem[];
  /**
   * Open when the rail is built, for a rail that owns its open set.
   * Read once, from the first `items`; `defaultExpanded` on the rail
   * wins when it is given.
   */
  readonly defaultExpanded?: boolean;
  /**
   * The heading and everything under it, at any depth, announced as
   * unavailable, drawn in the disabled ink, skipped by every key and
   * inert to the pointer. The group neither opens nor closes from the
   * rail; an open set that holds it still shows its rows, disabled.
   */
  readonly disabled?: boolean;
}

export type NavigationItem = NavigationDestination | NavigationGroup;

export interface NavigationRailProps extends ControlLayoutProps {
  /** The destinations and groups, in the order they are drawn. */
  items: readonly NavigationItem[];
  /**
   * The active destination's key, or null for none. Supplying it makes
   * the rail controlled, which is the usual case: the router owns where
   * the application is, and the rail shows it.
   */
  value?: string | null;
  defaultValue?: string | null;
  /**
   * Called with the key of the destination a click, Enter or Space
   * asked for, the active one included, so an application can treat a
   * second press as "back to the top of this page".
   */
  onChange?: (key: string) => void;
  /**
   * Called with the key of the destination a modified activation asked
   * to open somewhere new: a Command-click or Control-click, a middle
   * click, or Command-Enter or Control-Enter. The value does not move
   * and `onChange` is not called, so the screen the reader is on stays.
   *
   * Opt-in. Without it, and on a destination without `to`, a modified
   * activation is a plain one, as it always was. A press on a group is
   * always plain: a group has nowhere to open.
   */
  onOpenElsewhere?: (key: string) => void;
  /** The open groups, by key. Omit to let the rail manage them. */
  expanded?: readonly string[];
  defaultExpanded?: readonly string[];
  onExpandedChange?: (expanded: readonly string[]) => void;
  /**
   * Icons only. Each row draws its icon (or its label's first letter)
   * centred in a narrow column, shows its label as a tooltip on hover
   * and on keyboard focus, and keeps it as its accessible name. Bound,
   * so a toggle elsewhere narrows the rail in place.
   */
  collapsed?: boolean;
  /**
   * The rail's width while it is expanded. Default 240. A collapsed
   * rail is always 56 wide (`COLLAPSED_WIDTH`), whatever this says.
   */
  width?: UiLength;
  /** The landmark's accessible name, and the list's. Default `'Main'`. */
  label?: string;
}

/** How wide a collapsed rail is: an icon, its padding and the rail's own. */
export const COLLAPSED_WIDTH = 56;

/**
 * A vertical list of an application's destinations, with one of them
 * active.
 *
 * The rail a workbench, a mail client or a settings screen has down its
 * side: destinations with optional icons and badges, groups that open
 * and close, and a narrow icons-only form. It replaces the hand-built
 * column of buttons every such screen grows, which is usually reachable
 * only by Tab, one row at a time, and announces nothing about which
 * row is the current page.
 *
 * ## Why a tree, inside the navigation landmark
 *
 * The outer node is a `navigation` landmark, so a screen reader's list
 * of landmarks finds it. Inside it the rows are a `tree` of `treeitem`s
 * rather than a `list` of links, which is ARIA's own "navigation
 * treeview" pattern and the only one of the two that fits what the
 * rail does. A list of links says nothing about a group being open or
 * shut, and a screen reader does not pass the arrow keys to a list: it
 * keeps them for its own reading cursor, so a rail of a list would be
 * operable only by Tab. A tree is a composite widget, which is what
 * tells the reader to hand the arrows over. Each row reports its
 * `level`, `posInSet` and `setSize`, the way `Tree`'s rows do.
 *
 * The active destination carries `current`, not `selected`. `current`
 * is ARIA's "the page this link leads to is the one open", which is
 * exactly the claim; `selected` is a choice in a listbox and is not
 * what a reader expects of navigation.
 *
 * ## Focus moves, the value does not
 *
 * The rail is one tab stop. Unlike `Tree` and `Tabs`, whose focus sits
 * on the container while a highlight moves inside it, the arrows here
 * move focus itself from row to row, and only the row that holds the
 * tab stop is in the Tab order (a roving tab stop). Three things decide
 * it:
 *
 *   - **The arrows must not navigate.** In `Tabs` an arrow chooses,
 *     which is cheap; here a choice is a navigation, and walking down
 *     six rows must not load six screens. So there is a cursor apart
 *     from the value, and Enter or Space is what activates.
 *   - **A collapsed rail's labels are tooltips,** and `tooltip()`
 *     already opens on focus the keyboard can see. A cursor that lived
 *     in state would need a second tooltip mechanism of its own.
 *   - **The runtime keeps a focused node in view,** for focus moved by
 *     anything but the pointer, so a walk past the bottom of a tall
 *     rail scrolls it with nothing here asking.
 *
 * The row holding the tab stop is the one focus was last on, or the
 * active destination before that, or the first row that can be
 * focused. Whichever it is, it is always a visible row that is not
 * disabled, so Tab can always reach the rail.
 *
 * ## Keeping the active row in view
 *
 * When the value changes, and again when the scroller is given a new
 * box, the active row is scrolled into view, as `Select` keeps its
 * highlighted option in view. It is the scroller's box and not its
 * scroll position, so turning the wheel is not undone; a window
 * resized shorter brings the active row back. A value inside a shut
 * group has no row to show, and the group's own label is drawn in a
 * heavier weight instead, so the reader still sees which group holds
 * the current page. Opening it is left to the application: the rail
 * never changes the open set on its own, because a change it made
 * would be reported to `onExpandedChange` as if the reader had made it.
 *
 * ## Right to left
 *
 * The layout mirrors by itself under `textDirection: 'rtl'`: the indent
 * is on the start side and the badge and the arrow at the end. The keys
 * are asked which way the rail reads when they arrive, as `Slider`
 * asks: Right opens a group reading left to right, and Left does,
 * reading right to left. The group's arrow points down when shut and up
 * when open, which means the same thing in both directions and needs no
 * mirror.
 *
 * ## What is read once
 *
 * The rows of one `items` array are built once and kept by key, so an
 * open or a close moves rows rather than rebuilding them, and the focus
 * on a row survives a group opening above it. A new `items` array
 * builds new rows. Each group's `defaultExpanded` is read once, from the
 * first array.
 */
export function NavigationRail(inputs: Inputs<NavigationRailProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Main');
  const collapsed = input(inputs.collapsed, false);
  const expandedWidth = input(inputs.width, DEFAULT_WIDTH);
  const focusStore = ctx.inject(FocusService);
  const scroll = ctx.inject(ScrollService);
  const router = ctx.inject(RouterService);
  const shell = ctx.inject(ShellService);

  const value = controlled<string | null>({
    component: 'NavigationRail',
    name: 'value',
    source: inputs.value,
    initial: inputs.defaultValue,
    fallback: null,
    // The rail only ever reports a key, never null, so the narrower
    // callback a caller writes is the one it is given.
    onChange: inputs.onChange as unknown as OutputCell<[next: string | null]>
  });
  const expanded = controlled<readonly string[]>({
    component: 'NavigationRail',
    name: 'expanded',
    source: inputs.expanded,
    initial: inputs.defaultExpanded,
    fallback: openByDefault(inputs.items.value),
    onChange: inputs.onExpandedChange
  });

  // ---------------------------------------------------------------------
  // The model, flattened
  // ---------------------------------------------------------------------

  let model: { items: readonly NavigationItem[]; rows: RailRow[]; byKey: Map<string, RailRow> } | null = null;
  const indexed = (): { rows: RailRow[]; byKey: Map<string, RailRow> } => {
    const items = inputs.items.value;
    if (model === null || model.items !== items) {
      const rows = flatten(items, null);
      model = { items, rows, byKey: new Map(rows.map(row => [row.item.key, row])) };
      // A new array is a new set of rows: the old ones are not reused,
      // because a row's level, position and label are read when it is
      // built.
      elements.clear();
    }
    return model;
  };

  let shown: { items: readonly NavigationItem[]; open: readonly string[]; rows: RailRow[] } | null = null;
  /** The rows on screen, in the order they are drawn: the open part of the model. */
  const visible = (): RailRow[] => {
    const items = inputs.items.value;
    const open = expanded.current();
    if (shown === null || shown.items !== items || shown.open !== open) {
      shown = { items, open, rows: flatten(items, new Set(open)) };
    }
    return shown.rows;
  };

  // ---------------------------------------------------------------------
  // Where focus is, and which row holds the tab stop
  // ---------------------------------------------------------------------

  /** Every mounted row's node by key, and the way back, for moving focus and revealing. */
  const nodes = new Map<string, UiNode>();
  const keyOfNode = new WeakMap<UiNode, string>();
  const track = (key: string, node: UiNode | null, previous: UiNode | null): void => {
    if (node !== null) {
      nodes.set(key, node);
      keyOfNode.set(node, key);
    } else if (previous !== null && nodes.get(key) === previous) {
      nodes.delete(key);
    }
  };

  /** The row focus was last on, by key: the roving tab stop's memory. */
  const cursor = new BehaviorSubject<string | null>(null);
  ctx.effect(focusStore.focused, node => {
    const key = node === null ? undefined : keyOfNode.get(node);
    if (key !== undefined) {
      cursor.next(key);
    }
  });

  const focusable = (row: RailRow | undefined): boolean => row !== undefined && !row.disabled;
  /**
   * The row that is in the Tab order: the cursor, the active
   * destination, or the first row that can take focus, whichever is
   * first to be a visible row that is not disabled. Never a row that
   * is not there, or the rail would drop out of the Tab order.
   */
  const stopKey = (): string | null => {
    const rows = visible();
    for (const wanted of [cursor.value, value.current()]) {
      const row = rows.find(candidate => candidate.item.key === wanted);
      if (focusable(row)) {
        return wanted;
      }
    }
    return rows.find(focusable)?.item.key ?? null;
  };
  const stop = combineLatest([cursor, value.value, inputs.items, expanded.value]).pipe(
    map(stopKey),
    distinctUntilChanged()
  );

  // Keyed by the row's key, as `Tree`'s selection is, so a move tells
  // the two rows it moved between and no others.
  const isCurrent = rowCells(value.value, (current: string | null, key) => current === key, {
    initial: false,
    changed: movedBetween,
    label: 'NavigationRail.current'
  });
  const holdsStop = rowCells(stop, (current: string | null, key) => current === key, {
    initial: false,
    changed: movedBetween,
    label: 'NavigationRail.stop'
  });

  /** The row the keys act on: the focused one, or the tab stop when focus is elsewhere. */
  const here = (): RailRow | undefined => {
    const node = focusStore.focused.value;
    const key = (node === null ? undefined : keyOfNode.get(node)) ?? stopKey();
    return key === null ? undefined : visible().find(row => row.item.key === key);
  };
  const focusRow = (row: RailRow | undefined): void => {
    const node = row === undefined ? undefined : nodes.get(row.item.key);
    if (node !== undefined) {
      cursor.next(row!.item.key);
      focusStore.focus(node);
    }
  };

  // ---------------------------------------------------------------------
  // What a press or a key does
  // ---------------------------------------------------------------------

  const setOpen = (key: string, open: boolean): void => {
    const current = expanded.current();
    if (open === current.includes(key)) {
      return;
    }
    expanded.change(open ? [...current, key] : current.filter(entry => entry !== key));
  };
  /**
   * A group opens or closes; a destination asks to become the value, or,
   * for `elsewhere`, to be opened somewhere new.
   *
   * A request for somewhere new is honoured only when something will
   * act on it: an `onOpenElsewhere` on the rail or a `to` on the
   * destination. Otherwise it is a plain activation, so a rail that
   * never asked for this answers a Cmd-click exactly as it did before,
   * rather than swallowing it. It never moves the value, because the
   * page the reader is on is not the one that changed.
   */
  const activate = (row: RailRow | undefined, elsewhere = false): void => {
    if (row === undefined || row.disabled) {
      return;
    }
    const item = row.item;
    if (isGroup(item)) {
      setOpen(item.key, !expanded.current().includes(item.key));
      return;
    }
    if (elsewhere && (item.to !== undefined || inputs.onOpenElsewhere.value !== undefined)) {
      // Reported first, as `Link` runs `onPress` first, so a handler
      // that records the request has it before the shell is asked.
      inputs.onOpenElsewhere.emit(item.key);
      if (item.to !== undefined) {
        followRoute(item.to, true, router, shell);
      }
      return;
    }
    value.change(item.key);
    if (item.to !== undefined) {
      followRoute(item.to, false, router, shell);
    }
  };

  /**
   * The first row that can take focus from `start` on, walking by
   * `delta`. Clamped, never wrapped, as `Tree` is: a step past the end
   * is the end.
   */
  const seek = (start: number, delta: number): RailRow | undefined => {
    const rows = visible();
    for (let index = start; index >= 0 && index < rows.length; index += delta) {
      if (focusable(rows[index])) {
        return rows[index];
      }
    }
    return undefined;
  };
  const step = (delta: number): void => {
    const rows = visible();
    const from = here();
    const at = from === undefined ? -1 : rows.indexOf(from);
    focusRow(at === -1 ? seek(delta > 0 ? 0 : rows.length - 1, delta) : (seek(at + delta, delta) ?? rows[at]));
  };
  /** Opens a shut group, and steps into an open one. ARIA's tree key. */
  const forward = (): void => {
    const row = here();
    if (row === undefined || row.disabled || !isGroup(row.item)) {
      return;
    }
    if (!expanded.current().includes(row.item.key)) {
      setOpen(row.item.key, true);
      return;
    }
    const rows = visible();
    // Into the group and nowhere else: one holding only disabled rows
    // keeps focus where it is, rather than carrying it to the row after.
    for (let next = rows.indexOf(row) + 1; next < rows.length && rows[next].level > row.level; next += 1) {
      if (focusable(rows[next])) {
        focusRow(rows[next]);
        return;
      }
    }
  };
  /** Closes an open group, and steps out of anything else to its group. */
  const back = (): void => {
    const row = here();
    if (row === undefined) {
      return;
    }
    if (isGroup(row.item) && !row.disabled && expanded.current().includes(row.item.key)) {
      setOpen(row.item.key, false);
      return;
    }
    if (row.parent !== null) {
      focusRow(visible().find(candidate => candidate.item.key === row.parent));
    }
  };
  /**
   * Type-ahead: the next row after the focused one whose label starts
   * with the character, wrapping. One character at a time, as a tree's
   * type-ahead is in ARIA's pattern: typing the same letter again walks
   * every row that starts with it.
   */
  const jump = (character: string): boolean => {
    const rows = visible();
    const wanted = character.toLocaleLowerCase();
    const focused = here();
    const from = focused === undefined ? -1 : rows.indexOf(focused);
    for (let offset = 1; offset <= rows.length; offset += 1) {
      const row = rows[(from + offset + rows.length) % rows.length];
      if (focusable(row) && row.item.label.toLocaleLowerCase().startsWith(wanted)) {
        focusRow(row);
        return true;
      }
    }
    return false;
  };

  /**
   * Whether the rail reads right to left, asked when a key arrives
   * rather than when the rail is built, as `Slider` asks: the direction
   * is inherited, and an ancestor can change it.
   */
  let rootNode: UiNode | null = null;
  const rtl = (): boolean => rootNode !== null && resolveString(rootNode, 'textDirection') === 'rtl';

  const onKeyDown = (event: UiKeyboardEvent): void => {
    const mirrored = rtl();
    keymap({
      ArrowDown: () => step(1),
      ArrowUp: () => step(-1),
      Home: () => focusRow(seek(0, 1)),
      End: () => focusRow(seek(visible().length - 1, -1)),
      ArrowRight: mirrored ? back : forward,
      ArrowLeft: mirrored ? forward : back,
      // Command-Enter or Control-Enter is the keyboard's Cmd-click. The
      // row is a `treeitem`, which the runtime does not press for us, so
      // the chord is read here with the key, as `Link` reads it.
      Enter: event => activate(here(), opensElsewhere(event.modifiers)),
      ' ': () => activate(here())
    })(event);
    // A letter is spent only when a row starts with it, so an
    // application's own single-key shortcuts still work from the rail
    // for every letter it has no row for.
    if (!event.defaultPrevented && typed(event) && jump(event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // ---------------------------------------------------------------------
  // Keeping the active row in view
  // ---------------------------------------------------------------------

  const scrollerBox = new Subject<LayoutBox>();
  const reveal = (): void => {
    const key = value.current();
    const node = key === null ? undefined : nodes.get(key);
    if (node !== undefined) {
      scroll.scrollIntoView(node, 4);
    }
  };
  ctx.effect(value.value, reveal);
  ctx.effect(scrollerBox, reveal);

  // ---------------------------------------------------------------------
  // Rows
  // ---------------------------------------------------------------------

  /**
   * What every row reads from the rail, handed to each as one value.
   *
   * A row is a component of its own rather than an element built here,
   * for its tooltip: `tooltip()` takes an overlay entry from the
   * component it is called in, and may only be called while that
   * component's body runs. The rows of a rail arrive later than its
   * body, whenever `items` changes, so each row is a component whose
   * body asks for its own, and whose tooltip closes when it goes.
   */
  const rail: RailContext = {
    collapsed,
    expanded: expanded.value,
    value: value.value,
    isCurrent,
    holdsStop,
    labelOf: key => indexed().byKey.get(key)?.item.label ?? '',
    track,
    activate
  };

  const elements = new Map<string, UiChild>();
  const elementFor = (row: RailRow): UiChild => {
    let made = elements.get(row.item.key);
    if (made === undefined) {
      const anyIcon = indexed().rows.some(candidate => candidate.item.icon !== undefined);
      made = createComponent(RailItem, { row, rail, anyIcon }, row.item.key);
      elements.set(row.item.key, made);
    }
    return made;
  };

  const rows = combineLatest([inputs.items, expanded.value]).pipe(
    map(() => {
      indexed();
      return visible().map(elementFor);
    })
  );

  const { width: _ignored, ...layout } = layoutOf(inputs);
  return Column(
    {
      ...layout,
      ref: (node: UiNode | null) => (rootNode = node),
      modifiers: modifiersOf(inputs),
      width: combineLatest([collapsed, expandedWidth]).pipe(
        map(([narrow, wide]): UiLength => (narrow ? COLLAPSED_WIDTH : wide))
      ),
      x: 'stretch',
      role: 'navigation',
      label
    },
    Column(
      {
        modifiers: [measureFlow(scrollerBox)],
        overflow: 'auto',
        flexGrow: 1,
        minHeight: 0,
        padding: 8,
        gap: 2,
        x: 'stretch',
        role: 'tree',
        label,
        onKeyDown
      },
      rows
    )
  );
}

// ---------------------------------------------------------------------------
// A row
// ---------------------------------------------------------------------------

/** The rail's side of a row: its state, and what a press does. */
interface RailContext {
  readonly collapsed: Observable<boolean>;
  readonly expanded: Observable<readonly string[]>;
  readonly value: Observable<string | null>;
  readonly isCurrent: (key: string) => Observable<boolean>;
  readonly holdsStop: (key: string) => Observable<boolean>;
  /** The label a key has now, for a tooltip asked for after `items` changed. */
  readonly labelOf: (key: string) => string;
  readonly track: (key: string, node: UiNode | null, previous: UiNode | null) => void;
  readonly activate: (row: RailRow, elsewhere: boolean) => void;
}

interface RailItemProps {
  row: RailRow;
  rail: RailContext;
  /** Whether any row in the rail has an icon, so one without keeps the icon's room. */
  anyIcon: boolean;
}

/**
 * One row: a destination or a group's heading, focusable, with the
 * roving tab stop when it holds it. Its props are read once: a rail
 * builds new rows for a new `items` array rather than handing old rows
 * new data.
 */
function RailItem(inputs: Inputs<RailItemProps>, ctx: ComponentContext): UiChild {
  const row = inputs.row.value;
  const rail = inputs.rail.value;
  const anyIcon = inputs.anyIcon.value;
  const item = row.item;
  const key = item.key;
  const group = isGroup(item);
  const disabled = row.disabled;
  const middle = middlePress();
  const current = rail.isCurrent(key);
  const open = rail.expanded.pipe(
    map(keys => keys.includes(key)),
    distinctUntilChanged()
  );
  const ink: Observable<UiColorValue> = current.pipe(
    map(on => (disabled ? 'controlForegroundDisabled' : on ? 'selectionForeground' : 'controlForeground'))
  );
  // A shut group that holds the active destination says so in its own
  // label's weight, because the row that would say it is hidden.
  const inside = group ? descendantKeys(item) : null;
  const weight: Observable<number> | number = group
    ? combineLatest([open, rail.value]).pipe(
        map(([isOpen, active]) => (!isOpen && active !== null && inside!.has(active) ? 600 : 400))
      )
    : 400;
  const badge = group ? undefined : item.badge;
  // Its label, while the rail is collapsed and draws none. Asked when
  // it opens, so an expanded rail, which draws the label already, gives
  // it nothing to say and it stays shut. Past the rail's end edge,
  // toward what it serves: the right of a rail reading left to right,
  // the left of one reading right to left. The overlay still flips it
  // at the window's edge.
  let narrow = false;
  ctx.effect(rail.collapsed, value => (narrow = value));
  const tip = tooltip(ctx, { text: () => (narrow ? rail.labelOf(key) : ''), placement: 'end' });
  let mounted: UiNode | null = null;

  return Row(
    {
      ref: (node: UiNode | null) => {
        rail.track(key, node, mounted);
        mounted = node;
      },
      modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING, tip],
      focusable: true,
      tabStop: rail.holdsStop(key),
      disabled,
      cursor: disabled ? 'default' : 'pointer',
      // Its own height, in a rail given less room than its rows want:
      // the list scrolls them rather than squeezing them.
      flexShrink: 0,
      height: ROW_HEIGHT,
      x: rail.collapsed.pipe(map(collapsed => (collapsed ? 'center' : 'start'))),
      y: 'center',
      gap: 10,
      // The indent is the level, which is also what the row reports,
      // and on the start side, so it mirrors with the text. A collapsed
      // rail has no room for an indent and draws every row centred.
      paddingStart: rail.collapsed.pipe(map(collapsed => (collapsed ? 0 : 12 + (row.level - 1) * INDENT))),
      paddingEnd: rail.collapsed.pipe(map(collapsed => (collapsed ? 0 : 10))),
      borderRadius: 6,
      backgroundColor: current.pipe(map(on => (on ? 'selectionBackground' : 'transparent'))),
      role: 'treeitem',
      label: item.label,
      description: badge === undefined ? undefined : ((item as NavigationDestination).badgeLabel ?? String(badge)),
      level: row.level,
      posInSet: row.position + 1,
      setSize: row.siblings,
      states: group
        ? open.pipe(map(isOpen => (isOpen ? EXPANDED : COLLAPSED)))
        : current.pipe(map(on => (on ? CURRENT : NO_STATES))),
      // A Click carries the keys held but not the button, so a middle
      // press is noted on the way down; see `middlePress`.
      onPointerDown: middle.onPointerDown,
      onClick: (event: UiPointerEvent) => rail.activate(row, middle.take() || opensElsewhere(event.modifiers))
    },
    rail.collapsed.pipe(
      map((collapsed): UiChild[] =>
        collapsed
          ? narrowContent(item, ink, open, group, badge !== undefined)
          : wideContent(item, ink, weight, open, group, badge, anyIcon)
      )
    )
  );
}

// ---------------------------------------------------------------------------
// What a row draws
// ---------------------------------------------------------------------------

/**
 * An expanded row: the icon, the label, then the badge or the group's
 * arrow at the end.
 *
 * A row with no icon in a rail where some rows have one keeps the
 * icon's width, so every label starts on the same line.
 */
function wideContent(
  item: NavigationItem,
  ink: Observable<UiColorValue>,
  weight: Observable<number> | number,
  open: Observable<boolean>,
  group: boolean,
  badge: number | string | undefined,
  anyIcon: boolean
): UiChild[] {
  return [
    ...(item.icon !== undefined
      ? [glyphOf(item.icon, ink, {})]
      : anyIcon
        ? [Box({ width: ICON, height: ICON, flexShrink: 0 })]
        : []),
    Text({
      text: item.label,
      textStyle: 'body',
      fontWeight: weight,
      color: ink,
      selectable: false,
      maxLines: 1,
      textOverflow: 'ellipsis',
      flex: 1,
      minWidth: 0
    }),
    ...(badge === undefined
      ? []
      : [createComponent(Badge, typeof badge === 'number' ? { count: badge } : { label: badge })]),
    ...(group ? [chevron(open.pipe(map(isOpen => (isOpen ? CHEVRON_UP : CHEVRON_DOWN))), ink, 14)] : [])
  ];
}

/**
 * A collapsed row: the icon, or the label's first letter, with a dot
 * for a badge and a small arrow for a group.
 *
 * The dot is drawn only: the row's description already says what the
 * badge says, and a named dot inside it would say it twice.
 */
function narrowContent(
  item: NavigationItem,
  ink: Observable<UiColorValue>,
  open: Observable<boolean>,
  group: boolean,
  badged: boolean
): UiChild[] {
  const glyph =
    item.icon !== undefined
      ? glyphOf(item.icon, ink, CENTRED)
      : Text({
          text: monogram(item.label),
          // A size rather than a role: the letter stands in for an icon
          // in a fixed 26 by 24 box, so it is sized to the box.
          fontSize: 13,
          fontWeight: 600,
          color: ink,
          selectable: false,
          selfX: 'center',
          selfY: 'center'
        });
  return [
    Box(
      { width: 26, height: 24, flexShrink: 0 },
      glyph,
      ...(badged
        ? [
            Box({
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: 'controlAccent',
              selfX: 'end',
              selfY: 'start'
            })
          ]
        : [])
    ),
    ...(group ? [chevron(open.pipe(map(isOpen => (isOpen ? CHEVRON_UP : CHEVRON_DOWN))), ink, 10)] : [])
  ];
}

const CENTRED = { selfX: 'center', selfY: 'center' } as const;

/**
 * A row's icon, through `Icon`, so a string draws exactly as it always
 * did. Several paths are laid over each other in one icon-sized box,
 * one `Icon` each, because that is what an SVG of several `<path>`s
 * means: joined into one path, two filled shapes wound opposite ways
 * would cancel where they overlap.
 */
function glyphOf(
  icon: NavigationIcon,
  ink: Observable<UiColorValue>,
  place: { readonly selfX?: 'center'; readonly selfY?: 'center' }
): UiChild {
  if (typeof icon === 'string') {
    return createComponent(Icon, { path: icon, size: ICON, color: ink, ...place });
  }
  // Only what was given, so `Icon`'s own defaults apply to the rest.
  const how = {
    ...(icon.style === undefined ? {} : { style: icon.style }),
    ...(icon.strokeWidth === undefined ? {} : { strokeWidth: icon.strokeWidth }),
    ...(icon.fillRule === undefined ? {} : { fillRule: icon.fillRule })
  };
  const paths = typeof icon.path === 'string' ? [icon.path] : icon.path;
  if (paths.length === 1) {
    return createComponent(Icon, { path: paths[0], size: ICON, color: ink, ...how, ...place });
  }
  return Box(
    { width: ICON, height: ICON, flexShrink: 0, ...place },
    ...paths.map(path => createComponent(Icon, { path, size: ICON, color: ink, ...how }))
  );
}

/** The first character a reader would see, capitalised, for a row with no icon. */
function monogram(label: string): string {
  const first = Array.from(label.trim())[0] ?? '';
  return first.toLocaleUpperCase();
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

/** One row: an item, how deep it sits, and where among its siblings. */
interface RailRow {
  readonly item: NavigationItem;
  readonly level: number;
  readonly position: number;
  readonly siblings: number;
  readonly parent: string | null;
  /** Its own `disabled`, or that of any group it sits in. */
  readonly disabled: boolean;
}

function isGroup(item: NavigationItem): item is NavigationGroup {
  return (item as NavigationGroup).items !== undefined;
}

/**
 * The model in the order it is drawn: every row with `open` null, or
 * only the open part of it.
 *
 * Iterative, as `Tree`'s flattening is, for the same reason: depth
 * then costs memory rather than call frames. A rail is rarely more
 * than two deep, but nothing here relies on it.
 */
function flatten(items: readonly NavigationItem[], open: ReadonlySet<string> | null): RailRow[] {
  const rows: RailRow[] = [];
  // A group's `disabled` is carried down the stack, so a row inside a
  // disabled group is disabled at any depth without each row having to
  // look up its ancestors.
  const stack: { siblings: readonly NavigationItem[]; next: number; parent: string | null; disabled: boolean }[] = [
    { siblings: items, next: 0, parent: null, disabled: false }
  ];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (top.next >= top.siblings.length) {
      stack.pop();
      continue;
    }
    const position = top.next;
    const item = top.siblings[position];
    top.next += 1;
    const disabled = top.disabled || item.disabled === true;
    rows.push({ item, level: stack.length, position, siblings: top.siblings.length, parent: top.parent, disabled });
    if (isGroup(item) && (open === null || open.has(item.key))) {
      stack.push({ siblings: item.items, next: 0, parent: item.key, disabled });
    }
  }
  return rows;
}

/** The groups marked `defaultExpanded`, at any depth: a rail's open set when it owns one and was given none. */
function openByDefault(items: readonly NavigationItem[]): readonly string[] {
  return flatten(items, null)
    .map(row => row.item)
    .filter((item): item is NavigationGroup => isGroup(item) && item.defaultExpanded === true)
    .map(item => item.key);
}

/** Every key under a group, at any depth. */
function descendantKeys(group: NavigationGroup): ReadonlySet<string> {
  return new Set(flatten(group.items, null).map(row => row.item.key));
}

/**
 * A character typed at the rail, for type-ahead: a printable key with
 * nothing held but Shift, as `Select` reads one. Mod+K is a shortcut,
 * not a K, and Space is activation.
 */
function typed(event: UiKeyboardEvent): boolean {
  return (
    event.key.length === 1 &&
    event.key !== ' ' &&
    !event.modifiers.ctrl &&
    !event.modifiers.meta &&
    !event.modifiers.alt
  );
}

/**
 * Shared rather than built per emission, for the reason `rowCells`
 * gives: a row whose states did not change hands the graph the same
 * array, and the write ends at its equality test.
 */
const CURRENT: readonly UiSemanticState[] = Object.freeze(['current'] as UiSemanticState[]);
const EXPANDED: readonly UiSemanticState[] = Object.freeze(['expanded'] as UiSemanticState[]);
const COLLAPSED: readonly UiSemanticState[] = Object.freeze(['collapsed'] as UiSemanticState[]);

/**
 * Heroicons' outline `chevron-up`, drawn as `chevron.ts` draws its
 * two: a 24 grid, a 1.5 stroke. MIT licensed, copyright Tailwind Labs,
 * Inc. (https://github.com/tailwindlabs/heroicons). An open group
 * points up and a shut one down, which reads the same in both
 * directions, where a right-pointing arrow would have to be mirrored.
 */
const CHEVRON_UP = 'm4.5 15.75 7.5-7.5 7.5 7.5';

const DEFAULT_WIDTH = 240;
const ROW_HEIGHT = 36;
const ICON = 18;
/** How far each level of nesting is indented, from the start side. */
const INDENT = 16;
