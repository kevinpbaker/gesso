import type { UiNode } from '../graph/UiNode';
import { UiEventType, type UiInputEvent } from './UiInputEvent';

/**
 * Listener for framework input events.
 *
 * `event.currentTarget` is the node the listener is attached to;
 * `event.target` is the node the event was routed to.
 */
export type UiEventListener = (event: UiInputEvent) => void;

export interface UiEventListenerOptions {
  /**
   * Invoke the listener during the capture phase (root → target)
   * instead of the bubble phase (target → root).
   */
  capture?: boolean;
}

interface ListenerEntry {
  listener: UiEventListener;
  capture: boolean;
}

/**
 * Per-node listener storage keyed by event type.
 *
 * Entries are appended in registration order and invoked in that
 * order within a phase.
 */
type ListenerStore = Map<string, ListenerEntry[]>;

/**
 * Routes framework input events through the retained UI tree.
 *
 * This is the single dispatch point for raw platform input and for
 * synthesized gesture events, so there is exactly one event model.
 *
 * Phase order mirrors the DOM:
 *
 *   capture  — root → target (excluding the target)
 *   target   — the target's capture then bubble listeners
 *   bubble   — target's parent → root
 *
 *   stopPropagation()            ends the current phase and skips
 *                                every remaining phase.
 *   stopImmediatePropagation()   ends the current listener list and
 *                                every remaining phase.
 *   preventDefault()             is advisory: it only sets the flag
 *                                so consumers can cancel framework
 *                                default behaviour (click synthesis,
 *                                drag interpretation, scroll, tab).
 *
 * Focus, Blur, PointerEnter and PointerLeave are target-only: only
 * the target's listeners run, never its ancestors (they do not
 * bubble, mirroring DOM focus/blur and mouseenter/mouseleave).
 *
 * A throwing listener is reported and does not stop the rest of the
 * dispatch, matching how bindings isolate errors in UiGraph.
 */
/**
 * What to do with an exception a listener threw.
 *
 * `node` and `type` are what a report needs to be actionable, and the
 * error keeps its stack.
 */
export type UiListenerErrorReporter = (error: unknown, node: UiNode, type: string) => void;

export class UiInputDispatcher {
  private readonly stores = new WeakMap<UiNode, ListenerStore>();

  /**
   * Where a throwing listener is reported.
   *
   * The dispatch has to continue — one broken `onClick` must not stop
   * the event reaching the rest of the tree, or stop the other
   * listeners on the same node — so the exception is caught here and
   * nowhere else can see it. Left unset it goes to the console, which
   * inside a render worker is a console almost nobody opens; a runtime
   * sets this so the failure can reach the shell instead.
   */
  private errorReporter: UiListenerErrorReporter | null = null;

  onListenerError(reporter: UiListenerErrorReporter | null): void {
    this.errorReporter = reporter;
  }

  /**
   * Number of registered listeners per event type.
   *
   * A zero entry lets dispatch return before walking the tree when
   * nothing is listening for the event type at all.
   */
  private readonly typeCount = new Map<string, number>();

  addEventListener(
    node: UiNode,
    type: UiEventType,
    listener: UiEventListener,
    options: UiEventListenerOptions = {}
  ): void {
    const capture = options.capture ?? false;
    let store = this.stores.get(node);
    if (store === undefined) {
      store = new Map();
      this.stores.set(node, store);
    }
    let entries = store.get(type);
    if (entries === undefined) {
      entries = [];
      store.set(type, entries);
    }
    if (entries.some(entry => entry.listener === listener && entry.capture === capture)) {
      return;
    }
    entries.push({ listener, capture });
    this.typeCount.set(type, (this.typeCount.get(type) ?? 0) + 1);
  }

  removeEventListener(
    node: UiNode,
    type: UiEventType,
    listener: UiEventListener,
    options: UiEventListenerOptions = {}
  ): void {
    const store = this.stores.get(node);
    if (store === undefined) {
      return;
    }
    const entries = store.get(type);
    if (entries === undefined) {
      return;
    }
    const capture = options.capture ?? false;
    const index = entries.findIndex(entry => entry.listener === listener && entry.capture === capture);
    if (index === -1) {
      return;
    }
    entries.splice(index, 1);
    if (entries.length === 0) {
      store.delete(type);
      if (store.size === 0) {
        this.stores.delete(node);
      }
      const remaining = (this.typeCount.get(type) ?? 0) - 1;
      if (remaining <= 0) {
        this.typeCount.delete(type);
      } else {
        this.typeCount.set(type, remaining);
      }
    }
  }

  /**
   * Whether any node has a listener for the event type.
   *
   * Used as a cheap guard before dispatch so event streams with no
   * subscribers (e.g. pointer moves over a static tree) cost almost
   * nothing.
   */
  hasListeners(type: UiEventType): boolean {
    return (this.typeCount.get(type) ?? 0) > 0;
  }

  /**
   * Dispatches the event, routed to the supplied target.
   *
   * Sets `event.target` and walks `event.currentTarget` over the
   * dispatch path. Returns the event for chaining; the event is left
   * with `currentTarget === null` so a reused instance never leaks
   * its last dispatch position.
   */
  dispatch(event: UiInputEvent, target: UiNode): UiInputEvent {
    if (!this.hasListeners(event.type)) {
      return event;
    }
    event.target = target;
    event.currentTarget = null;

    const targetOnly =
      event.type === UiEventType.Focus ||
      event.type === UiEventType.Blur ||
      event.type === UiEventType.PointerEnter ||
      event.type === UiEventType.PointerLeave;

    const chain: UiNode[] = [];
    for (let node: UiNode | null = target; node !== null; node = node.parent) {
      chain.push(node);
    }

    if (targetOnly) {
      this.invokeListeners(target, event, true);
      this.invokeListeners(target, event, false);
    } else {
      // Capture: root down to the target's parent.
      for (let i = chain.length - 1; i >= 1 && !event.immediateStopped; i -= 1) {
        if (event.propagationStopped) {
          break;
        }
        this.invokeListeners(chain[i], event, true);
      }
      // Target: capture then bubble listeners on the target itself.
      if (!event.propagationStopped && !event.immediateStopped) {
        this.invokeListeners(target, event, true);
        this.invokeListeners(target, event, false);
      }
      // Bubble: the target's parent up to and including the root.
      for (let i = 1; i <= chain.length - 1 && !event.immediateStopped; i += 1) {
        if (event.propagationStopped) {
          break;
        }
        this.invokeListeners(chain[i], event, false);
      }
    }

    event.currentTarget = null;
    return event;
  }

  private invokeListeners(node: UiNode, event: UiInputEvent, capture: boolean): void {
    const entries = this.stores.get(node)?.get(event.type);
    if (entries === undefined) {
      return;
    }
    event.currentTarget = node;
    // Snapshot so listeners added or removed mid-dispatch do not
    // disturb the current phase.
    for (const entry of entries.slice()) {
      if (entry.capture !== capture || event.immediateStopped) {
        continue;
      }
      try {
        entry.listener(event);
      } catch (error) {
        if (this.errorReporter !== null) {
          this.errorReporter(error, node, event.type);
        } else {
          console.error(`UI event listener failed (${node.id}.${event.type})`, error);
        }
      }
    }
  }
}
