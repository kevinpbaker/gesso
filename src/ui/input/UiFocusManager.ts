import type { UiNode } from '../graph/UiNode';
import { UiEventType, UiFocusEvent } from './UiInputEvent';
import { isNodeFocusable } from './UiInteraction';
import type { UiInputDispatcher } from './UiInputDispatcher';

/**
 * One entry on the focus scope stack.
 *
 * `restore` is what held focus when the scope was pushed, so popping
 * can hand focus back to the control that opened the dialog. Scopes
 * nest: a confirmation dialog over a dialog pushes a second one, and
 * each pop restores its own opener.
 */
interface FocusScope {
  readonly root: UiNode;
  readonly restore: UiNode | null;
}

/**
 * Logical focus within the UI tree.
 *
 * At most one node holds focus at a time. Focus transitions are
 * target-only: the node losing focus receives Blur (with the new
 * node as `relatedNode`), then the node gaining focus receives Focus
 * (with the old node as `relatedNode`).
 *
 * Tab / Shift+Tab navigation walks the focusable nodes in document
 * (depth-first) order and wraps around. A node participates when
 * `isNodeFocusable` says so: focusable by type (Button), explicitly
 * opted in via `focusable: true`, and never when inert.
 *
 * Focus-on-press is applied through `focusOnPress`, which the pointer
 * pipeline calls after a successful pointerdown (skipped when the
 * down was defaultPrevented).
 *
 * **Scopes.** `pushScope(node)` confines focus to a subtree: traversal
 * collects only that subtree's focusables, so Tab wraps inside it, and
 * `focus()` refuses a node outside it — which is what makes a modal
 * dialog modal for the keyboard. `popScope()` restores focus to
 * whatever held it when the scope was pushed. Components reach both
 * through `FocusStore`, never directly.
 */
export class UiFocusManager {
  private root: UiNode;
  private focused: UiNode | null = null;
  private readonly listeners = new Set<(node: UiNode | null) => void>();
  private readonly scopeListeners = new Set<() => void>();
  private readonly scopes: FocusScope[] = [];

  constructor(
    root: UiNode,
    private readonly dispatcher: UiInputDispatcher
  ) {
    this.root = root;
  }

  /** The root used for focus-order traversal. Clears any active scope. */
  setRoot(root: UiNode): void {
    this.root = root;
    this.scopes.length = 0;
  }

  /** The node that currently holds logical focus, or null. */
  get focusedNode(): UiNode | null {
    return this.focused;
  }

  hasFocus(): boolean {
    return this.focused !== null;
  }

  /**
   * The subtree focus is currently confined to: the innermost scope,
   * or the whole tree when none is active.
   */
  get scopeRoot(): UiNode {
    return this.scopes.length === 0 ? this.root : this.scopes[this.scopes.length - 1].root;
  }

  /** Whether focus is confined to a subtree. */
  get trapped(): boolean {
    return this.scopes.length > 0;
  }

  /**
   * Moves focus to the node. Returns false when the node cannot be
   * focused (inert, non-focusable, outside the active scope); true
   * otherwise, including when the node already held focus (a no-op
   * that emits nothing).
   */
  focus(node: UiNode): boolean {
    if (!isNodeFocusable(node) || !this.withinScope(node)) {
      return false;
    }
    if (node === this.focused) {
      return true;
    }
    const previous = this.focused;
    this.focused = node;
    if (previous !== null) {
      this.dispatcher.dispatch(new UiFocusEvent(UiEventType.Blur, node), previous);
    }
    this.dispatcher.dispatch(new UiFocusEvent(UiEventType.Focus, previous), node);
    this.notify(node);
    return true;
  }

