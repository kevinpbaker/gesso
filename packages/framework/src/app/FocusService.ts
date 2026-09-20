import type { UiNode, UiFocusManager } from 'gesso-core';
import { internalState } from '../InternalState';

/**
 * Keyboard focus, as a store components can inject.
 *
 * `UiFocusManager` lives in the runtime and a component cannot reach
 * it — components reach the world through stores, as they do for the
 * clipboard (`ShellService`), overlays (`OverlayService`) and find
 * (`FindService`). Without this a component cannot autofocus a field,
 * trap the keyboard in a dialog, or put the caret in the input that
 * failed validation.
 *
 * Nodes come from a `ref` prop. A tree's refs fire before the runtime
 * installs the manager, so an action taken during the first build is
 * queued and replayed once there is one; that is the same problem
 * `FindService` solves for its query field, and the reason `autoFocus`
 * in a dialog works on the frame it mounts.
 *
 * It must stay on the render thread: its actions take `UiNode`s, which
 * never cross a worker boundary.
 */
export class FocusService {
  /** The node holding focus, or null. A control binds its focus ring to this. */
  readonly focused = internalState<UiNode | null>(null);
  /** Whether focus is confined to a subtree by an open trap. */
  readonly trapped = internalState(false);

  private manager: UiFocusManager | null = null;
  private detach: (() => void) | null = null;
  /** Actions taken before the runtime installed a manager, in order. */
  private queued: ((manager: UiFocusManager) => void)[] = [];

  /** Installed by the runtime; without one every action is queued. */
  setManager(manager: UiFocusManager | null): void {
    this.detach?.();
    this.detach = null;
    this.manager = manager;
    if (manager === null) {
      this.queued = [];
      return;
    }
    const focusChange = manager.onFocusChange(node => {
      this.focused.value = node;
    });
    const scopeChange = manager.onScopeChange(() => {
      this.trapped.value = manager.trapped;
    });
    this.detach = () => {
      focusChange();
      scopeChange();
    };
    const pending = this.queued;
    this.queued = [];
    for (const action of pending) {
      action(manager);
    }
    this.sync(manager);
  }

  /** Gives the node keyboard focus. Non-focusable nodes are ignored. */
  focus(node: UiNode): void {
    this.run(manager => manager.focus(node));
  }

  /** Drops focus without moving it anywhere. */
  blur(): void {
    this.run(manager => manager.blur());
  }

  /** Moves focus to the next focusable node, wrapping around. */
  focusNext(): void {
    this.run(manager => manager.focusNext());
  }

  /** Moves focus to the previous focusable node, wrapping around. */
  focusPrevious(): void {
    this.run(manager => manager.focusPrevious());
  }

  /**
   * Confines focus to `scope` until `releaseTrap`, moving it inside if
   * it was elsewhere. Traps nest: a dialog opened over a dialog traps
   * again, and each release restores its own opener.
   */
  trap(scope: UiNode): void {
    this.run(manager => manager.pushScope(scope));
  }

  /**
   * Ends the innermost trap and returns focus to whatever held it when
   * the trap was taken — the button that opened the dialog.
   */
  releaseTrap(): void {
    this.run(manager => manager.popScope());
  }

  private run(action: (manager: UiFocusManager) => void): void {
    const manager = this.manager;
    if (manager === null) {
      this.queued.push(action);
      return;
    }
    action(manager);
    this.sync(manager);
  }

  private sync(manager: UiFocusManager): void {
    this.focused.value = manager.focusedNode;
    this.trapped.value = manager.trapped;
  }
}
