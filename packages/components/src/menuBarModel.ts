/**
 * How a menu bar behaves under the keyboard, as a pure function.
 *
 * A menu bar is more of a state machine than it looks. The arrows mean
 * four different things depending on whether a menu is open, Escape
 * means two, and a letter means "jump to the item starting with it" or
 * "open the menu starting with it". Written inside event handlers that
 * is a pile of `if`s nobody can check; written here it is a table with
 * a spec, and the component above it draws what the table says.
 *
 * **Why this is not `Menu`.** `Menu` owns its own keyboard and traps
 * focus inside itself, which is right for a popup opened by a button
 * and wrong for a bar: with focus trapped in the popup, ArrowLeft
 * cannot reach the bar to move to the menu next door, and walking
 * between menus with the arrows is most of what makes a menu bar a
 * menu bar. So a bar keeps focus on itself and draws the open menu as
 * an overlay that does not take the keyboard, and this is the model
 * that arrangement needs.
 *
 * It holds no state and touches nothing: it takes a state and a key
 * and returns the next state. That is deliberate, and it is what lets
 * every one of the rules below be a line in a spec rather than a click
 * in a browser.
 *
 * Generic in the command type, so an application's own identifiers go
 * straight in without a cast and its own menu definitions satisfy
 * `MenuBarMenu` structurally.
 */

/** A rule between two groups of entries. */
export const MENU_SEPARATOR = '-' as const;

/** One row of a menu: a command, or a rule. */
export type MenuBarEntry<T> = T | typeof MENU_SEPARATOR;

/** One menu on the bar. */
export interface MenuBarMenu<T> {
  /** What the bar shows. */
  readonly label: string;
  /**
   * The letter that opens it from the bar, lower case.
   *
   * Omitted means the menu has none and cannot be opened by a letter,
   * which is worth avoiding: a bar where some menus answer a letter
   * and others do not is harder to use than one where none do.
   */
  readonly mnemonic?: string;
  readonly entries: readonly MenuBarEntry<T>[];
}

export interface MenuBarState {
  /**
   * The menu the bar's focus is on.
   *
   * There is always one, open or not: a menu bar is a single tab stop
   * with a roving highlight inside it, not one stop per menu, so that
   * Tab past the bar costs one press rather than one per menu.
   */
  readonly focused: number;
  readonly open: boolean;
  /**
   * The highlighted entry in the open menu, as an index into
   * `entries` — separators included.
   *
   * Into the whole list rather than into the choosable subset, for the
   * reason `Menu` gives for the same decision: the row paints its
   * highlight by comparing its own position, and walking one list while
   * painting by another makes them disagree the moment a rule or a
   * disabled item sits anywhere but the end.
   */
  readonly active: number;
}

/** A bar with nothing open and the first menu focused. */
export const MENU_BAR_CLOSED: MenuBarState = { focused: 0, open: false, active: -1 };

export interface MenuBarStep<T> {
  readonly state: MenuBarState;
  /** The command the key chose, when it chose one. */
  readonly choose?: T;
  /** True when the key means "give the keyboard back to what is underneath". */
  readonly dismiss?: boolean;
}

/**
 * What the model needs to know about the commands it is walking.
 *
 * Passed in rather than read off the menu definitions, so that whether
 * a command can be chosen right now stays the application's question
 * and the menus stay a static description.
 */
export interface MenuBarContext<T> {
  /** Whether a command can be chosen at this moment. */
  readonly enabled: (item: T) => boolean;
  /** A command's label, which is what type-ahead matches against. */
  readonly labelOf: (item: T) => string;
}

/**
 * What a key does to the bar, or null to let it through.
 *
 * Null is the important half. A key the bar does not claim has to
 * reach whatever is underneath, and a bar that swallowed everything
 * while it had focus would be a bar you cannot Tab out of.
 */
