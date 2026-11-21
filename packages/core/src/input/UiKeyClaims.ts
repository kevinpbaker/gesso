import type { UiNode } from '../graph/UiNode';
import { SCROLLING_KEYS } from './UiShellKeys';

/**
 * Which keys the application will use, said before they are pressed.
 *
 * A shell whose runtime is a worker message away cannot wait to hear
 * whether a key was used: the browser acts on its default first. For
 * most keys that does no harm, because the default is nothing. The keys
 * here are the exception. Each one scrolls the page around the canvas,
 * so with a menu open in an embedded application, Down moved the
 * highlight and scrolled the page under it.
 *
 * The runtime works out which of them it will use at the focus it has
 * (see `keysClaimedOnPath`, and the keyboard scroller's `wouldScroll`),
 * and hands the set to the shell, which cancels only those. A key the
 * application has no use for still scrolls the page, as it does in any
 * page a canvas is part of.
 */

const SCROLLING = new Set(SCROLLING_KEYS);

const claims = new WeakMap<object, readonly string[]>();

/**
 * Marks a key handler with the keys it uses, and returns it.
 *
 * `keymap` in `gesso-components` marks every handler it builds, so a
 * control whose keys are a table needs nothing more. A handler written
 * by hand, on a node with no widget role, marks itself with this, or
 * the shell cannot know its keys until after the browser has scrolled.
 */
export function claimKeys<T extends object>(handler: T, keys: Iterable<string>): T {
  claims.set(handler, Object.freeze([...keys]));
  return handler;
}

/** The keys a handler was marked with; none for an unmarked one. */
export function claimedKeysOf(handler: unknown): readonly string[] {
  return (
    (typeof handler === 'function' || (typeof handler === 'object' && handler !== null)
      ? claims.get(handler)
      : undefined) ?? NONE
  );
}

const NONE: readonly string[] = Object.freeze([]);
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const ENDS = ['Home', 'End'];
const PAGES = ['PageUp', 'PageDown'];

/**
 * The keys a widget role owns, as ARIA's authoring practices give them.
 *
 * Read from the role because most controls in the library handle keys
 * in a hand-written handler (a menu, a grid, a date grid) and every one
 * of them carries its role. A role here is a promise the control keeps
 * by its own keys, so it is a fair claim; a control that uses fewer
 * keeps a few from scrolling the page, which costs less than the page
 * scrolling under a control that uses them.
 */
const ROLE_KEYS: Readonly<Record<string, readonly string[]>> = {
  listbox: SCROLLING_KEYS,
  menu: SCROLLING_KEYS,
  tree: SCROLLING_KEYS,
  treegrid: SCROLLING_KEYS,
  grid: SCROLLING_KEYS,
  slider: [...ARROWS, ...ENDS, ...PAGES],
  scrollbar: [...ARROWS, ...ENDS, ...PAGES],
  spinbutton: ['ArrowUp', 'ArrowDown', ...ENDS, ...PAGES],
  radiogroup: ARROWS,
  tablist: [...ARROWS, ...ENDS],
  menubar: [...ARROWS, ...ENDS],
  toolbar: [...ARROWS, ...ENDS],
  combobox: ['ArrowUp', 'ArrowDown']
};

/**
 * The scrolling keys the nodes from `focused` up to the root will use:
 * the ones their key handlers are marked with, and the ones their roles
 * own. Up to the root, because a key bubbles: a button inside a toolbar
 * sends Left and Right to the toolbar. A focusable `separator` (a split
 * pane's divider) owns the arrows and the ends, as a window splitter
 * does; one that is only a rule owns nothing.
 */
export function keysClaimedOnPath(focused: UiNode | null, keyHandlerOf: (node: UiNode) => unknown): Set<string> {
  const claimed = new Set<string>();
  for (let node = focused; node !== null; node = node.parent) {
    for (const key of claimedKeysOf(keyHandlerOf(node))) {
      if (SCROLLING.has(key)) {
        claimed.add(key);
      }
    }
    const role = node.properties.get('role');
    const owned =
      typeof role !== 'string'
        ? undefined
        : role === 'separator'
          ? node.properties.get('focusable') === true
            ? [...ARROWS, ...ENDS]
            : undefined
          : ROLE_KEYS[role];
    for (const key of owned ?? NONE) {
      claimed.add(key);
    }
  }
  return claimed;
}
