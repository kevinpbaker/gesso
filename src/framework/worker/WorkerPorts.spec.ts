import { describe, expect, it, vi } from 'vitest';

import { isPortHandshake, servePorts, workerHandle, type PortHost } from './WorkerPorts';

/**
 * A Worker stand-in that delivers what it is posted to a PortHost,
 * the way a real worker's global channel does.
 */
function createFakeWorker() {
  const host: PortHost = { onmessage: null };
  const terminated = { count: 0 };
  const worker = {
    postMessage: (message: unknown, transfer?: Transferable[]) => {
      host.onmessage?.({ data: message, ports: (transfer ?? []) as MessagePort[] });
    },
    terminate: () => {
      terminated.count++;
    }
  } as unknown as Worker;
  return { worker, host, terminated };
}

/**
 * Waits for `count` messages rather than for a fixed delay.
 *
 * Real MessagePort delivery is two event-loop hops here — client to
 * the served port and back — and a timeout long enough on an idle
 * machine is not long enough on a busy one.
 */
function collect(ports: MessagePort[], count: number): Promise<unknown[]> {
  const seen: unknown[] = [];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`only ${seen.length} of ${count} messages arrived`)), 2000);
    for (const port of ports) {
      port.onmessage = event => {
        seen.push(event.data);
        if (seen.length === count) {
          clearTimeout(timer);
          resolve(seen);
        }
      };
    }
  });
}

describe('workerHandle', () => {
  it('spawns once and serves many named ports', () => {
    const { worker, host } = createFakeWorker();
    let spawns = 0;
    const handle = workerHandle(() => {
      spawns++;
      return worker;
    });
    const served: string[] = [];
    servePorts(
      key => {
        served.push(key);
        return true;
      },
      () => ['catalog', 'cart'],
      host
    );

    expect(handle.spawned).toBe(false);
    handle.open('catalog');
    handle.open('cart');

    expect(spawns).toBe(1);
    expect(handle.spawned).toBe(true);
    expect(served).toEqual(['catalog', 'cart']);
  });

  it('carries messages both ways over one opened port', async () => {
    const { worker, host } = createFakeWorker();
    const handle = workerHandle(() => worker);
    servePorts(
      (_key, port) => {
        port.onmessage = event => port.postMessage(`echo:${String(event.data)}`);
        return true;
      },
      () => ['demo'],
      host
    );

    const client = handle.open('demo');
    const replies = collect([client], 1);
    client.postMessage('hello');

    expect(await replies).toEqual(['echo:hello']);
  });

  it('keeps two ports on one worker independent', async () => {
    const { worker, host } = createFakeWorker();
    const handle = workerHandle(() => worker);
    servePorts(
      (key, port) => {
        port.onmessage = event => port.postMessage(`${key}:${String(event.data)}`);
        return true;
      },
      () => ['alpha', 'beta'],
      host
    );

    const a = handle.open('alpha');
    const b = handle.open('beta');
    const seen = collect([a, b], 2);
    a.postMessage(1);
    b.postMessage(2);

    expect((await seen).sort()).toEqual(['alpha:1', 'beta:2']);
  });

  it('terminates only a worker that was spawned', () => {
    const { worker, terminated } = createFakeWorker();
    const unused = workerHandle(() => worker);
    unused.terminate();
    expect(terminated.count).toBe(0);

    const used = workerHandle(() => worker);
    used.open('x');
    used.terminate();
    expect(terminated.count).toBe(1);
    expect(used.spawned).toBe(false);
  });

  it('passes a message that is not a handshake to the previous handler', () => {
    const host: PortHost = { onmessage: null };
    const other = vi.fn();
    host.onmessage = other;
    servePorts(
      () => expect.unreachable('a plain message is not a handshake'),
      () => [],
      host
    );

    host.onmessage?.({ data: { type: 'something:else' } });
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('restores the previous handler when it stops serving', () => {
    const host: PortHost = { onmessage: null };
    const original = vi.fn();
    host.onmessage = original;
    const stop = servePorts(
      () => true,
      () => [],
      host
    );
    stop();
    expect(host.onmessage).toBe(original);
  });

  it('rejects a handshake with no port attached', () => {
    const host: PortHost = { onmessage: null };
    servePorts(
      () => true,
      () => [],
      host
    );
    expect(() => host.onmessage?.({ data: { type: 'nodal:port', key: 'catalog' } })).toThrow(
      /handshake for 'catalog' arrived with no port/
    );
  });

  it('passes a name it does not serve to the handler installed before it', () => {
    // Two kinds of thing served from one worker — stores and channels
    // during the migration. Each answers for its own names and
    // declines the rest.
    const host: PortHost = { onmessage: null };
    const first: string[] = [];
    const second: string[] = [];
    servePorts(
      key => {
        if (key !== 'store') {
          return false;
        }
        first.push(key);
        return true;
      },
      () => ['store'],
      host
    );
    servePorts(
      key => {
        if (key !== 'channel') {
          return false;
        }
        second.push(key);
        return true;
      },
      () => ['channel'],
      host
    );

    const open = (key: string) =>
      host.onmessage?.({ data: { type: 'nodal:port', key }, ports: [new MessageChannel().port2] });
    open('channel');
    open('store');

    expect(first).toEqual(['store']);
    expect(second).toEqual(['channel']);
  });

  it('answers a name nothing serves, naming what the worker does serve', async () => {
    const host: PortHost = { onmessage: null };
    servePorts(
      () => false,
      () => ['store'],
      host
    );
    servePorts(
      () => false,
      () => ['channel'],
      host
    );

    const pair = new MessageChannel();
    const reply = new Promise<unknown>(resolve => {
      pair.port1.onmessage = event => resolve(event.data);
    });
    host.onmessage?.({ data: { type: 'nodal:port', key: 'nope' }, ports: [pair.port2] });

    // A handshake that matched nothing would otherwise leave the
    // client waiting forever with nothing said.
    expect(await reply).toEqual({
      type: 'port:error',
      message: "Nothing is served under 'nope'. This worker serves: channel, store."
    });
  });

  it('recognises only a well-formed handshake', () => {
    expect(isPortHandshake({ type: 'nodal:port', key: 'a' })).toBe(true);
    expect(isPortHandshake({ type: 'nodal:port' })).toBe(false);
    expect(isPortHandshake({ type: 'other', key: 'a' })).toBe(false);
    expect(isPortHandshake(null)).toBe(false);
  });
});
