import { afterEach, describe, expect, it } from 'vitest';

import { Box, type UiContrast } from 'gesso-core';

import { observeContrast } from './contrast';
import { ShellService } from './ShellService';
import { mountRuntime } from './RuntimeTestUtils';
import { createComponent } from '../createComponent';
import type { ComponentContext, Inputs } from '../FunctionComponent';

/** One `MediaQueryList` per query, each of which a spec can flip on its own. */
function fakePlatform(initial: Record<string, boolean>) {
  const lists = new Map<string, { matches: boolean; listeners: Set<(event: { matches: boolean }) => void> }>();
  (globalThis as { matchMedia?: unknown }).matchMedia = (query: string) => {
    let list = lists.get(query);
    if (list === undefined) {
      list = { matches: initial[query] ?? false, listeners: new Set() };
      lists.set(query, list);
    }
    const entry = list;
    return {
      get matches() {
        return entry.matches;
      },
      addEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => entry.listeners.add(fn),
      removeEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => entry.listeners.delete(fn)
    } as unknown as MediaQueryList;
  };
  return {
    set(query: string, matches: boolean) {
      const list = lists.get(query)!;
      list.matches = matches;
      for (const listener of list.listeners) listener({ matches });
    },
    listeners: () => [...lists.values()].reduce((sum, list) => sum + list.listeners.size, 0)
  };
}

afterEach(() => {
  delete (globalThis as { matchMedia?: unknown }).matchMedia;
});

describe('observeContrast', () => {
  it('is high while either more contrast or forced colours is asked for, and says so once per change', () => {
    const platform = fakePlatform({ '(prefers-contrast: more)': false, '(forced-colors: active)': false });
    const seen: UiContrast[] = [];
    const stop = observeContrast(contrast => seen.push(contrast));
    platform.set('(prefers-contrast: more)', true);
    platform.set('(forced-colors: active)', true);
    platform.set('(prefers-contrast: more)', false);
    platform.set('(forced-colors: active)', false);
    expect(seen).toEqual(['standard', 'high', 'standard']);
    stop();
    expect(platform.listeners()).toBe(0);
  });

  it('reports high at once for a person who already has it on', () => {
    fakePlatform({ '(forced-colors: active)': true });
    const seen: UiContrast[] = [];
    observeContrast(contrast => seen.push(contrast))();
    expect(seen).toEqual(['high']);
  });
});

describe('ShellService.contrast', () => {
  it('starts standard, and follows what the runtime applies', () => {
    const shell = new ShellService();
    const seen: UiContrast[] = [];
    shell.contrast.subscribe(contrast => seen.push(contrast));
    shell.applyContrast('high');
    shell.applyContrast('high');
    expect(seen).toEqual(['standard', 'high']);
  });

  it('reaches a component through the runtime', () => {
    let read: UiContrast | null = null;
    const Probe = (_inputs: Inputs<{}>, ctx: ComponentContext) => {
      ctx.inject(ShellService).contrast.subscribe(contrast => (read = contrast));
      return Box({});
    };
    const mounted = mountRuntime(createComponent(Probe));
    mounted.runtime.setContrast('high');
    expect(read).toBe('high');
  });
});
