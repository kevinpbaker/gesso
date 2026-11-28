// @vitest-environment happy-dom
import { act, createElement, createRef, StrictMode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmbedOptions } from 'gesso-framework/embed';
import { GessoSurface, type GessoSurfaceHandle } from './GessoSurface';

/**
 * `<GessoSurface>` is lifecycle around `embedSurface`, which wants a
 * browser with `OffscreenCanvas` and workers, and is pinned by its own
 * specs. Here it is a double that records each mount, so what is checked
 * is what React does with it: when it mounts, when it disposes, what
 * reaches it on a later render.
 */
interface Mounted {
  host: HTMLElement;
  options: EmbedOptions;
  disposed: number;
  schemes: string[];
  focused: number;
}

const mounts: Mounted[] = [];

vi.mock('gesso-framework/embed', () => ({
  embedSurface: (host: HTMLElement, options: EmbedOptions) => {
    const record: Mounted = { host, options, disposed: 0, schemes: [], focused: 0 };
    mounts.push(record);
    return {
      app: {},
      focus: () => (record.focused += 1),
      setColorScheme: (preference: string) => record.schemes.push(preference),
      dispose: () => (record.disposed += 1)
    };
  }
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const renderWorker = () => ({}) as Worker;
let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  mounts.length = 0;
});

describe('GessoSurface', () => {
  it('mounts the app into its own div, and disposes it on unmount', () => {
    act(() => root.render(createElement(GessoSurface, { renderWorker, className: 'grid', style: { height: 300 } })));

    expect(mounts).toHaveLength(1);
    const div = container.querySelector('div.grid') as HTMLElement;
    expect(mounts[0]!.host).toBe(div);
    expect(div.style.height).toBe('300px');
    expect('className' in mounts[0]!.options).toBe(false);

    act(() => root.render(createElement('p')));
    expect(mounts[0]!.disposed).toBe(1);
  });

  it('changes the appearance on a later render without a remount', () => {
    act(() => root.render(createElement(GessoSurface, { renderWorker, colorScheme: 'light' })));
    act(() => root.render(createElement(GessoSurface, { renderWorker, colorScheme: 'dark' })));

    expect(mounts).toHaveLength(1);
    expect(mounts[0]!.schemes).toEqual(['light', 'dark']);
  });

  it("calls the latest render's callback, so a closure over state is never stale", () => {
    const seen: string[] = [];
    act(() => root.render(createElement(GessoSurface, { renderWorker, onTitle: t => seen.push(`first ${t}`) })));
    act(() => root.render(createElement(GessoSurface, { renderWorker, onTitle: t => seen.push(`second ${t}`) })));

    mounts[0]!.options.onTitle?.('Grid');

    expect(seen).toEqual(['second Grid']);
  });

  it('leaves out a callback that was not given, so an absent onFrame asks the worker for nothing', () => {
    act(() => root.render(createElement(GessoSurface, { renderWorker })));

    expect('onFrame' in mounts[0]!.options).toBe(false);
    expect(mounts[0]!.options.renderWorker).toBe(renderWorker);
  });

  it('remounts when its key changes, which is how other options take effect', () => {
    function Host() {
      const [version, setVersion] = useState(1);
      (Host as unknown as { bump: () => void }).bump = () => setVersion(v => v + 1);
      return createElement(GessoSurface, { key: version, renderWorker });
    }
    act(() => root.render(createElement(Host)));
    act(() => (Host as unknown as { bump: () => void }).bump());

    expect(mounts).toHaveLength(2);
    expect(mounts[0]!.disposed).toBe(1);
    expect(mounts[1]!.disposed).toBe(0);
  });

  it('leaves exactly one app running under StrictMode', () => {
    act(() => root.render(createElement(StrictMode, null, createElement(GessoSurface, { renderWorker }))));

    const running = mounts.filter(mounted => mounted.disposed === 0);
    expect(running).toHaveLength(1);
  });

  it('focuses the app through its ref', () => {
    const ref = createRef<GessoSurfaceHandle>();
    act(() => root.render(createElement(GessoSurface, { renderWorker, ref })));

    ref.current!.focus();

    expect(mounts[0]!.focused).toBe(1);
    expect(ref.current!.surface).not.toBeNull();
  });
});
