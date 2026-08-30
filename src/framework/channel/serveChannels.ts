import type { Observable } from 'rxjs';

import { servePorts, type PortHost } from '../worker/WorkerPorts';
import { provide, type ChannelSource, ProvidedChannel } from './provide';
import type { ChannelPort } from './ChannelProtocol';
import type { ChannelToken, Command, CommandMap } from './ChannelToken';

/**
 * One channel a worker offers: its token and what feeds it.
 *
 * Types erased structurally, for the same reason `ChannelRegistration`
 * erases them — a list of channels has no single generic
 * instantiation, and making every caller cast to reach one is worse
 * than describing what is actually needed.
 */
export interface ServedChannel {
  token: { name: string; initial: object };
  source: {
    view: Record<string, Observable<unknown>>;
    commands?: Record<string, Command>;
  };
}

/**
 * Publishes channels from an application worker.
 *
 * Call it synchronously at the top level of the worker module, before
 * any await, so no handshake is missed:
 *
 *   const catalog = new CatalogViewModel(new CatalogDomain(new OpfsStore()));
 *   serveChannels([
 *     { token: Catalog, source: { view: { products: catalog.products$ }, commands: { … } } }
 *   ]);
 *
 * Everything above this call is the application's own — plain classes,
 * plain observables, no framework import. This function is the entire
 * seam between it and the view.
 *
 * Returns a function that stops serving and disposes what it provided.
 */
export function serveChannels(channels: readonly ServedChannel[], host?: PortHost): () => void {
  const byName = new Map<string, ServedChannel>();
  for (const served of channels) {
    byName.set(served.token.name, served);
  }
  const provided: ProvidedChannel[] = [];

  const stop = servePorts(
    (key, port) => {
      const served = byName.get(key);
      if (served === undefined) {
        // Declined rather than answered, so a worker serving more than
        // one kind of thing can pass the handshake along. `servePorts`
        // reports it if nothing takes it.
        return false;
      }
      provided.push(
        provide(
          served.token as ChannelToken<object, CommandMap>,
          served.source as unknown as ChannelSource<object, CommandMap>,
          port as unknown as ChannelPort
        )
      );
      return true;
    },
    () => [...byName.keys()],
    host
  );

  return () => {
    stop();
    for (const channel of provided) {
      channel.dispose();
    }
    provided.length = 0;
  };
}
