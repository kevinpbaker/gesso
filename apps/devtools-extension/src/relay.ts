import type { PageMessage, PanelMessage } from 'gesso-devtools';

/**
 * The background service worker's one job: joining a tab's content
 * script to the devtools panels inspecting that tab.
 *
 * A content script and a devtools page cannot talk to each other
 * directly; both can talk to the extension's background, which is
 * therefore the switchboard. Ports arrive named: a `gesso-page` port
 * from a content script carries the tab it was injected into in its
 * sender; a `gesso-panel` port says which tab it inspects in its first
 * message, because a devtools page has no sender tab of its own.
 *
 * Written against `RelayPort` rather than `chrome.runtime.Port` so a
 * spec can run the whole exchange with plain objects.
 */

export const PAGE_PORT = 'gesso-page';
export const PANEL_PORT = 'gesso-panel';

/** A panel's first message: which tab it inspects. */
export interface PanelInit {
  readonly type: 'gesso:init';
  readonly tabId: number;
}

/**
 * Told to a panel when its tab's content script (re)connects, so the
 * panel greets the page again. Outside `PageMessage` on purpose: it is
 * the relay speaking, not the page.
 */
export interface PageReady {
  readonly type: 'gesso:page-ready';
}

export type ToPanel = PageMessage | PageReady;
export type FromPanel = PanelMessage | PanelInit;

/** What the relay needs from a port. `chrome.runtime.Port` has all of it. */
export interface RelayPort {
  readonly name: string;
  /** The tab a content script was injected into; absent for a devtools page. */
  readonly tabId?: number;
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
  onDisconnect(listener: () => void): void;
}

export interface Relay {
  /** Takes a newly connected port, of either kind. Anything else is ignored. */
  connect(port: RelayPort): void;
  /** For a spec: which tabs have a page, and how many panels each has. */
  readonly tabs: ReadonlyMap<number, { page: boolean; panels: number }>;
}

export function createRelay(): Relay {
  const pages = new Map<number, RelayPort>();
  const panels = new Map<number, Set<RelayPort>>();

  const panelsFor = (tabId: number): Set<RelayPort> => {
    let set = panels.get(tabId);
    if (set === undefined) {
      set = new Set();
      panels.set(tabId, set);
    }
    return set;
  };
  const tellPanels = (tabId: number, message: ToPanel): void => {
    for (const panel of panels.get(tabId) ?? []) {
      panel.postMessage(message);
    }
  };

  const connectPage = (port: RelayPort): void => {
    const tabId = port.tabId;
    if (tabId === undefined) {
      return;
    }
    // A reload replaces the content script; the old port is already
    // disconnecting or about to. The new one is the page now.
    pages.set(tabId, port);
    port.onMessage(message => tellPanels(tabId, message as PageMessage));
    port.onDisconnect(() => {
      if (pages.get(tabId) === port) {
        pages.delete(tabId);
        // The page is gone, so its applications are. The panel shows
        // nothing connected until the page comes back and says hello.
        tellPanels(tabId, { type: 'apps', apps: [] });
      }
    });
    tellPanels(tabId, { type: 'gesso:page-ready' });
  };

  const connectPanel = (port: RelayPort): void => {
    let tabId: number | undefined;
    port.onMessage(raw => {
      const message = raw as FromPanel;
      if (message.type === 'gesso:init') {
        tabId = message.tabId;
        panelsFor(tabId).add(port);
        // A page that is already there will not connect again; the
        // panel would wait forever for a ready that already happened.
        if (pages.has(tabId)) {
          port.postMessage({ type: 'gesso:page-ready' } satisfies PageReady);
        }
        return;
      }
      if (tabId === undefined) {
        return;
      }
      const page = pages.get(tabId);
      if (page === undefined) {
        // No content script in that tab: the extension was installed
        // after the tab loaded, or the page is one it cannot run in.
        // Answered rather than dropped, so the panel can say so.
        if (message.type === 'hello') {
          port.postMessage({ type: 'apps', apps: [] } satisfies PageMessage);
        }
        return;
      }
      page.postMessage(message);
    });
    port.onDisconnect(() => {
      if (tabId !== undefined) {
        panels.get(tabId)?.delete(port);
      }
    });
  };

  return {
    connect(port) {
      if (port.name === PAGE_PORT) {
        connectPage(port);
      } else if (port.name === PANEL_PORT) {
        connectPanel(port);
      }
    },
    get tabs() {
      const out = new Map<number, { page: boolean; panels: number }>();
      for (const tabId of new Set([...pages.keys(), ...panels.keys()])) {
        out.set(tabId, { page: pages.has(tabId), panels: panels.get(tabId)?.size ?? 0 });
      }
      return out;
    }
  };
}
