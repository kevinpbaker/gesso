import type { Note } from './NotesRepository';

/**
 * What a fresh notebook starts with.
 *
 * The dates are fixed rather than relative to now, so what the screen
 * says (and what the accessibility report records) is the same on every
 * machine and every day.
 *
 * It lives in the application layer, not beside the component that
 * happens to draw it: the render worker has no business holding an
 * app's initial data, and A7 replaces this with whatever OPFS has.
 */
export const SEED_NOTES: readonly Note[] = [
  {
    id: 'n1',
    title: 'Welcome to Gesso notes',
    body:
      'Click anywhere in this text and start typing.\n\n' +
      'Everything you would expect from a text field works: arrow keys, Shift to select, double-click for a word, ' +
      'Home and End, Ctrl/Cmd+A, undo and redo, copy, cut and paste.\n\n' +
      'Switch your keyboard to Japanese, Chinese or Korean and type: the IME candidate window opens at the caret, ' +
      'and the composition is underlined until you commit it. Dead keys (´ + e → é) go through the same path.\n\n' +
      'The whole UI, this text included, is drawn on a canvas by a render worker. The only DOM involved is a hidden ' +
      'textarea on the main thread that turns your keystrokes into text.',
    updatedAt: Date.UTC(2026, 7, 28, 9, 30)
  },
  {
    id: 'n2',
    title: 'Groceries',
    body: 'Oat milk\nCoffee beans\nSourdough\nApples — the crisp kind\nParmesan',
    updatedAt: Date.UTC(2026, 7, 27, 8, 5)
  },
  {
    id: 'n3',
    title: 'Talk outline',
    body: '1. Why a canvas UI\n2. One identity system\n3. Layout that follows the change\n4. Threads: shell, render, data\n5. What is next',
    updatedAt: Date.UTC(2026, 7, 24, 17, 45)
  }
];