  /**
   * Called after focus moves or clears, with the new focused node. The
   * runtime uses it to scroll the focused node into view.
   */
  onFocusChange(listener: (node: UiNode | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Called after a scope is pushed or popped. */
  onScopeChange(listener: () => void): () => void {
    this.scopeListeners.add(listener);
    return () => {
      this.scopeListeners.delete(listener);
    };
  }

  private notify(node: UiNode | null): void {
    for (const listener of this.listeners) {
      listener(node);
    }
  }

  private notifyScope(): void {
    for (const listener of this.scopeListeners) {
      listener();
    }
  }

  /** Drops focus without moving it anywhere. */
  blur(): void {
    if (this.focused === null) {
      return;
    }
    const previous = this.focused;
    this.focused = null;
    this.dispatcher.dispatch(new UiFocusEvent(UiEventType.Blur, null), previous);
    this.notify(null);
  }

  /**
   * Focus-on-press hook: focuses the nearest focusable node at or above
   * the one that was pressed.
   *
   * The walk upward is what the DOM does, and what a container that is
   * one tab stop needs: pressing a tab hits the Text inside it, a table
   * cell hits a Box three levels below the table, and a component whose
   * arrows move a selection is keyboard-dead after a mouse press if the
   * press left focus where it was. Found in a browser, on `Tabs` —
   * clicking a tab selected it and the arrows then did nothing.
   *
   * Nothing focusable above the press leaves focus untouched, as before:
   * pressing the page background is not a request to blur.
   */
  focusOnPress(node: UiNode): void {
    for (let current: UiNode | null = node; current !== null; current = current.parent) {
      if (isNodeFocusable(current)) {
        this.focus(current);
        return;
      }
    }
  }

  /** Moves focus to the next focusable node, wrapping to the first. */
  focusNext(): boolean {
    return this.moveFocus(1);
  }

  /** Moves focus to the previous focusable node, wrapping to the last. */
  focusPrevious(): boolean {
    return this.moveFocus(-1);
  }

  /**
   * Confines focus to `root` until the matching `popScope`.
   *
   * Focus that is outside the new scope moves to its first focusable,
   * so the very next Tab stays inside; a scope with nothing focusable
   * in it drops focus rather than leaving it behind the dialog.
   */
  pushScope(root: UiNode): void {
    this.scopes.push({ root, restore: this.focused });
    this.settleScope();
    this.notifyScope();
  }

  /**
   * Moves focus into the innermost scope when it is outside it, and
   * drops it when the scope has nothing to focus.
   *
   * A scope is usually taken from a `ref`, which fires before the
   * node's children are reconciled — so at that moment a dialog is an
   * empty box and there is nothing in it to focus. The runtime calls
   * this again once the frame's tree is built, which is when a dialog
   * gets its caret. Idempotent: with focus already inside the scope,
   * or no scope at all, it does nothing.
   */
  settleScope(): void {
    if (this.scopes.length === 0 || (this.focused !== null && this.withinScope(this.focused))) {
      return;
    }
    if (!this.focusNext()) {
      this.blur();
    }
  }

  /**
   * Ends the innermost scope and hands focus back to whatever held it
   * when that scope was pushed, when that node is still in the tree
   * and still focusable. Otherwise focus is dropped rather than left
   * on a node the scope was hiding.
   */
  popScope(): void {
    const scope = this.scopes.pop();
    if (scope === undefined) {
      return;
    }
    const restore = scope.restore;
    if (restore !== null && this.isAttached(restore) && this.focus(restore)) {
      this.notifyScope();
      return;
    }
    if (this.focused !== null && this.isWithin(this.focused, scope.root)) {
      this.blur();
    }
    this.notifyScope();
  }

  /**
   * Reacts to a subtree leaving the graph.
   *
   * The graph reports the root of a removed subtree after detaching
   * every node in it, so the descendants' parent links are already
   * gone: the test is "is this node still attached", not "was it in
   * that subtree".
   *
   * A scope whose subtree has gone is a trap that ended, so it is
   * popped as though the component had released it and focus returns
   * to the opener — a dialog that unmounts hands the keyboard back
   * without having to sequence its own teardown. Focus lost with the
   * subtree is dropped without a Blur, since the node's listeners were
   * released with it.
   */
  handleNodeRemoved(_node: UiNode): void {
    const hadFocus = this.focused !== null;
    if (this.focused !== null && !this.isAttached(this.focused)) {
      this.focused = null;
    }
    while (this.scopes.length > 0 && !this.isAttached(this.scopeRoot)) {
      this.popScope();
    }
    if (hadFocus && this.focused === null) {
      this.notify(null);
    }
  }

  private moveFocus(delta: number): boolean {
    const focusables = this.collectFocusable();
    if (focusables.length === 0) {
      return false;
    }
    let index = this.focused === null ? -1 : focusables.indexOf(this.focused);
    if (index === -1) {
      // Nothing focused, or focus sits outside the active scope: move
      // to the first (next) or last (previous).
      index = delta > 0 ? focusables.length - 1 : 0;
    }
    const next = focusables[(index + delta + focusables.length) % focusables.length];
    return this.focus(next);
  }

  /** Focusable nodes in document order (parent before children). */
  private collectFocusable(): UiNode[] {
    const result: UiNode[] = [];
    const visit = (node: UiNode): void => {
      if (isNodeFocusable(node)) {
        result.push(node);
      }
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        visit(child);
      }
    };
    visit(this.scopeRoot);
    return result;
  }

  /** Whether the node may hold focus given the active scope, if any. */
  private withinScope(node: UiNode): boolean {
    return this.scopes.length === 0 || this.isWithin(node, this.scopeRoot);
  }

  /** Whether the node is still connected to the traversal root. */
  private isAttached(node: UiNode): boolean {
    return this.isWithin(node, this.root);
  }

  private isWithin(node: UiNode, ancestor: UiNode): boolean {
    for (let current: UiNode | null = node; current !== null; current = current.parent) {
      if (current === ancestor) {
        return true;
      }
    }
    return false;
  }
}
