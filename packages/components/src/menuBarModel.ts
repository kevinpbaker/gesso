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

/**
 * A row that opens a menu of its own beside it: View → Precision ▸.
 *
 * Shaped as a bar's menu is, with `submenu` where a menu has `entries`,
 * so a command type that is an object should not have a `submenu`
 * array of its own. Its entries are chosen as the bar's are: one chosen
 * is `onChoose`'s, and closes everything. It can nest.
 */
export interface MenuBarSubmenu<T> {
  readonly label: string;
  readonly submenu: readonly MenuBarEntry<T>[];
}

/** One row of a menu: a command, a rule, or a submenu. */
export type MenuBarEntry<T> = T | typeof MENU_SEPARATOR | MenuBarSubmenu<T>;

/** Whether a row opens a submenu rather than being a command. */
export function isMenuBarSubmenu<T>(entry: MenuBarEntry<T> | undefined): entry is MenuBarSubmenu<T> {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    Array.isArray((entry as { submenu?: unknown }).submenu) &&
    typeof (entry as { label?: unknown }).label === 'string'
  );
}

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
  /**
   * The submenus open from the menu, outermost first: the highlighted
   * entry in each, as `active` is in the menu, or -1 for one the
   * pointer opened with nothing highlighted yet. Each is opened from
   * the highlighted entry of the list before it. Absent or empty, none
   * is open; the keys act on the innermost list open.
   */
  readonly trail?: readonly number[];
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
      case 'F10':
        // The bar keeps the title it is on as it lets go, so coming back
        // with F10 or Alt lands where the last visit left off rather than
        // on the first menu every time.
        return { state: { focused, open: false, active: -1 }, dismiss: true };
      default: {
        // A bare letter opens the menu it names. With the bar focused
        // and nothing open there is nothing else a letter could mean,
        // and it is how every menu bar has worked for thirty years.
        const named = isPrintable(key) ? menus.findIndex(menu => menu.mnemonic === key.toLowerCase()) : -1;
        return named === -1 ? null : { state: opened(named, menus, context, 1) };
      }
    }
  }

  const levels = menuBarLevels(state, menus);
  const depth = levels.length - 1;
  const { entries, active } = levels[depth]!;
  /** This state with the innermost list's highlight moved to `index`. */
  const at = (index: number): MenuBarState => withActive({ ...state, focused }, depth, index);
  const highlighted = entries[active];
  /** The highlighted submenu opened, its first choosable entry highlighted. */
  const into = (submenu: MenuBarSubmenu<T>): MenuBarState => ({
    focused,
    open: true,
    active: depth === 0 ? active : state.active,
    trail: [...(state.trail ?? []).slice(0, depth), seek(submenu.submenu, 0, 1, context)]
  });
  /** The innermost submenu closed, back to the entry that opened it. */
  const back = (): MenuBarState => ({ ...state, focused, trail: (state.trail ?? []).slice(0, depth - 1) });
  switch (key) {
    case 'ArrowDown':
      return { state: at(seek(entries, active + 1, 1, context)) };
    case 'ArrowUp':
      return { state: at(seek(entries, active - 1, -1, context)) };
    case 'Home':
      return { state: at(seek(entries, 0, 1, context)) };
    case 'End':
      return { state: at(seek(entries, entries.length - 1, -1, context)) };
    /**
     * Left and right walk the *bar* while a menu is open, closing this
     * one and opening the next. This is the case a focus-trapped popup
     * cannot serve, and the reason this model exists. On a submenu's
     * entry, Right opens it instead, and in a submenu Left goes back.
     */
    case 'ArrowLeft':
      return { state: depth > 0 ? back() : opened(wrap(focused - 1, menus.length), menus, context, 1) };
    case 'ArrowRight':
      return {
        state:
          isMenuBarSubmenu(highlighted) && choosable(highlighted, context)
            ? into(highlighted)
            : opened(wrap(focused + 1, menus.length), menus, context, 1)
      };
    case 'Escape':
      // The first Escape closes the menu and leaves the bar focused,
      // the second gives the keyboard back. Closing straight through
      // loses the place of anybody who opened the wrong menu, which is
      // most people, most of the time. In a submenu it closes only that.
      return { state: depth > 0 ? back() : { focused, open: false, active: -1 } };
    case 'Enter':
    case ' ': {
      if (isMenuBarSubmenu(highlighted)) {
        return { state: choosable(highlighted, context) ? into(highlighted) : state };
      }
      if (highlighted === undefined || highlighted === MENU_SEPARATOR || !context.enabled(highlighted as T)) {
        return { state };
      }
      return { state: { focused, open: false, active: -1 }, choose: highlighted as T, dismiss: true };
    }
    case 'Tab':
      // Tab out of an open menu closes it rather than moving inside it.
      // A menu is not a set of tab stops.
      return { state: { focused, open: false, active: -1 }, dismiss: true };
    case 'F10':
      // F10 is the key that came in, and it goes straight out again
      // from wherever the bar is: one press, not Escape's two, because
      // somebody pressing it is leaving the menus rather than backing
      // out of one.
      return { state: { focused, open: false, active: -1 }, dismiss: true };
    default: {
      if (!isPrintable(key)) {
        return null;
      }
      const found = typeAhead(entries, active, key, context);
      return found === -1 ? { state } : { state: at(found) };
    }
  }
}

/**
 * The lists open in a menu, the menu's own first and then each submenu
 * open from it, with the highlight in each. A trail that no longer
 * leads through a submenu (the menus changed under it) stops where it
 * stops leading.
 */
export function menuBarLevels<T>(
  state: MenuBarState,
  menus: readonly MenuBarMenu<T>[]
): Array<{ readonly entries: readonly MenuBarEntry<T>[]; readonly active: number }> {
  const menu = menus[clampMenu(state.focused, menus)];
  const levels = [{ entries: menu?.entries ?? [], active: state.active }];
  for (const active of state.trail ?? []) {
    const outer = levels[levels.length - 1]!;
    const entry = outer.entries[outer.active];
    if (!isMenuBarSubmenu(entry)) {
      break;
    }
    levels.push({ entries: entry.submenu, active });
  }
  return levels;
}

/** A state with the highlight of the list `depth` deep (0 for the menu) moved. */
function withActive(state: MenuBarState, depth: number, active: number): MenuBarState {
  if (depth === 0) {
    return { focused: state.focused, open: state.open, active };
  }
  const trail = (state.trail ?? []).slice(0, depth);
  trail[depth - 1] = active;
  return { ...state, trail };
}

/** Whether an entry can be highlighted: a command that is enabled, or a submenu with one in it. */
function choosable<T>(entry: MenuBarEntry<T> | undefined, context: MenuBarContext<T>): boolean {
  if (entry === undefined || entry === MENU_SEPARATOR) {
    return false;
  }
  if (isMenuBarSubmenu(entry)) {
    return entry.submenu.some(inner => choosable(inner, context));
  }
  return context.enabled(entry as T);
}

/** What type-ahead matches an entry by. */
function labelOfEntry<T>(entry: T | MenuBarSubmenu<T>, context: MenuBarContext<T>): string {
  return isMenuBarSubmenu(entry) ? entry.label : context.labelOf(entry as T);
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
    if (choosable(entries[index], context)) {
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
    if (!choosable(entry, context)) {
      continue;
    }
    if (
      labelOfEntry(entry as T | MenuBarSubmenu<T>, context)
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