export function menuBarStep<T>(
  state: MenuBarState,
  key: string,
  menus: readonly MenuBarMenu<T>[],
  context: MenuBarContext<T>
): MenuBarStep<T> | null {
  if (menus.length === 0) {
    return null;
  }
  const focused = clampMenu(state.focused, menus);

  if (!state.open) {
    switch (key) {
      case 'ArrowLeft':
        return { state: { focused: wrap(focused - 1, menus.length), open: false, active: -1 } };
      case 'ArrowRight':
        return { state: { focused: wrap(focused + 1, menus.length), open: false, active: -1 } };
      case 'Home':
        return { state: { focused: 0, open: false, active: -1 } };
      case 'End':
        return { state: { focused: menus.length - 1, open: false, active: -1 } };
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        return { state: opened(focused, menus, context, 1) };
      case 'ArrowUp':
        return { state: opened(focused, menus, context, -1) };
      case 'Escape':
        return { state: MENU_BAR_CLOSED, dismiss: true };
      default: {
        // A bare letter opens the menu it names. With the bar focused
        // and nothing open there is nothing else a letter could mean,
        // and it is how every menu bar has worked for thirty years.
        const named = isPrintable(key) ? menus.findIndex(menu => menu.mnemonic === key.toLowerCase()) : -1;
        return named === -1 ? null : { state: opened(named, menus, context, 1) };
      }
    }
  }

  const entries = menus[focused]!.entries;
  switch (key) {
    case 'ArrowDown':
      return { state: { focused, open: true, active: seek(entries, state.active + 1, 1, context) } };
    case 'ArrowUp':
      return { state: { focused, open: true, active: seek(entries, state.active - 1, -1, context) } };
    case 'Home':
      return { state: { focused, open: true, active: seek(entries, 0, 1, context) } };
    case 'End':
      return { state: { focused, open: true, active: seek(entries, entries.length - 1, -1, context) } };
    /**
     * Left and right walk the *bar* while a menu is open, closing this
     * one and opening the next. This is the case a focus-trapped popup
     * cannot serve, and the reason this model exists.
     */
    case 'ArrowLeft':
      return { state: opened(wrap(focused - 1, menus.length), menus, context, 1) };
    case 'ArrowRight':
      return { state: opened(wrap(focused + 1, menus.length), menus, context, 1) };
    case 'Escape':
      // The first Escape closes the menu and leaves the bar focused,
      // the second gives the keyboard back. Closing straight through
      // loses the place of anybody who opened the wrong menu, which is
      // most people, most of the time.
      return { state: { focused, open: false, active: -1 } };
    case 'Enter':
    case ' ': {
      const entry = entries[state.active];
      if (entry === undefined || entry === MENU_SEPARATOR || !context.enabled(entry as T)) {
        return { state };
      }
      return { state: { focused, open: false, active: -1 }, choose: entry as T, dismiss: true };
    }
    case 'Tab':
      // Tab out of an open menu closes it rather than moving inside it.
      // A menu is not a set of tab stops.
      return { state: MENU_BAR_CLOSED, dismiss: true };
    default: {
      if (!isPrintable(key)) {
        return null;
      }
      const found = typeAhead(entries, state.active, key, context);
      return found === -1 ? { state } : { state: { focused, open: true, active: found } };
    }
  }
}

/** Opening a menu with its first choosable entry highlighted. */
function opened<T>(
  index: number,
  menus: readonly MenuBarMenu<T>[],
  context: MenuBarContext<T>,
  direction: 1 | -1
): MenuBarState {
  const entries = menus[index]!.entries;
  const from = direction === 1 ? 0 : entries.length - 1;
  return { focused: index, open: true, active: seek(entries, from, direction, context) };
}

/**
 * The next entry that can be chosen, wrapping, or -1 when none can.
 *
 * Wrapping is what makes ArrowDown on the last item land on the first,
 * which every menu does and which people rely on to reach the bottom
 * of a long menu from the top.
 */
function seek<T>(
  entries: readonly MenuBarEntry<T>[],
  from: number,
  direction: 1 | -1,
  context: MenuBarContext<T>
): number {
  const count = entries.length;
  if (count === 0) {
    return -1;
  }
  for (let moved = 0; moved < count; moved++) {
    const index = wrap(from + direction * moved, count);
    const entry = entries[index];
    if (entry !== MENU_SEPARATOR && entry !== undefined && context.enabled(entry as T)) {
      return index;
    }
  }
  return -1;
}

/**
 * The next entry whose label starts with a letter.
 *
 * Searched from *after* the highlight, so pressing the same letter
 * twice walks the items sharing it rather than sitting on the first.
 */
function typeAhead<T>(
  entries: readonly MenuBarEntry<T>[],
  active: number,
  key: string,
  context: MenuBarContext<T>
): number {
  const wanted = key.toLowerCase();
  for (let moved = 1; moved <= entries.length; moved++) {
    const index = wrap(active + moved, entries.length);
    const entry = entries[index];
    if (entry === MENU_SEPARATOR || entry === undefined || !context.enabled(entry as T)) {
      continue;
    }
    if (
      context
        .labelOf(entry as T)
        .toLowerCase()
        .startsWith(wanted)
    ) {
      return index;
    }
  }
  return -1;
}

/** A key that types a character, as opposed to one that commands something. */
function isPrintable(key: string): boolean {
  return [...key].length === 1 && key !== '\t' && key !== '\n';
}

function wrap(value: number, count: number): number {
  return ((value % count) + count) % count;
}

function clampMenu<T>(index: number, menus: readonly MenuBarMenu<T>[]): number {
  return Math.min(Math.max(index, 0), menus.length - 1);
}
