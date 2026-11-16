import { describe, expect, it } from 'vitest';

import {
  isMenuBarSubmenu,
  MENU_BAR_CLOSED,
  MENU_SEPARATOR,
  menuBarLevels,
  menuBarStep,
  type MenuBarContext,
  type MenuBarMenu,
  type MenuBarState
} from './menuBarModel';

/**
 * The menu bar, as a table.
 *
 * No rendering: the point of pulling the traversal out of the
 * component is that it can be asserted here, where a wrong answer is
 * one line rather than a screenshot. Every rule below is one a real
 * menu bar has and a focus-trapped popup cannot have, which is why
 * this is a peer of `Menu` and not a mode on it.
 *
 * The menus are this file's own rather than a component's defaults, so
 * that the model is checked against the shape it promises and not
 * against one application's accidents.
 */
type Command = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'bold' | 'italic' | 'sortAscending' | 'freeze';

const LABELS: Record<Command, string> = {
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  bold: 'Bold',
  italic: 'Italic',
  sortAscending: 'Sort ascending',
  freeze: 'Freeze'
};

const MENUS: readonly MenuBarMenu<Command>[] = [
  {
    label: 'Edit',
    mnemonic: 'e',
    entries: ['undo', 'redo', MENU_SEPARATOR, 'cut', 'copy', 'paste']
  },
  { label: 'Format', mnemonic: 'o', entries: ['bold', 'italic'] },
  { label: 'Data', mnemonic: 'd', entries: ['sortAscending', MENU_SEPARATOR, 'freeze'] }
];

const everything: MenuBarContext<Command> = {
  enabled: () => true,
  labelOf: id => LABELS[id]
};

function without(...disabled: Command[]): MenuBarContext<Command> {
  return { ...everything, enabled: id => !disabled.includes(id) };
}

/** Press a run of keys, from a starting state. */
function press(from: MenuBarState, keys: readonly string[], context = everything, menus = MENUS) {
  let state = from;
  let choose: Command | undefined;
  let dismissed = false;
  for (const key of keys) {
    const step = menuBarStep(state, key, menus, context);
    if (step === null) {
      continue;
    }
    state = step.state;
    choose = step.choose ?? choose;
    dismissed = step.dismiss === true || dismissed;
  }
  return { state, choose, dismissed };
}

/**
 * The command the highlight is on, in the innermost list open, or the
 * label of the submenu it is on, or null when it is on nothing.
 */
function highlighted(state: MenuBarState, menus: readonly MenuBarMenu<Command>[] = MENUS): string | null {
  const levels = menuBarLevels(state, menus);
  const { entries, active } = levels[levels.length - 1]!;
  const entry = entries[active];
  if (entry === undefined || entry === MENU_SEPARATOR) {
    return null;
  }
  return isMenuBarSubmenu(entry) ? entry.label : entry;
}

describe('the bar with nothing open', () => {
  it('walks the menus with the arrows, and wraps', () => {
    expect(press(MENU_BAR_CLOSED, ['ArrowRight']).state.focused).toBe(1);
    expect(press(MENU_BAR_CLOSED, ['ArrowRight', 'ArrowRight']).state.focused).toBe(2);
    const toTheEnd = Array.from({ length: MENUS.length }, () => 'ArrowRight');
    expect(press(MENU_BAR_CLOSED, toTheEnd).state.focused).toBe(0);
    expect(press(MENU_BAR_CLOSED, ['ArrowLeft']).state.focused).toBe(MENUS.length - 1);
  });

  it('jumps to the ends with Home and End', () => {
    expect(press(MENU_BAR_CLOSED, ['End']).state.focused).toBe(MENUS.length - 1);
    expect(press(MENU_BAR_CLOSED, ['End', 'Home']).state.focused).toBe(0);
  });

  it('opens the focused menu downwards on Down, Enter and Space', () => {
    for (const key of ['ArrowDown', 'Enter', ' ']) {
      const { state } = press(MENU_BAR_CLOSED, [key]);
      expect(state.open).toBe(true);
      expect(highlighted(state)).toBe('undo');
    }
  });

  it('opens it from the bottom on Up, which is how a bar reaches a long menu', () => {
    const { state } = press(MENU_BAR_CLOSED, ['ArrowUp']);
    expect(highlighted(state)).toBe('paste');
  });

  it('opens the menu a letter names', () => {
    expect(press(MENU_BAR_CLOSED, ['d']).state).toMatchObject({ focused: 2, open: true });
    // Upper case is the same letter: Shift is how you type one.
    expect(press(MENU_BAR_CLOSED, ['O']).state).toMatchObject({ focused: 1, open: true });
  });

  it('lets a letter that names nothing through', () => {
    expect(menuBarStep(MENU_BAR_CLOSED, 'z', MENUS, everything)).toBeNull();
  });

  it('gives the keyboard back on Escape', () => {
    expect(press(MENU_BAR_CLOSED, ['Escape']).dismissed).toBe(true);
  });

  it('lets Tab through, so the bar can be left', () => {
    // The rule that keeps this from being a keyboard trap: a bar that
    // claimed every key would be one you cannot get out of.
    expect(menuBarStep(MENU_BAR_CLOSED, 'Tab', MENUS, everything)).toBeNull();
  });
});

