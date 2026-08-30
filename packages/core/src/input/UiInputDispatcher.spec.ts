import { describe, expect, it, vi } from 'vitest';
import { UiNodeType } from '../graph/UiNodeType';
import { UiNode } from '../graph/UiNode';
import { UiEventType, UiFocusEvent, UiInputEvent } from './UiInputEvent';
import { InputTestHarness } from './UiInputTestUtils';
import { type UiEventListener, UiInputDispatcher } from './UiInputDispatcher';

/**
 * Builds app -> a -> b -> c and lays it out so the nodes have real
 * geometry, matching how the input pipeline is exercised elsewhere.
 */
function setupChain(): { h: InputTestHarness; a: UiNode; b: UiNode; c: UiNode } {
  const h = new InputTestHarness();
  const a = h.node('a', UiNodeType.Row);
  const b = h.node('b', UiNodeType.Box);
  const c = h.node('c', UiNodeType.Box);
  h.add(h.root, a);
  h.add(a, b);
  h.add(b, c);
  h.layoutTree();
  return { h, a, b, c };
}

describe('UiInputDispatcher', () => {
  it('routes to the target with target/currentTarget set', () => {
    const { h, c } = setupChain();
    const seen: { target: UiNode | null; currentTarget: UiNode | null } = { target: null, currentTarget: null };
    const listener = vi.fn((event: UiInputEvent) => {
      seen.target = event.target;
      seen.currentTarget = event.currentTarget;
    });
    h.dispatcher.addEventListener(c, UiEventType.Click, listener);
    const event = new UiInputEvent(UiEventType.Click);
    h.dispatcher.dispatch(event, c);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(seen.target).toBe(c);
    expect(seen.currentTarget).toBe(c);
  });

  it('bubbles from the target up to the root', () => {
    const { h, a, b, c } = setupChain();
    const order: string[] = [];
    for (const node of [c, b, a]) {
      h.dispatcher.addEventListener(node, UiEventType.Click, event => {
        order.push(node.id);
        expect(event.currentTarget).toBe(node);
      });
    }
    h.dispatcher.dispatch(new UiInputEvent(UiEventType.Click), c);
    expect(order).toEqual(['c', 'b', 'a']);
  });

  it('runs capture listeners root-first, then the target phase', () => {
    const { h, a, c } = setupChain();
    const order: string[] = [];
    h.dispatcher.addEventListener(h.root, UiEventType.Click, () => order.push('root-capture'), {
      capture: true
    });
    h.dispatcher.addEventListener(a, UiEventType.Click, () => order.push('a-capture'), {
      capture: true
    });
    h.dispatcher.addEventListener(c, UiEventType.Click, () => order.push('c-bubble'));

    h.dispatcher.dispatch(new UiInputEvent(UiEventType.Click), c);
    expect(order).toEqual(['root-capture', 'a-capture', 'c-bubble']);
  });

  it('runs target capture listeners before target bubble listeners', () => {
    const { h, c } = setupChain();
    const order: string[] = [];
    h.dispatcher.addEventListener(c, UiEventType.Click, () => order.push('capture'), {
      capture: true
    });
    h.dispatcher.addEventListener(c, UiEventType.Click, () => order.push('bubble'));
    h.dispatcher.dispatch(new UiInputEvent(UiEventType.Click), c);
    expect(order).toEqual(['capture', 'bubble']);
  });

  it('invokes multiple listeners on a node in registration order', () => {
    const { h, c } = setupChain();
    const order: string[] = [];
    h.dispatcher.addEventListener(c, UiEventType.Click, () => order.push('first'));
    h.dispatcher.addEventListener(c, UiEventType.Click, () => order.push('second'));
    h.dispatcher.dispatch(new UiInputEvent(UiEventType.Click), c);
    expect(order).toEqual(['first', 'second']);
  });

  it('stopPropagation in the bubble phase skips ancestors', () => {
    const { h, a, b, c } = setupChain();
    const listener = vi.fn();
    h.dispatcher.addEventListener(c, UiEventType.Click, event => event.stopPropagation());
    h.dispatcher.addEventListener(b, UiEventType.Click, listener);
    h.dispatcher.addEventListener(a, UiEventType.Click, listener);
    h.dispatcher.dispatch(new UiInputEvent(UiEventType.Click), c);
    expect(listener).not.toHaveBeenCalled();
  });

  it('stopPropagation in the capture phase skips the target', () => {
    const { h, c } = setupChain();
    const listener = vi.fn();
    h.dispatcher.addEventListener(h.root, UiEventType.Click, event => event.stopPropagation(), {
      capture: true
    });
    h.dispatcher.addEventListener(c, UiEventType.Click, listener);
    h.dispatcher.dispatch(new UiInputEvent(UiEventType.Click), c);
    expect(listener).not.toHaveBeenCalled();
  });

  it('stopImmediatePropagation skips remaining listeners and travel', () => {
    const { h, a, c } = setupChain();
    const order: string[] = [];
    h.dispatcher.addEventListener(c, UiEventType.Click, event => {
      order.push('first');
      event.stopImmediatePropagation();
    });
    h.dispatcher.addEventListener(c, UiEventType.Click, () => order.push('second'));
    h.dispatcher.addEventListener(a, UiEventType.Click, () => order.push('ancestor'));
    h.dispatcher.dispatch(new UiInputEvent(UiEventType.Click), c);
    expect(order).toEqual(['first']);
  });

  it('preventDefault is advisory and does not stop travel', () => {
    const { h, a, c } = setupChain();
    const parent = vi.fn();
    h.dispatcher.addEventListener(c, UiEventType.Wheel, event => event.preventDefault());
    h.dispatcher.addEventListener(a, UiEventType.Wheel, parent);
    const event = h.dispatcher.dispatch(new UiInputEvent(UiEventType.Wheel), c);
    expect(event.defaultPrevented).toBe(true);
    expect(parent).toHaveBeenCalledTimes(1);
  });

  it('dispatches focus and blur to the target only', () => {
    const { h, a, c } = setupChain();
    const ancestor = vi.fn();
    const target = vi.fn();
    h.dispatcher.addEventListener(a, UiEventType.Focus, ancestor);
    h.dispatcher.addEventListener(c, UiEventType.Focus, target);
    const event = new UiFocusEvent(UiEventType.Focus, null);
    h.dispatcher.dispatch(event, c);
    expect(target).toHaveBeenCalledTimes(1);
    expect(ancestor).not.toHaveBeenCalled();
  });

  it('is a no-op when nothing listens for the event type', () => {
    const { h, c } = setupChain();
    h.dispatcher.addEventListener(c, UiEventType.Click, vi.fn());
    expect(h.dispatcher.hasListeners(UiEventType.Click)).toBe(true);
    expect(h.dispatcher.hasListeners(UiEventType.Wheel)).toBe(false);
    const event = new UiInputEvent(UiEventType.Wheel);
    expect(h.dispatcher.dispatch(event, c)).toBe(event);
  });

  it('isolates a throwing listener from the rest of the dispatch', () => {
    const { h, a, c } = setupChain();
    const boom = vi.spyOn(console, 'error').mockImplementation(() => {});
    const order: string[] = [];
    h.dispatcher.addEventListener(c, UiEventType.Click, () => {
      throw new Error('listener exploded');
    });
    h.dispatcher.addEventListener(c, UiEventType.Click, () => order.push('second'));
    h.dispatcher.addEventListener(a, UiEventType.Click, () => order.push('ancestor'));
    h.dispatcher.dispatch(new UiInputEvent(UiEventType.Click), c);
    expect(boom).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['second', 'ancestor']);
    boom.mockRestore();
  });

  it('removeEventListener stops future invocation and must match capture', () => {
    const { h, c } = setupChain();
    const listener = vi.fn();
    h.dispatcher.addEventListener(c, UiEventType.Click, listener);
    // Wrong phase: does not remove the bubble listener.
    h.dispatcher.removeEventListener(c, UiEventType.Click, listener, { capture: true });
    h.dispatcher.dispatch(new UiInputEvent(UiEventType.Click), c);
    expect(listener).toHaveBeenCalledTimes(1);

    h.dispatcher.removeEventListener(c, UiEventType.Click, listener);
    h.dispatcher.dispatch(new UiInputEvent(UiEventType.Click), c);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(h.dispatcher.hasListeners(UiEventType.Click)).toBe(false);
  });

  it('ignores duplicate registrations of the same listener and phase', () => {
    const { h, c } = setupChain();
    const listener = vi.fn();
    h.dispatcher.addEventListener(c, UiEventType.Click, listener);
    h.dispatcher.addEventListener(c, UiEventType.Click, listener);
    h.dispatcher.dispatch(new UiInputEvent(UiEventType.Click), c);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not invoke listeners added during the current dispatch', () => {
    const { h, c } = setupChain();
    const late: UiEventListener = vi.fn();
    h.dispatcher.addEventListener(c, UiEventType.Click, () => {
      h.dispatcher.addEventListener(c, UiEventType.Click, late);
    });
    h.dispatcher.dispatch(new UiInputEvent(UiEventType.Click), c);
    expect(late).not.toHaveBeenCalled();
  });

  it('leaves currentTarget null after dispatch completes', () => {
    const { h, c } = setupChain();
    h.dispatcher.addEventListener(c, UiEventType.Click, vi.fn());
    const event = h.dispatcher.dispatch(new UiInputEvent(UiEventType.Click), c);
    expect(event.currentTarget).toBeNull();
    expect(event.target).toBe(c);
  });

  it('works standalone without a layout tree', () => {
    const dispatcher = new UiInputDispatcher();
    const root = new UiNode('root', UiNodeType.Root);
    const leaf = new UiNode('leaf', UiNodeType.Box);
    root.firstChild = leaf;
    leaf.parent = root;
    const listener = vi.fn();
    dispatcher.addEventListener(root, UiEventType.Click, listener);
    dispatcher.dispatch(new UiInputEvent(UiEventType.Click), leaf);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
