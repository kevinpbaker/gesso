import { serveChannels, type ServedChannel } from '../channel/serveChannels';
import { AGENT_PORT } from '../agent/remote';
import { isHubMessage, servePorts, type PortHost } from '../worker/WorkerPorts';
import type { AppLogicEndpoint } from '../app/worker/WorkerApp';

/** What `hostChannels` makes: the endpoint to hand the shell, and how to stop serving. */
export interface HostChannels {
  /** Pass as `appLogicWorker`. */
  readonly endpoint: AppLogicEndpoint;
  /** Stops serving, and disposes what was provided. Leaves `appLogic` running. */
  dispose(): void;
}

/**
 * Serves channels from the page that embeds an app, on its own main
 * thread, as the app's application layer.
 *
 * A page that already has its state, a React component's props say,
 * gives the app that state as a channel's view and takes its commands
 * as callbacks, with no application worker to write. The render worker
 * attaches to these channels by name exactly as it would to a worker's
 * and cannot tell the difference.
 *
 * With `appLogic` as well, the page serves the channels it names and
 * passes every other handshake on to that worker, so an app can keep
 * its data in a worker and take a filter from the page. An AI agent's
 * port goes to the worker in that case: its channels are the app's
 * data, and the page's are glue around it.
 *
 * Whatever crosses has to be plain data, as across any channel, and it
 * costs the page's thread a structural diff per change.
 */
export function hostChannels(channels: readonly ServedChannel[], appLogic?: AppLogicEndpoint): HostChannels {
  const host: PortHost = { onmessage: null };
  let toApp: MessagePort | null = null;
  const forward = (key: string, port: MessagePort): boolean => {
    if (appLogic === undefined) {
      return false;
    }
    if (toApp === null) {
      // The worker hears handshakes on a hub port, as it would from
      // the shell; `servePorts` routes them there.
      const hub = new MessageChannel();
      appLogic.postMessage({ type: 'gesso:hub' }, [hub.port2]);
      toApp = hub.port1;
    }
    toApp.postMessage({ type: 'gesso:port', key }, [port]);
    return true;
  };
  const names = (): readonly string[] => [];
  // Innermost first: what the page does not serve goes to the worker,
  // and only after the page's channels have declined it.
  const stops = [
    servePorts(forward, names, host),
    serveChannels(channels, host),
    servePorts((key, port) => key === AGENT_PORT && forward(key, port), names, host)
  ];

  const endpoint: AppLogicEndpoint = {
    postMessage(message: unknown, transfer?: Transferable[]): void {
      if (isHubMessage(message)) {
        host.onmessage?.({ data: message, ports: transfer as MessagePort[] | undefined });
      } else {
        // The shell's own messages to its application layer, a devtools
        // panel asking for the console, are the worker's to answer.
        appLogic?.postMessage(message, transfer);
      }
    },
    addEventListener: (type, listener) => appLogic?.addEventListener(type, listener),
    removeEventListener: (type, listener) => appLogic?.removeEventListener(type, listener),
    start: () => appLogic?.start?.(),
    colorSchemePreference: preference => appLogic?.colorSchemePreference?.(preference)
  };

  return {
    endpoint,
    dispose(): void {
      for (const stop of stops.reverse()) {
        stop();
      }
      stops.length = 0;
      toApp?.close();
      toApp = null;
    }
  };
}
