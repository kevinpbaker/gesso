import type { UiNode, UiFindController } from '@gesso/core';
import { internalState } from '../InternalState';

/**
 * The find session, as a store components can inject.
 *
 * `UiFindController` does the searching, but it lives in the runtime
 * and a component cannot reach it — components reach the world through
 * stores, as they do for the clipboard (`ShellService`) and overlays.
 * This is the reactive face of it: cells a find bar binds to, actions
 * it dispatches.
 *
 * The bar itself is the app's. The framework knows only that a session
 * is open, which is what makes Ctrl/Cmd+F and Escape mean find; what a
 * find bar looks like is a component, and belongs to F3.
 */
export class FindService {
  /** Whether a find session is running; a bar shows itself for this. */
  readonly open = internalState(false);
  /** The query the matches are for. */
  readonly query = internalState('');
  readonly matchCount = internalState(0);
  /** Which match is active, 1-based for display, or 0 when there is none. */
  readonly activeMatch = internalState(0);

  private controller: UiFindController | null = null;
  private detach: (() => void) | null = null;
  /**
   * The query field, kept here as well as on the controller: the app's
   * tree is built — and its refs fire — before the runtime installs the
   * controller, so the node has to wait for one.
   */
  private field: UiNode | null = null;

  /** Installed by the runtime; without one every action is a no-op. */
  setController(controller: UiFindController | null): void {
    this.detach?.();
    this.detach = null;
    this.controller = controller;
    if (controller === null) {
      return;
    }
    this.detach = controller.onChange(() => this.sync(controller));
    controller.setField(this.field);
    this.sync(controller);
  }

  /**
   * Registers the bar's query field, so opening a session puts the
   * caret in it. Pass it as the field's `ref`; null when it unmounts.
   */
  setField(node: UiNode | null): void {
    this.field = node;
    this.controller?.setField(node);
  }

  /** Starts a session. The app shows its bar; the field takes the caret. */
  openFind(): void {
    this.controller?.open();
  }

  /** Ends the session and drops the highlights. */
  close(): void {
    this.controller?.close();
  }

  /** Searches for `query`, activating its first match. */
  search(query: string, matchCase = false): void {
    this.controller?.search(query, { matchCase });
  }

  /** Moves to the next match, wrapping around. */
  next(): void {
    this.controller?.next();
  }

  /** Moves to the previous match, wrapping around. */
  previous(): void {
    this.controller?.previous();
  }

  /**
   * Re-runs the current query because the content changed under it.
   * An app that edits text while a find is open calls this.
   */
  refresh(): void {
    this.controller?.refresh();
  }

  private sync(controller: UiFindController): void {
    this.open.value = controller.isOpen;
    this.query.value = controller.query;
    this.matchCount.value = controller.matchCount;
    this.activeMatch.value = controller.activeIndex + 1;
  }
}
