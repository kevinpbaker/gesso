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
 * Serves named ports inside a worker.
 *
 * Call it synchronously at the top level of the worker module, before
 * any await, so no handshake is missed. `onPort` is handed the name
 * the client asked for and the port to answer on; an unknown name is
 * `onPort`'s problem to report, not this function's.
 *
 * Returns a function that stops serving.
 */
export function servePorts(
  onPort: (key: string, port: MessagePort) => void,
  host: PortHost = self as unknown as PortHost
): () => void {
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
    onPort(event.data.key, port);
  };
  return () => {
    host.onmessage = previous;
  };
}
