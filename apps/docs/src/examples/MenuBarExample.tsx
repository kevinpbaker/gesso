import { BehaviorSubject } from 'rxjs';

import { Column, Text } from 'gesso-core';
import { MENU_SEPARATOR, MenuBar, type MenuBarMenu } from 'gesso-components';
import { createComponent, type ComponentContext } from 'gesso-framework';

/**
 * A menu bar over a line of text that says what it last did.
 *
 * The commands are this example's own strings. A real application
 * names its own, and the bar never learns what any of them mean: it
 * reports the one that was chosen and the application decides.
 */
// #region menu-bar
type Command = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'bold' | 'italic' | 'wrap';

const LABELS: Record<Command, string> = {
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  bold: 'Bold',
  italic: 'Italic',
  wrap: 'Wrap text'
};

const ACCELERATORS: Partial<Record<Command, string>> = {
  undo: 'Ctrl Z',
  redo: 'Ctrl Y',
  cut: 'Ctrl X',
  copy: 'Ctrl C',
  paste: 'Ctrl V',
  bold: 'Ctrl B',
  italic: 'Ctrl I'
};

const MENUS: readonly MenuBarMenu<Command>[] = [
  { label: 'Edit', mnemonic: 'e', entries: ['undo', 'redo', MENU_SEPARATOR, 'cut', 'copy', 'paste'] },
  { label: 'Format', mnemonic: 'f', entries: ['bold', 'italic', MENU_SEPARATOR, 'wrap'] }
];

export function Bar(_inputs: Record<string, never>, _ctx: ComponentContext) {
  const last = new BehaviorSubject('Nothing chosen yet.');
  /**
   * Whether the dismissal that is about to arrive is the tail of a
   * choice.
   *
   * Choosing a command closes the bar, so `onChoose` is followed by
   * `onDismiss`. The bar is reporting two different things: "this is
   * what you picked", and "the keyboard is yours again". An
   * application that wires the second to something visible will see it
   * overwrite the first, which is what the first draft of this example
   * did.
   */
  let chosen = false;
  // Redo is disabled until something has been undone, which is the
  // ordinary reason a command is unavailable and the one worth showing:
  // the arrows step over it and type-ahead skips it.
  const undone = new BehaviorSubject(false);

  return Column(
    { gap: 12, padding: 12 },
    createComponent(MenuBar<Command>, {
      menus: MENUS,
      labelOf: (id: Command) => LABELS[id],
      acceleratorOf: (id: Command) => ACCELERATORS[id],
      enabled: (id: Command) => id !== 'redo' || undone.value,
      onChoose: (id: Command) => {
        if (id === 'undo') {
          undone.next(true);
        }
        chosen = true;
        last.next(`${LABELS[id]} chosen.`);
      },
      onDismiss: () => {
        if (chosen) {
          chosen = false;
          return;
        }
        last.next('The bar gave the keyboard back.');
      }
    }),
    Text({ text: last, color: 'textMuted', fontSize: 13, paddingLeft: 6 })
  );
}
// #endregion menu-bar