describe('the bar with a menu open', () => {
  const open = press(MENU_BAR_CLOSED, ['ArrowDown']).state;

  it('steps over a separator rather than highlighting it', () => {
    // Undo, Redo, then the rule, then Cut.
    expect(highlighted(press(open, ['ArrowDown']).state)).toBe('redo');
    expect(highlighted(press(open, ['ArrowDown', 'ArrowDown']).state)).toBe('cut');
  });

  it('steps over a disabled entry', () => {
    const context = without('redo');
    expect(highlighted(press(open, ['ArrowDown'], context).state)).toBe('cut');
  });

  it('wraps at both ends', () => {
    expect(highlighted(press(open, ['ArrowUp']).state)).toBe('paste');
    // Five choosable entries past the separator, so four presses reach
    // the last and the fifth comes round to the first.
    const toTheBottom = Array.from({ length: 4 }, () => 'ArrowDown');
    expect(highlighted(press(open, toTheBottom).state)).toBe('paste');
    expect(highlighted(press(open, [...toTheBottom, 'ArrowDown']).state)).toBe('undo');
  });

  it('walks the bar with left and right, which is the whole reason this exists', () => {
    // A focus-trapped popup cannot do this: with the keyboard inside
    // the panel, ArrowLeft has nowhere to go.
    const next = press(open, ['ArrowRight']).state;
    expect(next).toMatchObject({ focused: 1, open: true });
    expect(highlighted(next)).toBe('bold');

    const back = press(open, ['ArrowLeft']).state;
    expect(back).toMatchObject({ focused: MENUS.length - 1, open: true });
    expect(highlighted(back)).toBe('sortAscending');
  });

  it('closes to the bar on the first Escape and gives up the keyboard on the second', () => {
    const closed = press(open, ['Escape']);
    expect(closed.state).toMatchObject({ open: false, focused: 0 });
    expect(closed.dismissed).toBeFalsy();

    expect(press(closed.state, ['Escape']).dismissed).toBe(true);
  });

  it('chooses with Enter and Space, and hands the keyboard back', () => {
    for (const key of ['Enter', ' ']) {
      const result = press(open, [key]);
      expect(result.choose).toBe('undo');
      expect(result.dismissed).toBe(true);
      expect(result.state.open).toBe(false);
    }
  });

  it('chooses nothing when the highlight is on nothing choosable', () => {
    const nothingEnabled: MenuBarContext<Command> = { ...everything, enabled: () => false };
    const result = press(MENU_BAR_CLOSED, ['ArrowDown', 'Enter'], nothingEnabled);
    expect(result.choose).toBeUndefined();
    expect(result.state.open).toBe(true);
  });

  it('closes on Tab rather than moving inside, because a menu is not a set of tab stops', () => {
    const result = press(open, ['Tab']);
    expect(result.state.open).toBe(false);
    expect(result.dismissed).toBe(true);
  });

  describe('type-ahead', () => {
    it('jumps to the entry a letter starts', () => {
      expect(highlighted(press(open, ['c']).state)).toBe('cut');
      expect(highlighted(press(open, ['p']).state)).toBe('paste');
    });

    it('walks the entries sharing a letter when it is pressed again', () => {
      // Cut, then Copy, then round to Cut: searched from after the
      // highlight, so the same letter does not sit on the first match.
      const first = press(open, ['c']).state;
      expect(highlighted(first)).toBe('cut');
      const second = press(first, ['c']).state;
      expect(highlighted(second)).toBe('copy');
      expect(highlighted(press(second, ['c']).state)).toBe('cut');
    });

    it('skips a disabled entry', () => {
      expect(highlighted(press(open, ['c'], without('cut')).state)).toBe('copy');
    });

    it('leaves the highlight alone when nothing matches', () => {
      expect(highlighted(press(open, ['z']).state)).toBe('undo');
    });
  });
});

describe('the edges', () => {
  it('claims nothing at all when there are no menus', () => {
    expect(menuBarStep(MENU_BAR_CLOSED, 'ArrowRight', [], everything)).toBeNull();
  });

  it('survives a focused index past the end, which a shrinking bar leaves behind', () => {
    const stale: MenuBarState = { focused: 99, open: false, active: -1 };
    expect(press(stale, ['ArrowRight']).state.focused).toBe(0);
  });

  it('highlights nothing in a menu where nothing can be chosen', () => {
    const nothingEnabled: MenuBarContext<Command> = { ...everything, enabled: () => false };
    expect(press(MENU_BAR_CLOSED, ['ArrowDown'], nothingEnabled).state.active).toBe(-1);
  });

  it('opens a menu with no mnemonic only by arrow, never by letter', () => {
    const anonymous: readonly MenuBarMenu<Command>[] = [{ label: 'View', entries: ['bold'] }];
    expect(menuBarStep(MENU_BAR_CLOSED, 'v', anonymous, everything)).toBeNull();
    expect(menuBarStep(MENU_BAR_CLOSED, 'ArrowDown', anonymous, everything)?.state.open).toBe(true);
  });
});

