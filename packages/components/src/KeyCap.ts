import { map } from 'rxjs';

import type { ComponentContext, Inputs } from 'gesso-framework';
import { describeShortcut, parseShortcut, Row, shortcutKeyCaps, Text, type UiChild, type UiElement } from 'gesso-core';
import { layoutOf, modifiersOf, type ControlLayoutProps } from './internals';

/**
 * A keyboard shortcut drawn as the keys to press: `⇧⌘P` as three caps on
 * a Mac and `Ctrl` `Shift` `P` elsewhere, and a chord as its presses with
 * "then" between them.
 *
 * `keys` is written as the shortcut registry writes it (`'Mod+Shift+P'`,
 * `'?'`, `'g d'`), so a hint beside a button and the shortcut that runs
 * it are one string. The caps are `shortcutKeyCaps`', the same the
 * command palette and the shortcut sheet print. A screen reader hears it
 * in words, "Command Shift P", since a key cap's `⌘` is read out
 * inconsistently or not at all.
 */
export interface KeyCapProps extends ControlLayoutProps {
  /** The shortcut, as the registry writes it: `'Mod+K'`, `'?'`, `'g d'`. */
  keys: string;
  /** Smaller caps, for a hint in a menu row or a status bar. Read once. */
  compact?: boolean;
}

export function KeyCap(inputs: Inputs<KeyCapProps>, _ctx: ComponentContext): UiChild {
  const compact = inputs.compact.value === true;
  const keys = inputs.keys;
  return Row(
    {
      ...layoutOf(inputs),
      modifiers: modifiersOf(inputs),
      gap: compact ? 2 : 3,
      y: 'center',
      flexShrink: 0,
      role: 'group',
      label: keys.pipe(map(text => (text === '' ? '' : describeShortcut(parseShortcut(text)))))
    },
    keys.pipe(map(text => (text === '' ? [] : keyCaps(text, compact))))
  );
}

/** The caps for a shortcut, a press at a time with "then" between. Shared with `ShortcutSheet`. */
export function keyCaps(keys: string, compact = false): UiElement[] {
  const presses = shortcutKeyCaps(parseShortcut(keys));
  return presses.flatMap((caps, step) => [
    ...(step === 0
      ? []
      : [
          Text({
            key: `then ${step}`,
            text: 'then',
            color: 'textMuted',
            textStyle: 'bodySmall',
            selectable: false
          })
        ]),
    ...caps.map((cap, index) => keyCap(cap, `${step}:${index}`, compact))
  ]);
}

/** One key, drawn as a key. */
function keyCap(text: string, key: string, compact: boolean): UiElement {
  const size = compact ? 18 : 22;
  return Row(
    {
      key,
      minWidth: size,
      height: size,
      paddingX: compact ? 4 : 6,
      x: 'center',
      y: 'center',
      flexShrink: 0,
      backgroundColor: 'background',
      borderColor: 'border',
      borderWidth: 1,
      borderRadius: compact ? 4 : 5
    },
    Text({
      text,
      color: 'text',
      textStyle: 'bodySmall',
      textWrap: 'none',
      selectable: false,
      ...(compact ? { fontSize: 11 } : {})
    })
  );
}
