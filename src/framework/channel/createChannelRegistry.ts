import type { Observable } from 'rxjs';

import { workerHandle, type WorkerHandle } from '../worker/WorkerPorts';
import { ChannelRegistry } from './ChannelRegistry';
import type { ChannelPort } from './ChannelProtocol';
import { provide, ProvidedChannel, type ChannelSource } from './provide';
import type { ChannelToken, Command, CommandMap } from './ChannelToken';

/**
 * A registration with its types erased.
 *
 * Erased structurally rather than as `ChannelToken<never, never>`: a
 * heterogeneous list of channels has no single generic instantiation,
 * and `never` made every caller cast. What the registry actually needs
 * is a name, an initial shape, observables by key and callables by
 * name — all of which a concrete registration satisfies on its own.
 */
export interface ChannelRegistration {
  token: { name: string; initial: object };
  /**
   * The worker that owns this channel's data.
   *
   * A `WorkerHandle` shared between registrations puts them in one
   * application worker, which is the arrangement the barrier design
   * exists for: api, store, domain and view models together, one
   * thread, several channels.
   */
  worker?: WorkerHandle | (() => Worker);
  /**
   * What feeds the channel, when it is owned by this thread.
   *
   * Still crosses a real `MessageChannel`, so the same diff, the same
   * patches and the same plain-data rule apply — a channel behaves
   * identically wherever it lives, which is what lets it be moved into
   * a worker later without touching a view.
   */
  source?: {
    view: Record<string, Observable<unknown>>;
    commands?: Record<string, Command>;
  };
}

export interface ChannelRegistryHandle {
  registry: ChannelRegistry;
  dispose(): void;
}

function isWorkerHandle(worker: WorkerHandle | (() => Worker)): worker is WorkerHandle {
  return typeof worker === 'object';
}

/**
 * Attaches every registered channel, wherever its data lives.
 */
export function createChannelRegistry(
  registrations: readonly ChannelRegistration[],
  onError?: (channelName: string, message: string, stack?: string) => void
): ChannelRegistryHandle {
  const registry = new ChannelRegistry();
  const handles = new Set<WorkerHandle>();
  const wrapped = new Map<() => Worker, WorkerHandle>();
  const local: ProvidedChannel[] = [];

  for (const registration of registrations) {
    const token = registration.token as unknown as ChannelToken<object, CommandMap>;
    let port: ChannelPort;

    if (registration.worker !== undefined) {
      let handle: WorkerHandle;
      if (isWorkerHandle(registration.worker)) {
        handle = registration.worker;
      } else {
        const factory = registration.worker;
        handle = wrapped.get(factory) ?? workerHandle(factory);
        wrapped.set(factory, handle);
      }
      handles.add(handle);
      port = handle.open(token.name) as unknown as ChannelPort;
    } else {
      if (registration.source === undefined) {
        throw new Error(
          `Channel '${token.name}' was registered with neither a worker nor a source, ` +
            `and no application-logic worker was supplied to serve it. Pass appLogicWorker to ` +
            `createApp to spawn one, source to feed the channel from this thread, or worker to ` +
            `name a worker of its own.`
        );
      }
      const pair = new MessageChannel();
      local.push(
        provide(
          token,
          registration.source as unknown as ChannelSource<object, CommandMap>,
          pair.port2 as unknown as ChannelPort
        )
      );
      port = pair.port1 as unknown as ChannelPort;
    }

    const replica = registry.attach(token, port);
    replica.onError((message, stack) => {
      if (onError !== undefined) {
        onError(token.name, message, stack);
      } else {
        console.error(`[gesso channel ${token.name}] ${message}`, stack);
      }
    });
  }

  return {
    registry,
    dispose: () => {
      for (const channel of local) {
        channel.dispose();
      }
      local.length = 0;
      registry.dispose();
      for (const handle of handles) {
        handle.terminate();
      }
      handles.clear();
      wrapped.clear();
    }
  };
}
