import type { UiNode } from '../graph/UiNode';
import { UiEventType, UiFocusEvent } from './UiInputEvent';
import { isNodeFocusable } from './UiInteraction';
import type { UiInputDispatcher } from './UiInputDispatcher';

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
 */
export class UiFocusManager {
  private root: UiNode;
  private focused: UiNode | null = null;
  private readonly listeners = new Set<(node: UiNode | null) => void>();

  constructor(
    root: UiNode,
    private readonly dispatcher: UiInputDispatcher
  ) {
    this.root = root;
  }

  /** The root used for focus-order traversal. */
  setRoot(root: UiNode): void {
    this.root = root;
  }

  /** The node that currently holds logical focus, or null. */
  get focusedNode(): UiNode | null {
    return this.focused;
  }

  hasFocus(): boolean {
    return this.focused !== null;
  }

  /**
   * Moves focus to the node. Returns false when the node cannot be
   * focused (inert, non-focusable); true otherwise, including when
   * the node already held focus (a no-op that emits nothing).
   */
  focus(node: UiNode): boolean {
    if (!isNodeFocusable(node)) {
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

  private notify(node: UiNode | null): void {
    for (const listener of this.listeners) {
      listener(node);
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

  /** Focus-on-press hook: focuses the node when it is focusable. */
  focusOnPress(node: UiNode): void {
    if (isNodeFocusable(node)) {
      this.focus(node);
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

  private moveFocus(delta: number): boolean {
    const focusables = this.collectFocusable();
    if (focusables.length === 0) {
      return false;
    }
    let index = this.focused === null ? -1 : focusables.indexOf(this.focused);
    if (index === -1) {
      // Nothing focused: move to the first (next) or last (previous).
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
    visit(this.root);
    return result;
  }
}
