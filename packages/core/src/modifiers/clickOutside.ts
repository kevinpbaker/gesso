import type { UiNode } from '../graph/UiNode';
import { UiEventType, type UiInputEvent } from '../input/UiInputEvent';
import { defineModifier, type UiModifier } from './UiModifier';

export interface ClickOutsideOptions {
  /** Called when a press lands anywhere but inside the node. */
  readonly onOutside: (event: UiInputEvent) => void;
  /**
   * Nodes that count as inside even though they are not in the
   * subtree. The one that always needs this is the control that opened
   * the thing: without it, pressing the button that opened a popover
   * closes it and reopens it in one press.
   */
  readonly except?: () => readonly (UiNode | null | undefined)[];
  /**
   * Whether a wheel outside the node counts too. Default true: a page
   * scrolled out from under a popover leaves it hanging beside nothing.
   *
   * It is read at each event rather than at attach, so a caller may
   * flip it between renders.
   */
  readonly wheel?: boolean;
}

/**
 * Calls back when a press lands outside the node.
 *
 * The listener is at the root, in the capture phase, because the event
 * this cares about is the one that never arrives: a press somewhere
 * else is not observable from the node it missed. Capture also means
 * it is heard before the node that was pressed acts on it, so a
 * popover closes on the same press that activates whatever is beneath
 * it, rather than a frame later.
 *
 * It does not close anything itself, and it is not a backdrop. A
 * backdrop is an element that swallows the press (`OverlayEntry`'s
 * `dismissOnOutsidePress` is one); this hears the press and lets it
 * through, which is the behaviour a menu wants when the next thing the
 * person does is press a button on the page.
 */
const kind = defineModifier<ClickOutsideOptions>({
  name: 'clickOutside',
  attach(host, options) {
    let current = options;
    handlers.set(host, next => (current = next));
    const outside = (event: UiInputEvent): void => {
      const target = event.target;
      if (target === null || contains(host.node, target)) {
        return;
      }
      if (event.type === UiEventType.Wheel && current.wheel === false) {
        return;
      }
      for (const node of current.except?.() ?? []) {
        if (node !== null && node !== undefined && contains(node, target)) {
          return;
        }
      }
      current.onOutside(event);
    };
    host.onRoot(UiEventType.PointerDown, outside);
    host.onRoot(UiEventType.Wheel, outside);
  },
  update(host, options) {
    // The listeners close over the latest options rather than being
    // re-registered, so a handler that changes every render does not
    // cost a pair of root listeners each time.
    handlers.get(host)?.(options);
  }
});

const handlers = new WeakMap<object, (options: ClickOutsideOptions) => void>();

/** Calls back when a press lands outside the node. */
export function clickOutside(options: ClickOutsideOptions): UiModifier<ClickOutsideOptions> {
  return kind(options);
}

function contains(ancestor: UiNode, node: UiNode): boolean {
  for (let current: UiNode | null = node; current !== null; current = current.parent) {
    if (current === ancestor) {
      return true;
    }
  }
  return false;
}
