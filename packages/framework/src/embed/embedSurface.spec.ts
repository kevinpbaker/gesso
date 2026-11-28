import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { defineChannel } from '../channel/ChannelToken';
import { serve } from '../channel/serveChannels';
import type { CreateAppOptions } from '../app/createApp';

/**
 * `embedSurface`'s part is the defaults and the lifecycle around
 * `createApp(...).mount(host)`; `mount` itself wants a browser, and is
 * pinned by the `WorkerApp` specs. So `createApp` is a double here that
 * records what it was given.
 */
const created: { options: CreateAppOptions; mounted: unknown[]; unmounted: number; schemes: string[] }[] = [];

vi.mock('../app/createApp', () => ({
  createApp: (options: CreateAppOptions) => {
    const record = { options, mounted: [] as unknown[], unmounted: 0, schemes: [] as string[] };
    created.push(record);
    return {
      mount: (host: unknown) => {
        record.mounted.push(host);
        return () => {
          record.unmounted += 1;
        };
      },
      setColorScheme: (preference: string) => record.schemes.push(preference)
    };
  }
}));

const { embedSurface } = await import('./embedSurface');

const renderWorker = () => ({}) as Worker;

function element(height = 300) {
  const canvas = { focused: 0, focus: () => (canvas.focused += 1) };
  return { clientHeight: height, canvas, querySelector: () => canvas } as unknown as HTMLElement & {
    canvas: { focused: number };
  };
}

afterEach(() => {
  created.length = 0;
  vi.restoreAllMocks();
});

describe('embedSurface', () => {
  it("keeps the page's address bar, title and leave warning, and lets Tab leave", () => {
    const host = element();
    embedSurface(host, { renderWorker });

    const { options, mounted } = created[0]!;
    expect(mounted).toEqual([host]);
    expect(options.history).toEqual({ mode: 'memory' });
    expect(options.tabExit).toBe(true);
    expect(typeof options.onTitle).toBe('function');
    expect(typeof options.onLeaveWarning).toBe('function');
    expect(options.pageKeys).toBeUndefined();
  });

  it('takes what the host says over its defaults', () => {
    const titles: string[] = [];
    embedSurface(element(), {
      renderWorker,
      history: { mode: 'hash' },
      tabExit: false,
      onTitle: title => titles.push(title)
    });

    const { options } = created[0]!;
    expect(options.history).toEqual({ mode: 'hash' });
    expect(options.tabExit).toBe(false);
    options.onTitle?.('Grid');
    expect(titles).toEqual(['Grid']);
  });

  it("serves the host's channels as the app's application layer", () => {
    const Filter = defineChannel('filter', { view: { text: '' } });
    embedSurface(element(), { renderWorker, channels: [serve(Filter, { view: { text: new BehaviorSubject('') } })] });

    const endpoint = created[0]!.options.appLogicWorker as { postMessage?: unknown };
    expect(typeof endpoint.postMessage).toBe('function');
  });

  it('passes the worker straight through when the host serves nothing', () => {
    const worker = () => ({}) as Worker;
    embedSurface(element(), { renderWorker, appLogicWorker: worker });

    expect(created[0]!.options.appLogicWorker).toBe(worker);
  });

  it('focuses, changes appearance without a remount, and disposes once', () => {
    const host = element();
    const surface = embedSurface(host, { renderWorker });

    surface.focus();
    surface.setColorScheme('dark');
    surface.dispose();
    surface.dispose();

    expect(host.canvas.focused).toBe(1);
    expect(created).toHaveLength(1);
    expect(created[0]!.schemes).toEqual(['dark']);
    expect(created[0]!.unmounted).toBe(1);
  });

  it('warns about a host with no height, which would draw nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    embedSurface(element(0), { renderWorker });

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]![0])).toContain('no height');
  });
});
