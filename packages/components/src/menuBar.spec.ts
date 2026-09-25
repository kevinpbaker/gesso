import { describe, expect, it } from 'vitest';

import {
  MENU_BAR_CLOSED,
  MENU_SEPARATOR,
  menuBarStep,
  type MenuBarContext,
  type MenuBarMenu,
  type MenuBarState
} from './menuBar';

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

/** The command the highlight is on, or null when it is on nothing. */
function highlighted(state: MenuBarState, menus: readonly MenuBarMenu<Command>[] = MENUS): Command | null {
  const entry = menus[state.focused]!.entries[state.active];
  return entry === undefined || entry === MENU_SEPARATOR ? null : entry;
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
