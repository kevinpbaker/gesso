import type { UiKeyModifiers } from '../input/UiInputEvent';
import type { EditUnit } from './EditableTextModel';

/** Which keyboard conventions apply: Command on a Mac, Control elsewhere. */
export type EditingPlatform = 'mac' | 'other';

/**
 * What a key press asks an editable to do.
 *
 * `move` with unit 'vertical' is up/down a visual line and needs the
 * paragraph layout, so the model cannot do it alone; the controller
 * resolves it through `TextGeometry`.
 */
export type EditCommand =
  | { kind: 'move'; unit: EditUnit | 'vertical'; direction: -1 | 1; extend: boolean }
  | { kind: 'delete'; unit: EditUnit; direction: -1 | 1 }
  | { kind: 'newline' }
  | { kind: 'selectAll' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'insert'; text: string };

/**
 * The platform the runtime is on, decided once. Available in a worker
 * too, since `navigator.userAgent` is; tests set it explicitly.
 */
export function detectEditingPlatform(): EditingPlatform {
  const agent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /Mac|iPhone|iPad|iPod/.test(agent) ? 'mac' : 'other';
}

/**
 * Maps a key press to an editing command, following the host's
 * conventions:
 *
 *   Mac    — Option steps by word, Command jumps to line and document
 *            ends, Command+Backspace deletes to the line start.
 *   Others — Control steps by word, Home/End and Control+Home/End are
 *            the line and document ends.
 *
 * Shift extends every move. Enter is a newline (the controller drops
 * it in a single-line field). A printable key becomes `insert` only
 * when `textFromKeys` is set: a host with an editing proxy delivers
 * text through `beforeinput` instead, where the IME and dead keys
 * have already been resolved.
 */
export function commandForKey(
  key: string,
  modifiers: UiKeyModifiers,
  platform: EditingPlatform,
  textFromKeys: boolean
): EditCommand | null {
  const mac = platform === 'mac';
  const primary = mac ? modifiers.meta : modifiers.ctrl;
  const word = mac ? modifiers.alt : modifiers.ctrl;
  const extend = modifiers.shift;

  switch (key) {
    case 'ArrowLeft':
    case 'ArrowRight': {
      const direction = key === 'ArrowLeft' ? -1 : 1;
      if (mac && modifiers.meta) {
        return { kind: 'move', unit: 'line', direction, extend };
      }
      return { kind: 'move', unit: word ? 'word' : 'grapheme', direction, extend };
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      const direction = key === 'ArrowUp' ? -1 : 1;
      if (mac && modifiers.meta) {
        return { kind: 'move', unit: 'document', direction, extend };
      }
      return { kind: 'move', unit: 'vertical', direction, extend };
    }
    case 'Home':
      return { kind: 'move', unit: modifiers.ctrl ? 'document' : 'line', direction: -1, extend };
    case 'End':
      return { kind: 'move', unit: modifiers.ctrl ? 'document' : 'line', direction: 1, extend };
    case 'Backspace':
      if (mac && modifiers.meta) {
        return { kind: 'delete', unit: 'line', direction: -1 };
      }
      return { kind: 'delete', unit: word ? 'word' : 'grapheme', direction: -1 };
    case 'Delete':
      return { kind: 'delete', unit: word ? 'word' : 'grapheme', direction: 1 };
    case 'Enter':
      return primary ? null : { kind: 'newline' };
  }

  if (primary && !modifiers.alt) {
    switch (key.toLowerCase()) {
      case 'a':
        return { kind: 'selectAll' };
      case 'z':
        return modifiers.shift ? { kind: 'redo' } : { kind: 'undo' };
      case 'y':
        return mac ? null : { kind: 'redo' };
    }
    return null;
  }

  if (textFromKeys && isPrintable(key) && !modifiers.ctrl && !modifiers.meta) {
    return { kind: 'insert', text: key };
  }
  return null;
}

/** A key value that is the character it types: one grapheme, not a name like 'Shift'. */
export function isPrintable(key: string): boolean {
  if (key.length === 1) {
    return true;
  }
  if (key.length === 2) {
    const code = key.charCodeAt(0);
    return code >= 0xd800 && code <= 0xdbff;
  }
  return false;
}
