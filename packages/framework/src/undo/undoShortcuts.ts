import { UiNodeType, type UiNode, type UiShortcutRegistry } from 'gesso-core';

import type { UndoStack } from './UndoStack';

export interface UndoShortcutOptions {
  /** The registry the `shortcuts` modifier feeds. */
  readonly registry: UiShortcutRegistry;
  readonly stack: UndoStack;
  /**
   * The node keyboard input is going to, usually
   * `() => ctx.inject(FocusService).focused.value`.
   *
   * Given one, Mod+Z is skipped while focus is inside something being
   * typed into, so a text field keeps its own undo. Leave it out only
   * in an application with no editable text: without it the
   * application's stack takes every Mod+Z, including the ones a person
   * pressed to unmake the last three letters they typed.
   */
  readonly focused?: () => UiNode | null;
  /** The heading a palette groups the two commands under. */
  readonly group?: string;
  /** Default `'Mod+Z'`. */
  readonly undoKeys?: string;
  /** Default `'Mod+Shift+Z'` and `'Mod+Y'`, the two spellings in use. */
  readonly redoKeys?: readonly string[];
}

/**
 * Registers undo and redo on the application's shortcut registry.
 *
 * One key path rather than two: the registry is the place a command's
 * keys are declared, so that a palette listing the
 * available commands and the handler that fires them ask the same
 * question. Undo is exactly the command that would otherwise grow a
 * second path, because every application reaches for a root
 * `onKeyDown` for it first.
 *
 *   const undo = ctx.inject(UndoStack);
 *   ctx.onUnmount(registerUndoShortcuts({ registry, stack: undo, focused: () => focus.focused.value }));
 *
 * The returned function unregisters both, so the pair's lifetime is
 * whatever registered them.
 *
 * `when` is what keeps the two honest: a stack with nothing on it
 * offers no undo, so the key falls through to whatever else wants it
 * and a palette does not list a command that would do nothing.
 */
export function registerUndoShortcuts(options: UndoShortcutOptions): () => void {
  const { registry, stack, focused, group } = options;
  const available = (): boolean => !typingInto(focused?.() ?? null);
  const undone = registry.register({
    keys: options.undoKeys ?? 'Mod+Z',
    label: 'Undo',
    ...(group === undefined ? {} : { group }),
    when: () => stack.canUndo.value && available(),
    run: () => void stack.undo()
  });
  const redone = (options.redoKeys ?? ['Mod+Shift+Z', 'Mod+Y']).map(keys =>
    registry.register({
      keys,
      label: 'Redo',
      ...(group === undefined ? {} : { group }),
      when: () => stack.canRedo.value && available(),
      run: () => void stack.redo()
    })
  );
  return () => {
    undone();
    for (const remove of redone) {
      remove();
    }
  };
}

/**
 * Whether keys reaching this node are being typed into something.
 *
 * The same walk `UiShortcutRegistry` makes for a shortcut with no
 * modifier at all, made here for a shortcut that has one. The
 * registry's own rule cannot cover this case: Mod+Z carries a
 * modifier, so by the registry's reckoning it is not a letter somebody
 * is trying to type, and it takes a key that
 * `EditableTextModel.undo` is waiting for. The keyboard controller
 * applies the editing keys **after** the event has been dispatched, so
 * a root shortcut sees Mod+Z first and would win every time.
 */
function typingInto(node: UiNode | null): boolean {
  for (let current: UiNode | null = node; current !== null; current = current.parent) {
    if (current.type === UiNodeType.EditableText) {
      return true;
    }
  }
  return false;
}
