import { afterEach, describe, expect, it, vi } from 'vitest';

import { openUrlWith, resolveAppLogic } from './WorkerApp';
import type { AppLogicEndpoint } from './WorkerApp';

/**
 * Who owns the application layer, which is the half of this that goes
 * quietly wrong.
 *
 * The shell disposes and rebuilds itself whenever the *rendering*
 * changes, so an application worker it wrongly believes it owns is an
 * application discarded for a reason that had nothing to do with the
 * application. The reverse is a leak. Neither shows up as a failure
 * anywhere near the decision, so the decision is pinned here.
 *
 * The endpoint case is what a desktop window uses: the application
 * lives in another process and the shell holds one end of a bridge to
 * it, which it must never close (`@gesso/electrobun`).
 */
function endpoint(): AppLogicEndpoint {
  return {
    postMessage: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

describe('resolveAppLogic', () => {
  const originalWorker = (globalThis as { Worker?: unknown }).Worker;

  afterEach(() => {
    if (originalWorker === undefined) {
      delete (globalThis as { Worker?: unknown }).Worker;
    } else {
      (globalThis as { Worker?: unknown }).Worker = originalWorker;
    }
  });

  it('owns what it spawned from a factory', () => {
    const made = endpoint();
    const factory = vi.fn(() => made as unknown as Worker);

    const resolved = resolveAppLogic(factory);

    expect(factory).toHaveBeenCalledOnce();
    expect(resolved.endpoint).toBe(made);
    expect(resolved.owned).toBe(true);
  });

  it('owns what it spawned from a url or a path', () => {
    const constructed: unknown[] = [];
    class FakeWorker {
      constructor(url: string | URL) {
        constructed.push(url);
      }
    }
    (globalThis as { Worker?: unknown }).Worker = FakeWorker;

    expect(resolveAppLogic('./app.logic.worker.js').owned).toBe(true);
    expect(resolveAppLogic(new URL('https://example.test/w.js')).owned).toBe(true);
    expect(constructed).toHaveLength(2);
  });

  it('does not own a worker it was handed', () => {
    // The playground's renderer switch remounts the shell and keeps
    // its application worker; terminating it would drop the
    // application's state for a rendering change.
    const given = endpoint() as unknown as Worker;

    const resolved = resolveAppLogic(given);

    expect(resolved.endpoint).toBe(given);
    expect(resolved.owned).toBe(false);
  });

  it('does not own an endpoint that is not a worker at all', () => {
    const bridge = endpoint();

    const resolved = resolveAppLogic(bridge);

    expect(resolved.endpoint).toBe(bridge);
    expect(resolved.owned).toBe(false);
  });

  it('takes a MessagePort, which is the whole point of the widening', () => {
    const channel = new MessageChannel();

    const resolved = resolveAppLogic(channel.port1 as unknown as AppLogicEndpoint);

    expect(resolved.endpoint).toBe(channel.port1);
    expect(resolved.owned).toBe(false);
    // A port delivers nothing until it is started, and the shell is
    // what starts it; a worker has no such method and must not be
    // asked for one.
    expect(typeof (resolved.endpoint as { start?: unknown }).start).toBe('function');
    channel.port1.close();
    channel.port2.close();
  });
});

describe('openUrlWith', () => {
  const originalOpen = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    if (originalOpen === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalOpen;
    }
  });

  it('hands the url to the host when it has one', () => {
    const opened: string[] = [];

    openUrlWith(url => opened.push(url), 'https://example.test/a');

    expect(opened).toEqual(['https://example.test/a']);
  });

  it('opens a new tab when nothing else will, without handing over the opener', () => {
    const calls: unknown[][] = [];
    (globalThis as { window?: unknown }).window = { open: (...args: unknown[]) => calls.push(args) };

    openUrlWith(undefined, 'https://example.test/b');

    expect(calls).toEqual([['https://example.test/b', '_blank', 'noopener,noreferrer']]);
  });
});
