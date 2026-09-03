import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { channel } from './ChannelToken';
import { createChannelRegistry } from './createChannelRegistry';
import { serveChannels } from './serveChannels';
import { workerHandle, type PortHost } from '../worker/WorkerPorts';

interface CatalogView {
  products: { id: string; name: string }[];
  status: 'loading' | 'ready';
}

interface CatalogCommands {
  add(name: string): void;
}

const Catalog = channel<CatalogView, CatalogCommands>('catalog', { products: [], status: 'loading' });

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

/** The application side: plain RxJS, no framework import in sight. */
function createCatalogViewModel() {
  const products = new BehaviorSubject<CatalogView['products']>([]);
  const status = new BehaviorSubject<CatalogView['status']>('loading');
  return {
    products,
    status,
    add(name: string) {
      products.next([...products.value, { id: String(products.value.length), name }]);
      status.next('ready');
    }
  };
}

describe('a channel across a real patch stream', () => {
  it('starts from the token, then follows the application', async () => {
    const app = createCatalogViewModel();
    const handle = createChannelRegistry([
      {
        token: Catalog,
        source: {
          view: { products: app.products, status: app.status },
          commands: { add: (name: string) => app.add(name) }
        }
      }
    ]);
    const catalog = handle.registry.get(Catalog);

    // Never undefined: the cell is seeded from the token, and the
    // provider starts from the same value, so an application already
    // in its initial state sends nothing at all.
    expect(catalog.view.status.value).toBe('loading');
    expect(catalog.view.products.value).toEqual([]);

    // A command reaches the handler; its effect returns as a patch.
    catalog.send.add('apple');
    await waitFor(() => catalog.view.status.value === 'ready', 'the status patch');
    expect(catalog.view.products.value).toEqual([{ id: '0', name: 'apple' }]);

    handle.dispose();
  });

  it('emits a view key only when it actually changes', async () => {
    const app = createCatalogViewModel();
    const handle = createChannelRegistry([
      { token: Catalog, source: { view: { products: app.products, status: app.status } } }
    ]);
    const catalog = handle.registry.get(Catalog);
    const statuses: unknown[] = [];
    catalog.view.status.subscribe(value => statuses.push(value));

    // Three emissions of a structurally identical array.
    app.products.next([{ id: '0', name: 'a' }]);
    app.products.next([{ id: '0', name: 'a' }]);
    app.products.next([{ id: '0', name: 'a' }]);
    await waitFor(() => catalog.view.products.value.length === 1, 'the products patch');

    // status never moved, so it was never pushed through its bindings.
    expect(statuses).toEqual(['loading']);
    handle.dispose();
  });

  it('warns once when a command is called with more than one argument, and sends the first', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = createCatalogViewModel();
    const received: unknown[] = [];
    const handle = createChannelRegistry([
      {
        token: Catalog,
        source: {
          view: { products: app.products, status: app.status },
          commands: { add: (name: string) => received.push(name) }
        }
      }
    ]);
    const send = handle.registry.get(Catalog).send as unknown as Record<string, (...args: unknown[]) => void>;
    send.add('apple', 'extra');
    send.add('pear', 'extra');
    await waitFor(() => received.length === 2, 'the commands');

    expect(received).toEqual(['apple', 'pear']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("command 'add' was called with 2 arguments");
    warn.mockRestore();
    handle.dispose();
  });

  it('reports a command the channel does not declare', async () => {
    const app = createCatalogViewModel();
    const errors: string[] = [];
    const handle = createChannelRegistry(
      [{ token: Catalog, source: { view: { products: app.products, status: app.status } } }],
      (_name, message) => errors.push(message)
    );

    (handle.registry.get(Catalog).send as unknown as Record<string, () => void>).nope();
    await waitFor(() => errors.length > 0, 'the error');
    expect(errors[0]).toMatch(/Channel 'catalog' has no command 'nope'/);
    handle.dispose();
  });

  it('throws at startup when a view key is not plain data', async () => {
    const rich = new BehaviorSubject<unknown>([{ added: new Date() }]);
    const errors: string[] = [];
    const handle = createChannelRegistry(
      [
        {
          token: Catalog,
          source: { view: { products: rich, status: new BehaviorSubject('loading') } } as never
        }
      ],
      (_name, message) => errors.push(message)
    );

    await waitFor(() => errors.length > 0, 'the plain-data error');
    expect(errors[0]).toMatch(/'products'\[0\]\.added, which is not plain data/);
    handle.dispose();
  });

  it('names the declared keys when an undeclared one is read', () => {
    const app = createCatalogViewModel();
    const handle = createChannelRegistry([
      { token: Catalog, source: { view: { products: app.products, status: app.status } } }
    ]);
    expect(() => (handle.registry.get(Catalog).view as unknown as Record<string, unknown>).nope).toThrow(
      /'nope' is not a view key on channel 'catalog'\. Declared keys: products, status\./
    );
    handle.dispose();
  });

  it('carries a channel out of an application worker', async () => {
    const host: PortHost = { onmessage: null };
    const app = createCatalogViewModel();
    const stop = serveChannels(
      [
        {
          token: Catalog,
          source: {
            view: { products: app.products, status: app.status },
            commands: { add: (name: string) => app.add(name) }
          }
        }
      ],
      host
    );
    const fakeWorker = () =>
      ({
        postMessage: (message: unknown, transfer?: Transferable[]) =>
          host.onmessage?.({ data: message, ports: (transfer ?? []) as MessagePort[] }),
        terminate: () => {}
      }) as unknown as Worker;

    const handle = createChannelRegistry([{ token: Catalog, worker: workerHandle(fakeWorker) }]);
    const catalog = handle.registry.get(Catalog);

    catalog.send.add('pear');
    await waitFor(() => catalog.view.products.value.length === 1, 'the patch from the worker');
    expect(catalog.view.products.value).toEqual([{ id: '0', name: 'pear' }]);
    expect(catalog.view.status.value).toBe('ready');

    handle.dispose();
    stop();
  });

  it('reports a view key nothing was provided for', async () => {
    const errors: string[] = [];
    const handle = createChannelRegistry(
      [{ token: Catalog, source: { view: { products: new Subject() } } }],
      (_name, message) => errors.push(message)
    );
    await waitFor(() => errors.length > 0, 'the missing-key error');
    expect(errors[0]).toMatch(/declares view key 'status' but nothing was provided for it/);
    handle.dispose();
  });

  it('refuses a registration with neither a worker nor a source', () => {
    expect(() => createChannelRegistry([{ token: Catalog }])).toThrow(/registered with neither a worker nor a source/);
  });
});
