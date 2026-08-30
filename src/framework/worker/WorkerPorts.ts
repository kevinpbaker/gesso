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
    if (previous !== null) {
      previous(event);
      return;
    }
    const served = registered.flatMap(get => [...get()]).sort();
    const error: PortErrorMessage = {
      type: 'port:error',
      message: `Nothing is served under '${event.data.key}'. This worker serves: ${
        served.length > 0 ? served.join(', ') : '(nothing)'
      }.`
    };
    port.postMessage(error);
  };
  return () => {
    host.onmessage = previous;
    const index = registered.indexOf(names);
    if (index >= 0) {
      registered.splice(index, 1);
    }
  };
}
