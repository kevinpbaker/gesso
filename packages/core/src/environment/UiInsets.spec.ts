import { describe, expect, it, vi } from 'vitest';

import { UiInsetRegistry, insetsEqual, noInsets, observeViewportInsets } from './UiInsets';

/**
 * The inset registry and the shell-side reader behind it (roadmap X7).
 *
 * The registry is where a floating bar and a soft keyboard meet, and
 * the rule that matters is that they compose by maximum: a keyboard
 * that pushes a bar up covers the bar, so adding the two would clear a
 * strip nothing is occupying.
 */
describe('UiInsetRegistry', () => {
  it('starts empty', () => {
    expect(new UiInsetRegistry().current).toEqual(noInsets);
  });

  it('takes the largest contribution on each edge, not their sum', () => {
    const registry = new UiInsetRegistry();
    registry.publish({ bottom: 88 });
    registry.publish({ bottom: 320, top: 44 });
    expect(registry.current).toEqual({ top: 44, right: 0, bottom: 320, left: 0 });
  });

  it('follows a contributor that changes what it takes', () => {
    const registry = new UiInsetRegistry();
    const bar = registry.publish({ bottom: 88 });
    bar({ bottom: 120 });
    expect(registry.current.bottom).toBe(120);
  });

  it('gives the room back when a contributor retracts', () => {
    const registry = new UiInsetRegistry();
    registry.publish({ bottom: 40 });
    const bar = registry.publish({ bottom: 88 });
    bar();
    expect(registry.current.bottom).toBe(40);
  });

  it('reports the current value first and then only distinct ones', () => {
    const registry = new UiInsetRegistry();
    const bar = registry.publish({ bottom: 88 });
    const seen: number[] = [];
    const subscription = registry.changes.subscribe(insets => seen.push(insets.bottom));
    bar({ bottom: 88 });
    bar({ bottom: 100 });
    subscription.unsubscribe();
    expect(seen).toEqual([88, 100]);
  });
});

describe('observeViewportInsets', () => {
  it('reports zeroes once where there is no visual viewport', () => {
    const onChange = vi.fn();
    const stop = observeViewportInsets(onChange);
    stop();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(noInsets);
  });

  it('reports what a soft keyboard covers, and stops when told to', () => {
    const listeners = new Map<string, () => void>();
    const viewport = {
      height: 800,
      offsetTop: 0,
      addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type)
    };
    const scope = globalThis as Record<string, unknown>;
    scope.visualViewport = viewport;
    scope.innerHeight = 800;
    try {
      const seen: number[] = [];
      const stop = observeViewportInsets(insets => seen.push(insets.bottom));
      expect(seen).toEqual([0]);

      // The keyboard opens: the layout viewport is unchanged and the
      // visible part of it is 320 shorter.
      viewport.height = 480;
      listeners.get('resize')!();
      expect(seen).toEqual([0, 320]);

      // A frame that changes nothing reports nothing.
      listeners.get('resize')!();
      expect(seen).toEqual([0, 320]);

      stop();
      expect(listeners.size).toBe(0);
    } finally {
      delete scope.visualViewport;
      delete scope.innerHeight;
    }
  });
});

describe('insetsEqual', () => {
  it('compares all four edges', () => {
    expect(insetsEqual(noInsets, { top: 0, right: 0, bottom: 0, left: 0 })).toBe(true);
    expect(insetsEqual(noInsets, { top: 0, right: 0, bottom: 1, left: 0 })).toBe(false);
  });
});
