import type { PageMessage, PanelMessage, PanelPort } from '@gesso/devtools';
import { PANEL_PORT, type FromPanel, type ToPanel } from './relay';

/**
 * The panel's end of the relay, as the `PanelPort` the shared panel
 * expects.
 *
 * Two things the shared panel must not have to know are handled here:
 * that the port has to introduce itself with the inspected tab, and
 * that the connection is not for life. A background service worker is
 * stopped when idle and every port with it drops; the page reloads and
 * its content script is a new one. On either, this reconnects and
 * greets the page again, so the panel above it sees a page that went
 * away and came back, which is what happened.
 */

/** What this needs from `chrome.runtime.Port`, for a spec to fake. */
export interface RuntimePort {
  postMessage(message: unknown): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
  disconnect(): void;
}

export interface ExtensionPortOptions {
  /** `chrome.runtime.connect({ name })`, or a spec's stand-in. */
  readonly connect: (name: string) => RuntimePort;
  readonly tabId: number;
  /** How long to wait before reconnecting after a disconnect. Default 250 ms. */
  readonly retryMs?: number;
  readonly setTimeout?: (callback: () => void, ms: number) => unknown;
}

export function extensionPanelPort(options: ExtensionPortOptions): PanelPort {
  const retryMs = options.retryMs ?? 250;
  const schedule = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
  const listeners = new Set<(message: PageMessage) => void>();
  let port: RuntimePort | null = null;
  let open = true;

  const deliver = (message: PageMessage): void => {
    for (const listener of Array.from(listeners)) {
      listener(message);
    }
  };

  const connect = (): void => {
    if (!open) {
      return;
    }
    const next = options.connect(PANEL_PORT);
    port = next;
    next.postMessage({ type: 'gesso:init', tabId: options.tabId } satisfies FromPanel);
    next.onMessage.addListener(raw => {
      const message = raw as ToPanel;
      if (message.type === 'gesso:page-ready') {
        // The page (re)appeared: ask it what it has, on the panel's behalf.
        next.postMessage({ type: 'hello' } satisfies PanelMessage);
        return;
      }
      deliver(message);
    });
    next.onDisconnect.addListener(() => {
      if (port !== next) {
        return;
      }
      port = null;
      if (open) {
        // Whatever was connected is unreachable until the relay is back.
        deliver({ type: 'apps', apps: [] });
        schedule(connect, retryMs);
      }
    });
  };
  connect();

  return {
    post(message) {
      port?.postMessage(message);
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      open = false;
      listeners.clear();
      port?.disconnect();
      port = null;
    }
  };
}
