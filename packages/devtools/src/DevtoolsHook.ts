import type { DevtoolsEvent, DevtoolsRequest } from 'gesso-framework';
import { forwardNewEntries, type ActionLog } from './ActionLog';
import type { DevtoolsPicker } from './NodePicker';
import {
  windowPagePort,
  type DevtoolsAppInfo,
  type PagePort,
  type PanelMessage,
  type WindowLike
} from './PanelProtocol';

/**
 * The page's side of the devtools panel.
 *
 * One object per page, kept on the window under a well-known name the
 * way React's devtools hook is, so that several bundles (a docs site's
 * examples, an application and its dependency) connect to the same
 * hook and a panel sees one list. Applications register with it;
 * panels attach ports to it; the hook routes requests to the right
 * application and fans every application's events out to every port.
 *
 * `connectDevtools(app)` is the one line an application adds. It also
 * installs the `window.postMessage` transport the first time, which is
 * how a browser extension's content script finds the page: nothing is
 * running in a page that has not connected, and a page that has
 * connected answers `hello`.
 */

/** What an application must offer: both `WorkerApp` and `GessoApp` do. */
export interface DevtoolsApp {
  devtools(request: DevtoolsRequest): void;
  /**
   * Taken over by the hook while connected. An application that was
   * listening to its own devtools events has to choose: the panel or
   * itself. In practice the events only exist for panels.
   */
  onDevtools(listener: ((event: DevtoolsEvent) => void) | null): void;
}

export interface ConnectDevtoolsOptions {
  /** What the panel calls this application. Default: the document title, else `app`. */
  readonly name?: string;
  /**
   * A store action log the panel should show alongside. The log stays
   * where it is (it taps ports in the page); the panel is sent each
   * entry as it is recorded.
   */
  readonly actions?: ActionLog;
  /**
   * Lets the panel pick a node by clicking the canvas.
   *
   * The page's half of picking, because a click has to be taken before
   * the application sees it and only the page has it in time. See
   * `createNodePicker`.
   */
  readonly picker?: DevtoolsPicker;
  /**
   * Where the hook lives and where the `postMessage` transport
   * listens. Default: the global window. `null` keeps the hook off any
   * window and installs no transport, for a panel mounted directly.
   */
  readonly window?: (WindowLike & HookHost) | null;
}

export interface DevtoolsHook {
  /** The connected applications, in the order they connected. */
  readonly apps: readonly DevtoolsAppInfo[];
  /** Connects an application. Returns a function that disconnects it. */
  register(app: DevtoolsApp, options?: Omit<ConnectDevtoolsOptions, 'window'>): () => void;
  /** Attaches a panel's port. Returns a function that detaches it. */
  attach(port: PagePort): () => void;
}

/** The property the hook is kept under. */
export const HOOK_PROPERTY = '__GESSO_DEVTOOLS__';

/** A window, as far as the hook is concerned: somewhere to keep itself. */
export interface HookHost {
  [HOOK_PROPERTY]?: DevtoolsHook;
}

interface Registered {
  readonly info: DevtoolsAppInfo;
  readonly app: DevtoolsApp;
  readonly picker: DevtoolsPicker | undefined;
  readonly release: () => void;
}

/**
 * The page's hook, created on first use.
 *
 * With a window, the hook is stored on it and the `postMessage`
 * transport is attached once; without one (`null`), a fresh hook with
 * no transport, for specs and for a panel in the same page.
 */
export function getDevtoolsHook(win: (WindowLike & HookHost) | null = defaultWindow()): DevtoolsHook {
  if (win === null) {
    return createHook();
  }
  const existing = win[HOOK_PROPERTY];
  if (existing !== undefined) {
    return existing;
  }
  const hook = createHook();
  win[HOOK_PROPERTY] = hook;
  hook.attach(windowPagePort(win));
  return hook;
}

/**
 * Connects an application to the page's devtools hook, so a panel can
 * find it. Returns a function that disconnects it; call it when the
 * application is disposed.
 */
export function connectDevtools(app: DevtoolsApp, options: ConnectDevtoolsOptions = {}): () => void {
  const { window: win, ...rest } = options;
  return getDevtoolsHook(win).register(app, rest);
}

function createHook(): DevtoolsHook {
  const registered = new Map<string, Registered>();
  const ports = new Set<PagePort>();
  let nextId = 1;

  const infos = (): DevtoolsAppInfo[] => [...registered.values()].map(entry => entry.info);
  const broadcast = (message: Parameters<PagePort['post']>[0]): void => {
    for (const port of Array.from(ports)) {
      port.post(message);
    }
  };

  const handle = (message: PanelMessage, from: PagePort): void => {
    if (message.type === 'hello') {
      from.post({ type: 'apps', apps: infos() });
      return;
    }
    if (message.type === 'pick') {
      // An application registered without a picker simply cannot be
      // picked from; the panel's toggle then does nothing, which is
      // better than the panel refusing to show the toggle to some
      // applications and not others.
      registered.get(message.app)?.picker?.setEnabled(message.enabled);
      return;
    }
    // A request for an application that has gone is dropped: the panel
    // has been sent the new list and will catch up.
    registered.get(message.app)?.app.devtools(message.request);
  };

  return {
    get apps() {
      return infos();
    },
    register(app, options = {}) {
      const id = `app-${nextId++}`;
      const info: DevtoolsAppInfo = { id, name: options.name ?? defaultName() };
      app.onDevtools(event => broadcast({ type: 'event', app: id, event }));
      const stopActions = forwardActions(options.actions, entry => broadcast({ type: 'action', app: id, entry }));
      const picker = options.picker;
      picker?.onPick(picked => broadcast({ type: 'picked', app: id, id: picked }));
      const release = (): void => {
        app.onDevtools(null);
        stopActions();
        picker?.onPick(null);
        picker?.setEnabled(false);
      };
      registered.set(id, { info, app, picker, release });
      broadcast({ type: 'apps', apps: infos() });
      return () => {
        const entry = registered.get(id);
        if (entry === undefined) {
          return;
        }
        registered.delete(id);
        entry.release();
        broadcast({ type: 'apps', apps: infos() });
      };
    },
    attach(port) {
      ports.add(port);
      const stop = port.onMessage(message => handle(message, port));
      return () => {
        stop();
        ports.delete(port);
      };
    }
  };
}

/** Sends each new action log entry as it is recorded, when there is a log to read. */
function forwardActions(log: ActionLog | undefined, send: (entry: ActionLog['entries'][number]) => void): () => void {
  return log === undefined ? () => {} : forwardNewEntries(log, send);
}

function defaultWindow(): (WindowLike & HookHost) | null {
  return typeof window === 'undefined' ? null : (window as unknown as WindowLike & HookHost);
}

function defaultName(): string {
  if (typeof document !== 'undefined' && document.title !== '') {
    return document.title;
  }
  return 'app';
}
