import { afterEach, describe, expect, it } from 'vitest';
import { map } from 'rxjs/operators';

import { Text, UiNodeType, type UiNode } from '@gesso/core';

import { createComponent } from '../createComponent';
import type { ComponentContext, Inputs } from '../FunctionComponent';
import { observeColorScheme, type ColorScheme } from './colorScheme';
import { observeMediaQuery } from './mediaQuery';
import { mountRuntime } from './RuntimeTestUtils';
import { ShellService } from './ShellService';

/**
 * A `MediaQueryList` a spec can flip, in both the shapes the platform
 * offers: the modern `addEventListener` and the `addListener` WKWebView
 * needed until Safari 14.
 */
function fakeMatchMedia(options: { matches: boolean; legacy?: boolean }) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const list = {
    matches: options.matches,
    ...(options.legacy === true
      ? {
          addListener: (fn: (event: { matches: boolean }) => void) => listeners.add(fn),
          removeListener: (fn: (event: { matches: boolean }) => void) => listeners.delete(fn)
        }
      : {
          addEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => listeners.add(fn),
          removeEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => listeners.delete(fn)
        })
  };
  const queries: string[] = [];
  const matchMedia = (query: string) => {
    queries.push(query);
    return list as unknown as MediaQueryList;
  };
  return {
    queries,
    listenerCount: () => listeners.size,
    /** What the platform now says, announced to whoever is watching. */
    set(matches: boolean) {
      list.matches = matches;
      for (const listener of listeners) {
        listener({ matches });
      }
    },
    install() {
      (globalThis as { matchMedia?: unknown }).matchMedia = matchMedia;
    }
  };
}

afterEach(() => {
  delete (globalThis as { matchMedia?: unknown }).matchMedia;
});

describe('observeMediaQuery', () => {
  it('reports the current answer immediately, then every change', () => {
    const platform = fakeMatchMedia({ matches: false });
    platform.install();
    const seen: boolean[] = [];

    const stop = observeMediaQuery('(prefers-color-scheme: dark)', matches => seen.push(matches));

    // The first report is the point: nobody fires a change event at an
    // app that started in the state it is already in.
    expect(seen).toEqual([false]);

    platform.set(true);
    platform.set(false);
    expect(seen).toEqual([false, true, false]);

    stop();
    platform.set(true);
    expect(seen).toEqual([false, true, false]);
    expect(platform.listenerCount()).toBe(0);
  });

  it('uses addListener where that is all there is', () => {
    const platform = fakeMatchMedia({ matches: true, legacy: true });
    platform.install();
    const seen: boolean[] = [];

    const stop = observeMediaQuery('(prefers-reduced-motion: reduce)', matches => seen.push(matches));
    platform.set(false);

    expect(seen).toEqual([true, false]);
    stop();
    expect(platform.listenerCount()).toBe(0);
  });

  it('answers false once where there is no matchMedia at all', () => {
    const seen: boolean[] = [];

    const stop = observeMediaQuery('(prefers-color-scheme: dark)', matches => seen.push(matches));

    expect(seen).toEqual([false]);
    expect(() => stop()).not.toThrow();
  });
});

describe('observeColorScheme', () => {
  it('asks about dark and reports one of the two appearances', () => {
    const platform = fakeMatchMedia({ matches: true });
    platform.install();
    const seen: ColorScheme[] = [];

    const stop = observeColorScheme(scheme => seen.push(scheme));
    platform.set(false);

    expect(platform.queries).toEqual(['(prefers-color-scheme: dark)']);
    expect(seen).toEqual(['dark', 'light']);
    stop();
  });
});

describe('ShellService.colorScheme', () => {
  it('starts light, follows what the shell applies, and repeats nothing', () => {
    const shell = new ShellService();
    const seen: ColorScheme[] = [];
    shell.colorScheme.subscribe(scheme => seen.push(scheme));

    expect(seen).toEqual(['light']);
    expect(shell.currentColorScheme).toBe('light');

    shell.applyColorScheme('dark');
    shell.applyColorScheme('dark');
    shell.applyColorScheme('light');

    expect(seen).toEqual(['light', 'dark', 'light']);
    expect(shell.currentColorScheme).toBe('light');
  });
});

/** Reads every Text node's text, so a binding can be asserted on. */
function collectText(node: UiNode, into: string[] = []): string[] {
  if (node.type === UiNodeType.Text) {
    into.push(String(node.getProperty('text')));
  }
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    collectText(child, into);
  }
  return into;
}

function Appearance(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const shell = ctx.inject(ShellService);
  return Text({ text: shell.colorScheme.pipe(map(scheme => `scheme: ${scheme}`)) });
}

describe('the runtime carrying the appearance to a component', () => {
  it('reaches a component that injected ShellService, and rebinds without a rebuild', () => {
    const mounted = mountRuntime(createComponent(Appearance));
    const root = mounted.runtime.debugRoot();

    expect(collectText(root)).toEqual(['scheme: light']);
    expect(mounted.runtime.colorScheme).toBe('light');

    mounted.runtime.setColorScheme('dark');

    expect(collectText(root)).toEqual(['scheme: dark']);
    expect(mounted.runtime.colorScheme).toBe('dark');
    // The same node, written through its binding: an appearance change
    // is a property update, not a re-render.
    expect(mounted.runtime.debugRoot()).toBe(root);
  });
});
