import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { defineChannel } from '../channel/ChannelToken';
import { createChannelRegistry } from '../channel/createChannelRegistry';
import { serve, serveChannels } from '../channel/serveChannels';
import { portHandle, type PortHost } from '../worker/WorkerPorts';
import type { AppLogicEndpoint } from '../app/worker/WorkerApp';
import { hostChannels } from './hostChannels';

/**
 * Channels served by the page that embeds an app.
 *
 * The shell hands its application layer a hub port and gives the
 * render worker the other end; here the render worker's side is a
 * channel registry on that end, over a real `MessageChannel`, so every
 * message is cloned the way it is between threads.
 */
const Filter = defineChannel('filter', {
  view: { text: '' },
  commands: {} as { pick(id: string): void }
});

const Rows = defineChannel('rows', {
  view: { ids: [] as readonly string[] }
});

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

/** What the shell does with an application layer at mount: one hub port to it, the other end to the render worker. */
function connect(endpoint: AppLogicEndpoint): MessagePort {
  const hub = new MessageChannel();
  endpoint.postMessage({ type: 'gesso:hub' }, [hub.port2]);
  return hub.port1;
}

/** An application worker, in-process: `serveChannels` on a host the endpoint posts into. */
function appWorker(): { endpoint: AppLogicEndpoint; ids: BehaviorSubject<readonly string[]>; stop: () => void } {
  const host: PortHost = { onmessage: null };
  const ids = new BehaviorSubject<readonly string[]>(['a', 'b']);
  const stop = serveChannels([serve(Rows, { view: { ids } })], host);
  const endpoint: AppLogicEndpoint = {
    postMessage: (message, transfer) => host.onmessage?.({ data: message, ports: transfer as MessagePort[] }),
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  return { endpoint, ids, stop };
}

describe('hostChannels', () => {
  it("serves the page's state as a view, and the app's commands as the page's callbacks", async () => {
    const text = new BehaviorSubject('pears');
    const picked: string[] = [];
    const served = hostChannels([serve(Filter, { view: { text }, commands: { pick: id => picked.push(id) } })]);
    const render = createChannelRegistry([{ token: Filter, worker: portHandle(connect(served.endpoint)) }]);
    const filter = render.registry.get(Filter);

    await waitFor(() => filter.view.text.value === 'pears', 'the first view');
    text.next('plums');
    await waitFor(() => filter.view.text.value === 'plums', 'the page changing it');
    filter.send.pick('row-3');
    await waitFor(() => picked.length === 1, 'the command');
    expect(picked).toEqual(['row-3']);

    render.dispose();
    served.dispose();
  });

  it("passes the channels it does not serve on to the app's worker", async () => {
    const worker = appWorker();
    const served = hostChannels(
      [serve(Filter, { view: { text: new BehaviorSubject('') }, commands: { pick: () => {} } })],
      worker.endpoint
    );
    const port = connect(served.endpoint);
    const render = createChannelRegistry([
      { token: Rows, worker: portHandle(port) },
      { token: Filter, worker: portHandle(port) }
    ]);

    const rows = render.registry.get(Rows);
    await waitFor(() => rows.view.ids.value.length === 2, "the worker's rows");
    worker.ids.next(['a', 'b', 'c']);
    await waitFor(() => rows.view.ids.value.length === 3, "the worker's change");
    expect(render.registry.get(Filter).view.text.value).toBe('');

    render.dispose();
    served.dispose();
    worker.stop();
  });

  it("sends the shell's other messages to the worker, and nowhere without one", () => {
    const seen: unknown[] = [];
    const worker: AppLogicEndpoint = {
      postMessage: message => seen.push(message),
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    hostChannels([], worker).endpoint.postMessage({ type: 'gesso:console', enabled: true });
    hostChannels([]).endpoint.postMessage({ type: 'gesso:console', enabled: true });

    expect(seen).toEqual([{ type: 'gesso:console', enabled: true }]);
  });
});
