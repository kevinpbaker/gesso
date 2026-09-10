import { afterEach, describe, expect, it } from 'vitest';

import {
  Box,
  Column,
  insetPadding,
  noInsets,
  UiEnvironmentKeys,
  UiInsetRegistry,
  UiManualFrameClock,
  type UiInsets
} from '@gesso/core';

import { GessoApp } from './GessoApp';
import { mockCanvas, mountRuntime } from './RuntimeTestUtils';
import { ShellService } from './ShellService';

/**
 * The platform's insets, from the shell to a screen (roadmap X7).
 *
 * `observeViewportInsets` reads `visualViewport` on the thread that
 * has a window; the runtime publishes what it hears into the inset
 * registry the app root provides, beside the application's own bars.
 * What is pinned here is the route and the composition rule at its
 * end: a keyboard and a bar over the same edge cost the content one
 * strip, not two.
 */

/**
 * A `visualViewport` a spec can shrink, the way a soft keyboard does.
 * Installed on the global because that is where the reader looks; no
 * `document`, so the safe area reads as zero and only the keyboard's
 * strip is in play.
 */
function fakeVisualViewport(height: number) {
  const listeners = new Map<string, () => void>();
  const viewport = {
    height,
    offsetTop: 0,
    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type)
  };
  const scope = globalThis as Record<string, unknown>;
  return {
    listenerCount: () => listeners.size,
    install() {
      scope.visualViewport = viewport;
      scope.innerHeight = height;
    },
    /** The keyboard opens or closes: the visible height changes and the platform says so. */
    resize(next: number) {
      viewport.height = next;
      listeners.get('resize')?.();
    }
  };
}

afterEach(() => {
  const scope = globalThis as Record<string, unknown>;
  delete scope.visualViewport;
  delete scope.innerHeight;
});

const keyboardOpen: UiInsets = { top: 0, right: 0, bottom: 320, left: 0 };

describe('ShellService.viewportInsets', () => {
  it('starts at zero, follows what the shell applies, and repeats nothing', () => {
    const shell = new ShellService();
    const seen: number[] = [];
    shell.viewportInsets.subscribe(insets => seen.push(insets.bottom));

    expect(seen).toEqual([0]);
    expect(shell.currentViewportInsets).toEqual(noInsets);

    shell.applyViewportInsets(keyboardOpen);
    shell.applyViewportInsets({ ...keyboardOpen });
    shell.applyViewportInsets(noInsets);

    expect(seen).toEqual([0, 320, 0]);
  });
});

describe('the runtime publishing the platform insets', () => {
  it('publishes into the registry the root provides, composing by maximum with a bar', () => {
    const registry = new UiInsetRegistry();
    const mounted = mountRuntime(Box({ insets: registry }));
    const bar = registry.publish({ bottom: 88 });
    expect(registry.current.bottom).toBe(88);

    // The keyboard opens over the bar: one strip, the taller one.
    mounted.runtime.setViewportInsets(keyboardOpen);
    expect(registry.current.bottom).toBe(320);
    expect(mounted.runtime.viewportInsets).toEqual(keyboardOpen);
    expect(mounted.runtime.services.get(ShellService).currentViewportInsets).toEqual(keyboardOpen);

    // The keyboard closes: the bar's room is what is left.
    mounted.runtime.setViewportInsets(noInsets);
    expect(registry.current.bottom).toBe(88);

    // The bar leaves while the keyboard is open, and the keyboard's room stands.
    mounted.runtime.setViewportInsets(keyboardOpen);
    bar();
    expect(registry.current.bottom).toBe(320);

    mounted.runtime.dispose();
  });

  it('reaches a screen reading insetPadding without the application writing a line', () => {
    const registry = new UiInsetRegistry();
    const mounted = mountRuntime(
      Box({ insets: registry }, Column({ key: 'page', modifiers: [insetPadding({ bottom: 40 })] }))
    );
    mounted.frame();
    const page = mounted.runtime.debugRoot().firstChild!;
    expect(page.getProperty('paddingBottom')).toBe(40);

    mounted.runtime.setViewportInsets(keyboardOpen);
    mounted.frame();
    expect(page.getProperty('paddingBottom')).toBe(360);

    mounted.runtime.dispose();
  });

  it('uses the default registry when the root provides none, and gives the room back on dispose', () => {
    const shared = UiEnvironmentKeys.insets.defaultValue as UiInsetRegistry;
    const mounted = mountRuntime(Box({}));

    mounted.runtime.setViewportInsets(keyboardOpen);
    expect(shared.current.bottom).toBe(320);

    mounted.runtime.dispose();
    expect(shared.current.bottom).toBe(0);
  });

  it('moves its contribution to the registry a reloaded root provides', () => {
    const first = new UiInsetRegistry();
    const second = new UiInsetRegistry();
    const mounted = mountRuntime(Box({ insets: first }));
    mounted.runtime.setViewportInsets(keyboardOpen);
    expect(first.current.bottom).toBe(320);

    mounted.runtime.reload(Box({ insets: second }));

    expect(first.current.bottom).toBe(0);
    expect(second.current.bottom).toBe(320);

    mounted.runtime.dispose();
  });

  it('ignores a report that changes nothing', () => {
    const registry = new UiInsetRegistry();
    const mounted = mountRuntime(Box({ insets: registry }));
    const seen: number[] = [];
    registry.changes.subscribe(insets => seen.push(insets.bottom));

    mounted.runtime.setViewportInsets(keyboardOpen);
    mounted.runtime.setViewportInsets({ ...keyboardOpen });

    expect(seen).toEqual([0, 320]);
    mounted.runtime.dispose();
  });
});

describe('GessoApp reading the visual viewport', () => {
  it('reports the keyboard into the registry from mount, and stops watching on dispose', () => {
    const platform = fakeVisualViewport(800);
    platform.install();
    const registry = new UiInsetRegistry();
    const host = { clientWidth: 600, clientHeight: 600, appendChild() {}, removeChild() {} } as unknown as HTMLElement;
    const app = new GessoApp({
      host,
      root: Box({ insets: registry }),
      canvas: mockCanvas(600, 600),
      clock: callback => new UiManualFrameClock(callback)
    });

    app.mount();
    // Read once at mount: a keyboard that is already open sends no event.
    expect(platform.listenerCount()).toBe(2);
    expect(registry.current).toEqual(noInsets);

    platform.resize(480);
    expect(registry.current.bottom).toBe(320);

    platform.resize(800);
    expect(registry.current.bottom).toBe(0);

    app.dispose();
    expect(platform.listenerCount()).toBe(0);
  });

  it('reports zeroes and watches nothing where there is no visual viewport', () => {
    const registry = new UiInsetRegistry();
    const host = { clientWidth: 600, clientHeight: 600, appendChild() {}, removeChild() {} } as unknown as HTMLElement;
    const app = new GessoApp({
      host,
      root: Box({ insets: registry }),
      canvas: mockCanvas(600, 600),
      clock: callback => new UiManualFrameClock(callback)
    });

    app.mount();
    expect(registry.current).toEqual(noInsets);
    app.dispose();
  });
});
