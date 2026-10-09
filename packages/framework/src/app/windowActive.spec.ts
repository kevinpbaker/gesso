import { afterEach, describe, expect, it } from 'vitest';

import { Box } from 'gesso-core';

import { observeWindowActive } from './windowActive';
import { ShellService } from './ShellService';
import { mountRuntime } from './RuntimeTestUtils';
import { createComponent } from '../createComponent';
import type { ComponentContext, Inputs } from '../FunctionComponent';

/** A window and a document whose focus and visibility a spec sets, each change firing the events a browser would. */
function fakeWindow(initial: { visible: boolean; focused: boolean }) {
  const state = { ...initial };
  const listeners = new Map<string, Set<() => void>>();
  const target = {
    addEventListener: (type: string, fn: () => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn)
  };
  const g = globalThis as { window?: unknown; document?: unknown };
  g.window = target;
  g.document = {
    ...target,
    get visibilityState() {
      return state.visible ? 'visible' : 'hidden';
    },
    hasFocus: () => state.focused
  };
  const fire = (type: string) => [...(listeners.get(type) ?? [])].forEach(fn => fn());
  return {
    focus(focused: boolean) {
      state.focused = focused;
      fire(focused ? 'focus' : 'blur');
    },
    show(visible: boolean) {
      state.visible = visible;
      fire('visibilitychange');
    },
    listeners: () => [...listeners.values()].reduce((n, set) => n + set.size, 0)
  };
}

afterEach(() => {
  const g = globalThis as { window?: unknown; document?: unknown };
  delete g.window;
  delete g.document;
});

describe('observeWindowActive', () => {
  it('is active while the window is shown and focused, and says so once per change', () => {
    const win = fakeWindow({ visible: true, focused: true });
    const seen: boolean[] = [];
    const stop = observeWindowActive(active => seen.push(active));
    win.focus(false);
    win.show(false);
    win.focus(true);
    win.show(true);
    expect(seen).toEqual([true, false, true]);
    stop();
    expect(win.listeners()).toBe(0);
  });

  it('reports inactive at once for a window that starts in the background', () => {
    fakeWindow({ visible: true, focused: false });
    const seen: boolean[] = [];
    observeWindowActive(active => seen.push(active))();
    expect(seen).toEqual([false]);
  });
});

describe('ShellService.windowActive', () => {
  it('starts active, and follows what the runtime applies', () => {
    const shell = new ShellService();
    const seen: boolean[] = [];
    shell.windowActive.subscribe(active => seen.push(active));
    shell.applyWindowActive(false);
    shell.applyWindowActive(false);
    shell.applyWindowActive(true);
    expect(seen).toEqual([true, false, true]);
  });

  it('reaches a component through the runtime', () => {
    let read: boolean | null = null;
    const Probe = (_inputs: Inputs<{}>, ctx: ComponentContext) => {
      ctx.inject(ShellService).windowActive.subscribe(active => (read = active));
      return Box({});
    };
    const mounted = mountRuntime(createComponent(Probe));
    mounted.runtime.setWindowActive(false);
    expect(read).toBe(false);
  });
});
