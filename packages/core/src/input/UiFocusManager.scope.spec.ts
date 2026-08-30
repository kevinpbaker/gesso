import { describe, expect, it } from 'vitest';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { InputTestHarness } from './UiInputTestUtils';
import type { UiFocusManager } from './UiFocusManager';

/**
 * A page with two buttons and a dialog below it:
 *   open(0-40), other(40-80), dialog(80-160) [ field(80-120), close(120-160) ]
 *
 * Focusable in document order: open, other, field, close. The dialog
 * itself is a plain Box, so trapping in it confines focus to field and
 * close.
 */
function setup(): {
  h: InputTestHarness;
  open: UiNode;
  other: UiNode;
  dialog: UiNode;
  field: UiNode;
  close: UiNode;
  focusManager: UiFocusManager;
} {
  const h = new InputTestHarness();
  const open = h.node('open', UiNodeType.Button, { width: 200, height: 40 });
  const other = h.node('other', UiNodeType.Button, { width: 200, height: 40 });
  const dialog = h.node('dialog', UiNodeType.Box, { width: 200, height: 80 });
  const field = h.node('field', UiNodeType.Button, { width: 200, height: 40 });
  const close = h.node('close', UiNodeType.Button, { width: 200, height: 40 });
  h.add(dialog, field, close);
  h.add(h.root, open, other, dialog);
  h.layoutTree();
  return { h, open, other, dialog, field, close, focusManager: h.createFocusManager() };
}

describe('UiFocusManager scopes', () => {
  it('confines Tab to the scope and wraps inside it', () => {
    const { dialog, field, close, focusManager } = setup();
    focusManager.pushScope(dialog);

    expect(focusManager.focusedNode).toBe(field);
    focusManager.focusNext();
    expect(focusManager.focusedNode).toBe(close);
    focusManager.focusNext();
    expect(focusManager.focusedNode).toBe(field);
    focusManager.focusPrevious();
    expect(focusManager.focusedNode).toBe(close);
  });

  it('refuses focus outside the scope, by call and by press', () => {
    const { open, dialog, field, focusManager } = setup();
    focusManager.pushScope(dialog);

    expect(focusManager.focus(open)).toBe(false);
    expect(focusManager.focusedNode).toBe(field);

    focusManager.focusOnPress(open);
    expect(focusManager.focusedNode).toBe(field);
  });

  it('moves focus into the scope when it was outside', () => {
    const { open, dialog, field, focusManager } = setup();
    focusManager.focus(open);

    focusManager.pushScope(dialog);

    expect(focusManager.focusedNode).toBe(field);
    expect(focusManager.trapped).toBe(true);
    expect(focusManager.scopeRoot).toBe(dialog);
  });

  it('leaves focus where it is when it is already inside the scope', () => {
    const { dialog, close, focusManager } = setup();
    focusManager.focus(close);

    focusManager.pushScope(dialog);

    expect(focusManager.focusedNode).toBe(close);
  });

  it('drops focus when the scope has nothing focusable in it', () => {
    const { h, open, focusManager } = setup();
    const empty = h.node('empty', UiNodeType.Box, { width: 200, height: 40 });
    h.add(h.root, empty);
    focusManager.focus(open);

    focusManager.pushScope(empty);

    expect(focusManager.focusedNode).toBeNull();
  });

  it('restores focus to the opener when the scope is popped', () => {
    const { open, dialog, close, focusManager } = setup();
    focusManager.focus(open);
    focusManager.pushScope(dialog);
    focusManager.focus(close);

    focusManager.popScope();

    expect(focusManager.focusedNode).toBe(open);
    expect(focusManager.trapped).toBe(false);
    expect(focusManager.focus(open)).toBe(true);
  });

  it('nests: each pop restores its own opener', () => {
    const { h, open, dialog, field, close, focusManager } = setup();
    const confirm = h.node('confirm', UiNodeType.Box, { width: 200, height: 40 });
    const yes = h.node('yes', UiNodeType.Button, { width: 200, height: 40 });
    h.add(confirm, yes);
    h.add(h.root, confirm);

    focusManager.focus(open);
    focusManager.pushScope(dialog);
    expect(focusManager.focusedNode).toBe(field);
    focusManager.focus(close);
    focusManager.pushScope(confirm);
    expect(focusManager.focusedNode).toBe(yes);
    expect(focusManager.scopeRoot).toBe(confirm);

    focusManager.popScope();
    expect(focusManager.focusedNode).toBe(close);
    expect(focusManager.scopeRoot).toBe(dialog);

    focusManager.popScope();
    expect(focusManager.focusedNode).toBe(open);
    expect(focusManager.trapped).toBe(false);
  });

  it('ends the trap and restores the opener when the scope leaves the tree', () => {
    const { h, open, other, dialog, focusManager } = setup();
    focusManager.focus(open);
    focusManager.pushScope(dialog);

    h.layout.graph.removeNode(dialog);
    focusManager.handleNodeRemoved(dialog);

    expect(focusManager.focusedNode).toBe(open);
    expect(focusManager.trapped).toBe(false);
    // The whole tree is navigable again.
    focusManager.focusNext();
    expect(focusManager.focusedNode).toBe(other);
  });

  it('a component releasing after its own unmount is a no-op', () => {
    const { h, open, dialog, focusManager } = setup();
    focusManager.focus(open);
    focusManager.pushScope(dialog);
    h.layout.graph.removeNode(dialog);
    focusManager.handleNodeRemoved(dialog);

    focusManager.popScope();

    expect(focusManager.focusedNode).toBe(open);
  });

  it('drops focus when the scope leaves the tree and nothing opened it', () => {
    const { h, dialog, focusManager } = setup();
    focusManager.pushScope(dialog);

    h.layout.graph.removeNode(dialog);
    focusManager.handleNodeRemoved(dialog);

    expect(focusManager.focusedNode).toBeNull();
    expect(focusManager.trapped).toBe(false);
  });

  it('does not restore an opener that has itself left the tree', () => {
    const { h, open, dialog, focusManager } = setup();
    focusManager.focus(open);
    focusManager.pushScope(dialog);
    h.layout.graph.removeNode(open);
    focusManager.handleNodeRemoved(open);

    focusManager.popScope();

    expect(focusManager.focusedNode).toBeNull();
  });

  it('popping with no scope open is a no-op', () => {
    const { open, focusManager } = setup();
    focusManager.focus(open);
    focusManager.popScope();
    expect(focusManager.focusedNode).toBe(open);
  });
});
