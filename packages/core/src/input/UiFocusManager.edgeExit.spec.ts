import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { InputTestHarness } from './UiInputTestUtils';
import type { UiFocusManager } from './UiFocusManager';

/**
 * `edgeExit`, and the application that was one part of a page.
 *
 * Tab wraps inside the tree, which is right when the application is
 * the page. Embedded in a page with other controls around it, wrapping
 * is a keyboard trap: a person who tabbed into the canvas could never
 * tab out. With `edgeExit` set, a move past either end drops focus and
 * says which way it went, and the shell moves the page's focus on.
 */
function page(): { first: UiNode; middle: UiNode; last: UiNode; dialog: UiNode; focusManager: UiFocusManager } {
  const h = new InputTestHarness();
  const first = h.node('first', UiNodeType.Button, { width: 200, height: 40 });
  const middle = h.node('middle', UiNodeType.Button, { width: 200, height: 40 });
  const dialog = h.node('dialog', UiNodeType.Box, { width: 200, height: 40 });
  const last = h.node('last', UiNodeType.Button, { width: 200, height: 40 });
  h.add(dialog, last);
  h.add(h.root, first, middle, dialog);
  h.layoutTree();
  return { first, middle, last, dialog, focusManager: h.createFocusManager() };
}

describe('UiFocusManager.edgeExit', () => {
  it('wraps when it is not set, as an application that is the whole page wants', () => {
    const { first, last, focusManager } = page();
    focusManager.focus(last);

    expect(focusManager.focusNext()).toBe(true);
    expect(focusManager.focusedNode).toBe(first);
  });

  it('drops focus and reports forward when Tab passes the last stop', () => {
    const { last, focusManager } = page();
    const exits: number[] = [];
    focusManager.edgeExit = direction => exits.push(direction);
    focusManager.focus(last);

    expect(focusManager.focusNext()).toBe(false);
    expect(focusManager.focusedNode).toBeNull();
    expect(exits).toEqual([1]);
  });

  it('reports backward when Shift+Tab passes the first stop', () => {
    const { first, focusManager } = page();
    const exits: number[] = [];
    focusManager.edgeExit = direction => exits.push(direction);
    focusManager.focus(first);

    expect(focusManager.focusPrevious()).toBe(false);
    expect(exits).toEqual([-1]);
  });

  it('moves between stops inside the ends as before', () => {
    const { first, middle, focusManager } = page();
    const exits: number[] = [];
    focusManager.edgeExit = direction => exits.push(direction);
    focusManager.focus(first);

    expect(focusManager.focusNext()).toBe(true);
    expect(focusManager.focusedNode).toBe(middle);
    expect(exits).toEqual([]);
  });

  it('enters at an end when nothing has focus, which is how the keyboard comes back in', () => {
    const { first, last, focusManager } = page();
    focusManager.edgeExit = () => {
      throw new Error('entering is not leaving');
    };

    focusManager.focusNext();
    expect(focusManager.focusedNode).toBe(first);
    focusManager.blur();
    focusManager.focusPrevious();
    expect(focusManager.focusedNode).toBe(last);
  });

  it('still wraps inside a trap, as a dialog does on any page', () => {
    const { last, dialog, focusManager } = page();
    const exits: number[] = [];
    focusManager.edgeExit = direction => exits.push(direction);
    focusManager.pushScope(dialog);
    focusManager.focus(last);

    expect(focusManager.focusNext()).toBe(true);
    expect(focusManager.focusedNode).toBe(last);
    expect(exits).toEqual([]);
  });
});
