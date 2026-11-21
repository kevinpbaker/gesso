import type { UiKeyModifiers } from './UiInputEvent';

/**
 * The key tests a shell makes on the main thread, before it can know
 * what the application did with a key.
 *
 * In a module of their own, holding nothing but the tests, because the
 * shell imports them and its bundle is budgeted: a test kept beside a
 * controller or a table of claims brought the module-level `Set`s and
 * tables with it, which a bundler keeps in case building them had an
 * effect. Everything here is a plain function over the key's name.
 */

/** The keys whose browser default scrolls the page. */
export const SCROLLING_KEYS: readonly string[] = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' '
];

/**
 * Whether the key scrolls the page. Ctrl, Alt or Meta held makes it a
 * shortcut instead (a word jump, a history step), which is the
 * browser's and is never claimed; Shift is a direction, as Shift+Space
 * is a page up.
 */
export function isScrollingKey(key: string, modifiers: UiKeyModifiers): boolean {
  return !modifiers.ctrl && !modifiers.alt && !modifiers.meta && SCROLLING_KEYS.includes(key);
}

/**
 * The keys that ask for a context menu: the Menu key, and Shift+F10 with
 * no other modifier, which is the same request on a keyboard without
 * one. A browser opens its own menu for either; a shell that cannot wait
 * for the application's answer cancels them by this test.
 */
export function isContextMenuKey(key: string, modifiers: UiKeyModifiers): boolean {
  return (
    key === 'ContextMenu' || (key === 'F10' && modifiers.shift && !modifiers.ctrl && !modifiers.alt && !modifiers.meta)
  );
}
