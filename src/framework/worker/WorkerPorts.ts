/**
 * Named `MessagePort`s into a worker.
 *
 * A worker's global `onmessage` is a single channel, so a worker that
 * receives messages on it can host exactly one conversation. That is
 * why a store in a data worker meant a worker per store: `attachStore`
 * claimed the `Worker` object itself, and a second store had nowhere
 * to go.
 *
 * A handshake fixes it. The client opens a `MessageChannel`, keeps one
 * end and transfers the other with a name; the worker serves that name
 * and the two ends talk privately from then on. The global channel is
 * used once per conversation and carries nothing else.
 *
 * Nothing here knows what travels over a port. It is the transport the
 * store replication in `../store/worker` runs on today and the barrier
 * contract will run on next.
 */

/** A port-shaped thing: `MessagePort` and `Worker` both satisfy it. */
export interface MessageEndpoint {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

/** The one message the global channel carries. */
export interface PortHandshake {
  type: 'nodal:port';
  key: string;
}

export function isPortHandshake(value: unknown): value is PortHandshake {
  const message = value as { type?: unknown; key?: unknown } | null;
  return message?.type === 'nodal:port' && typeof message.key === 'string';
}

/**
 * A worker spawned at most once, serving any number of named ports.
 *
 * Handed to several `useStore` calls, it is what lets one data worker
 * hold a whole application layer instead of one store. Spawning is
 * deferred to the first `open`, so a handle nobody uses costs nothing.
 */
export interface WorkerHandle {
  /**
   * Opens a private channel under `key`, spawning the worker if this
   * is the first one.
   */
  open(key: string): MessagePort;
  /** Whether the worker has been spawned. */
  readonly spawned: boolean;
  /** Stops the worker, if it was ever started. */
  terminate(): void;
}

/**
 * Stands for "whichever worker the shell spawned for the application".
 *
 * A registration inside the render worker cannot name that worker: it
 * is created by the shell and its port only arrives with `init`, long
 * after `useStore` and `useChannel` have run. This sentinel is what a
 * registration puts there instead, and the render worker swaps it for
 * the real handle once the port shows up.
 *
 * Opening a port on it before then is a bug rather than a race, so it
 * says so.
 */
export const APPLICATION_WORKER: WorkerHandle = {
  open(): MessagePort {
    throw new Error(
      'APPLICATION_WORKER was used directly. It is a placeholder the render worker ' +
        "replaces with the shell's port; reaching it means no application worker was supplied — " +
        'pass appWorker to createApp.'
    );
  },
  spawned: false,
  terminate(): void {}
};

/**
 * Anything a handshake can be posted to with a port attached.
 * `Worker` and `MessagePort` both satisfy it.
 */
export interface TransferTarget {
  postMessage(message: unknown, transfer: Transferable[]): void;
}

/**
 * A handle over an endpoint someone else owns.
 *
 * The shell spawns the application worker and hands the render worker
 * one end of a channel to it; this is what the render worker opens
 * named ports over. `terminate` is a no-op — the lifetime belongs to
 * whoever created the endpoint, and a handle that could kill a worker
 * it did not spawn would be a surprising thing to hand out.
 */
export function portHandle(endpoint: TransferTarget): WorkerHandle {
  return {
    open(key: string): MessagePort {
      const channel = new MessageChannel();
      endpoint.postMessage({ type: 'nodal:port', key } satisfies PortHandshake, [channel.port2]);
      return channel.port1;
    },
    get spawned(): boolean {
      return true;
    },
    terminate(): void {}
  };
}

/**
 * Routes handshakes arriving on a transferred port through the same
 * handlers as the worker's own global channel.
 *
 * The shell owns the application worker and gives the render worker a
 * port to it, so handshakes reach this worker two ways: on its global
 * channel (whoever spawned it) and on that port (whoever was given
 * it). Both should be served by the same handlers, and neither end
 * should have to know which route a channel came in on.
 */
export interface HubMessage {
  type: 'nodal:hub';
}

export function isHubMessage(value: unknown): value is HubMessage {
  return (value as { type?: unknown } | null)?.type === 'nodal:hub';
}

const BASE_INSTALLED = Symbol.for('nodal:port-base-installed');

/**
 * The handler every `servePorts` chain sits on top of.
 *
 * It owns the two things no individual server can: routing a hub port
 * through the whole chain, and answering a handshake that nobody
 * accepted. Both have to be innermost — the first because the chain is
 * only complete once every server has wrapped `onmessage`, the second
 * because "nobody accepted" is only known after every server has
 * declined.
 */
function installBase(host: PortHost & { [BASE_INSTALLED]?: boolean }): void {
  if (host[BASE_INSTALLED] === true) {
    return;
  }
  host[BASE_INSTALLED] = true;
  const previous = host.onmessage;
  const registered = (host as HostWithNames)[SERVED_NAMES] ?? [];

  host.onmessage = event => {
    if (isHubMessage(event.data)) {
      const port = event.ports?.[0];
      if (port === undefined) {
        throw new Error('A hub message arrived with no port attached.');
      }
      // The whole chain, not just this handler: by now every
      // `servePorts` on this host has wrapped `onmessage`, and a
      // handshake arriving on the port should reach all of them.
      port.onmessage = host.onmessage;
      return;
    }
    if (!isPortHandshake(event.data)) {
      previous?.(event);
      return;
    }
    const port = event.ports?.[0];
    if (port === undefined) {
      throw new Error(`Port handshake for '${event.data.key}' arrived with no port attached.`);
    }
    // Reaching here means every server declined. Silence would leave
    // the client waiting forever with nothing said.
    const served = registered.flatMap(get => [...get()]).sort();
    const error: PortErrorMessage = {
      type: 'port:error',
      message: `Nothing is served under '${event.data.key}'. This worker serves: ${
        served.length > 0 ? served.join(', ') : '(nothing)'
      }.`
    };
    port.postMessage(error);
  };
}

/**
 * Wraps a worker factory so the worker is created once and shared.
 *
 * A factory rather than a URL for the same reason the render worker
 * takes one: a bundler only emits a chunk for a worker it can see
 * constructed literally in the calling module.
 *
 *   const data = workerHandle(
 *     () => new Worker(new URL('./data.worker.ts', import.meta.url), { type: 'module' })
 *   );
 */
export function workerHandle(factory: () => Worker): WorkerHandle {
  let worker: Worker | undefined;
  return {
    open(key: string): MessagePort {
      worker ??= factory();
      const channel = new MessageChannel();
      // The worker may not have run its module body yet. Messages
      // posted to a worker queue until it installs a handler, so the
      // handshake is safe as long as `servePorts` is called
      // synchronously at the top level of the worker module — the same
      // guarantee `renderRoot` relies on.
      worker.postMessage({ type: 'nodal:port', key } satisfies PortHandshake, [channel.port2]);
      return channel.port1;
    },
    get spawned(): boolean {
      return worker !== undefined;
    },
    terminate(): void {
      worker?.terminate();
      worker = undefined;
    }
  };
}

/**
 * Minimal view of a worker's global scope, so this module type-checks
 * against the DOM lib without pulling in the WebWorker lib.
 */
export interface PortHost {
  onmessage: ((event: { data: unknown; ports?: readonly MessagePort[] }) => void) | null;
}

/**
 * What a port is answered with when no handler claimed its name.
 *
 * Its own message type rather than a store's or a channel's, because
 * the transport does not know which of them the client is: both
 * recognise it, so a mismatched name is loud either way.
 */
export interface PortErrorMessage {
  type: 'port:error';
  message: string;
}

export function isPortErrorMessage(value: unknown): value is PortErrorMessage {
  const message = value as { type?: unknown; message?: unknown } | null;
  return message?.type === 'port:error' && typeof message.message === 'string';
}

/** Every name served on a host, across all `servePorts` calls on it. */
const SERVED_NAMES = Symbol.for('nodal:served-port-names');

interface HostWithNames extends PortHost {
  [SERVED_NAMES]?: Array<() => readonly string[]>;
}

/**
 * Serves named ports inside a worker.
 *
 * Call it synchronously at the top level of the worker module, before
 * any await, so no handshake is missed.
 *
 * `onPort` returns whether it took the port. Returning false passes
 * the handshake to whatever was serving before, which is what lets two
 * kinds of thing — stores and channels, during the migration — share
 * one worker: each answers for its own names and declines the rest.
 * When nobody accepts, the port is answered with an error naming
 * everything the worker does serve, because a handshake that silently
 * matched nothing leaves the client waiting forever with nothing said.
 *
 * `names` is only read to build that message.
 *
 * Returns a function that stops serving.
 */
export function servePorts(
  onPort: (key: string, port: MessagePort) => boolean,
  names: () => readonly string[],
  host: PortHost = self as unknown as PortHost
): () => void {
  const withNames = host as HostWithNames;
  const registered = (withNames[SERVED_NAMES] ??= []);
  registered.push(names);
  // Before this handler wraps `onmessage`, so the base ends up
  // innermost: it answers a handshake only once every server above it
  // has declined.
  installBase(host);

  const previous = host.onmessage;
  host.onmessage = event => {
    if (!isPortHandshake(event.data)) {
      // Not ours. A worker that also speaks its own protocol on the
      // global channel keeps working.
      previous?.(event);
      return;
    }
    const port = event.ports?.[0];
    if (port === undefined) {
      throw new Error(`Port handshake for '${event.data.key}' arrived with no port attached.`);
    }
    if (onPort(event.data.key, port)) {
      return;
    }
    // Declined. Another server may take it; the base answers if none
    // does.
    previous?.(event);
  };
  return () => {
    host.onmessage = previous;
    const index = registered.indexOf(names);
    if (index >= 0) {
      registered.splice(index, 1);
    }
  };
}