describe('leaving and coming back', () => {
  it('gives the keyboard back on F10, open or closed, as a second F10 does on Windows', () => {
    const closed = press(MENU_BAR_CLOSED, ['ArrowRight', 'F10']);
    expect(closed.dismissed).toBe(true);
    expect(closed.state).toMatchObject({ focused: 1, open: false });

    const open = press(MENU_BAR_CLOSED, ['ArrowRight', 'ArrowDown', 'F10']);
    expect(open.dismissed).toBe(true);
    expect(open.state).toMatchObject({ focused: 1, open: false, active: -1 });
  });

  it('remembers the title it was left on, so F10 comes back to it', () => {
    // Escape and Tab used to reset the bar to its first title, so the
    // way back in always landed on File whatever had been in use.
    expect(press(MENU_BAR_CLOSED, ['ArrowRight', 'ArrowRight', 'Escape']).state.focused).toBe(2);
    expect(press(MENU_BAR_CLOSED, ['ArrowRight', 'ArrowDown', 'Tab']).state).toMatchObject({
      focused: 1,
      open: false
    });
  });
});

/**
 * A submenu in a bar's menu. Found in Gesso Cut, whose View menu is long
 * and flat where it wants View → Precision ▸ and View → Appearance ▸.
 */
describe('a submenu', () => {
  const NESTED: readonly MenuBarMenu<Command>[] = [
    {
      label: 'Edit',
      mnemonic: 'e',
      entries: ['undo', { label: 'Format', submenu: ['bold', MENU_SEPARATOR, 'italic'] }, 'paste']
    },
    { label: 'Data', mnemonic: 'd', entries: ['sortAscending', 'freeze'] }
  ];
  const run = (keys: readonly string[], context = everything) => press(MENU_BAR_CLOSED, keys, context, NESTED);
  const open = (keys: readonly string[], context = everything) => {
    const { state } = run(keys, context);
    return { ...state, at: highlighted(state, NESTED), depth: menuBarLevels(state, NESTED).length - 1 };
  };

  it('is walked past like a command, and opened by Right, Enter or Space on its first command', () => {
    expect(open(['ArrowDown', 'ArrowDown'])).toMatchObject({ at: 'Format', depth: 0 });
    for (const key of ['ArrowRight', 'Enter', ' ']) {
      expect(open(['ArrowDown', 'ArrowDown', key])).toMatchObject({ at: 'bold', depth: 1, focused: 0 });
    }
  });

  it('walks its own commands with the arrows, wrapping, past a rule', () => {
    expect(open(['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowDown'])).toMatchObject({ at: 'italic', depth: 1 });
    expect(open(['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowDown'])).toMatchObject({ at: 'bold' });
    expect(open(['ArrowDown', 'ArrowDown', 'ArrowRight', 'End'])).toMatchObject({ at: 'italic' });
  });

  it('goes back to its entry with Left or Escape, leaving the menu open', () => {
    for (const key of ['ArrowLeft', 'Escape']) {
      expect(open(['ArrowDown', 'ArrowDown', 'ArrowRight', key])).toMatchObject({
        open: true,
        focused: 0,
        at: 'Format',
        depth: 0
      });
    }
  });

  it('chooses one of its commands, and closes everything', () => {
    const { state, choose, dismissed } = run(['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'Enter']);
    expect(choose).toBe('italic');
    expect(dismissed).toBe(true);
    expect(state).toEqual({ focused: 0, open: false, active: -1 });
  });

  it('lets Right on one of its commands walk on along the bar', () => {
    expect(open(['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight'])).toMatchObject({
      focused: 1,
      at: 'sortAscending',
      depth: 0
    });
  });

  it('is found by its label with type-ahead, and its commands by theirs inside it', () => {
    expect(open(['ArrowDown', 'f'])).toMatchObject({ at: 'Format', depth: 0 });
    expect(open(['ArrowDown', 'f', 'ArrowRight', 'i'])).toMatchObject({ at: 'italic', depth: 1 });
  });

  it('is passed by, and does not open, when nothing in it can be chosen', () => {
    const none = without('bold', 'italic');
    expect(open(['ArrowDown', 'ArrowDown'], none)).toMatchObject({ at: 'paste', depth: 0 });
    expect(open(['ArrowDown', 'ArrowDown', 'ArrowUp'], none)).toMatchObject({ at: 'undo', depth: 0 });
  });

  it('closes with its menu on Tab or F10', () => {
    for (const key of ['Tab', 'F10']) {
      const { state, dismissed } = run(['ArrowDown', 'ArrowDown', 'ArrowRight', key]);
      expect(state).toEqual({ focused: 0, open: false, active: -1 });
      expect(dismissed).toBe(true);
    }
  });
});
