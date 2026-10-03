import type { FocusOptions, UiNode, UiFocusManager } from 'gesso-core';
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
  /**
   * Whether the focus held is focus the keyboard can see: reached by Tab
   * or an arrow key, or by code with no pointer since, rather than by a
   * press. CSS's `:focus-visible`, for something other than a ring that
   * should answer the keyboard and not the click that happened to focus
   * the same control: a tooltip, say.
   */
  readonly focusVisible = internalState(false);

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
    // A change of modality alone — a key pressed on a control a click
    // focused — is reported as a focus change on the same node, so this
    // one listener keeps both cells right.
    const focusChange = manager.onFocusChange(node => {
      this.focused.value = node;
      this.focusVisible.value = manager.focusVisible;
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

  /**
   * Gives the node keyboard focus. Non-focusable nodes are ignored.
   *
   * The node is scrolled into view, unless `options.preventScroll` asks
   * for the page to stay where it is, as `element.focus({ preventScroll:
   * true })` does in a browser.
   */
  focus(node: UiNode, options?: FocusOptions): void {
    this.run(manager => manager.focus(node, 'program', options));
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
    this.focusVisible.value = manager.focusVisible;
    this.trapped.value = manager.trapped;
  }
}
