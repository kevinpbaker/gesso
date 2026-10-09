/**
 * An application in the main process: windows, and the channels each
 * one is served.
 *
 * Nothing here imports Electrobun, and that is not fastidiousness. The
 * SDK is projected into a project by Hutch rather than installed from
 * a registry, so a package in
 * this workspace could not import it even if it wanted to. What the
 * application supplies instead is one function that opens a window,
 * which is the only Electrobun-shaped thing this needs, and which is
 * five lines at the call site:
 *
 *   const app = createDesktopApp({
 *     channels: window => [
 *       { token: Catalogue, source: catalogue },
 *       windowsChannel(app, window)
 *     ],
 *     open: (receive, handle) => {
 *       const rpc = BrowserView.defineRPC<GessoWindowRPC>({
 *         handlers: { requests: {}, messages: { gessoFrame: receive } }
 *       });
 *       const window = new BrowserWindow({
 *         title: 'Notes',
 *         url: withWindowRoute('views://mainview/index.html', handle.route),
 *         rpc
 *       });
 *       return {
 *         send: frame => window.webview.rpc.send.gessoFrame(frame),
 *         close: () => window.close()
 *       };
 *     }
 *   });
 *   app.openWindow();
 *
 * The arrangement it buys: every
 * window is a replica of the same channels, so two windows agree by
 * construction rather than by synchronisation.
 */
import { channel, type ChannelToken, type ServedChannel } from 'gesso-framework';
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';

import type { GessoFrame } from './frames';
import { serveChannelsToWindow, type ChannelHost } from './main';

export { withWindowRoute } from './route';

/** What the application does with the window it opened. */
export interface DesktopWindowTransport {
  /** Sends one frame to this window, over its own RPC. */
  send: (frame: GessoFrame) => void;
  /** Closes the native window. The adapter calls this; the platform may also close it on its own. */
  close: () => void;
}

/** A window this application opened. */
export interface DesktopWindowHandle {
  /** Stable for the life of the window, and never reused. */
  readonly id: number;
  /**
   * The application url the window was asked to open at, or null for
   * wherever the application starts.
   *
   * Set by `openWindow({ route })`, which is what a Cmd-click on an
   * in-app link comes to by default. The window cannot be told it
   * through a frame in time to start there, so `open` puts it on the
   * view's url, with `withWindowRoute`, and the window reads it back
   * with `windowRoute` before its shell starts.
   */
  readonly route: string | null;
  /** Closes the window and disposes the channels it was served. */
  close(): void;
}

/** What `openWindow` may be told about the window it opens. */
export interface DesktopWindowOptions {
  /**
   * The application url to open at, `/epic/BUD-12?story=BUD-13`. Carried
   * to `open` as `window.route`; see `DesktopWindowHandle.route`.
   */
  readonly route?: string;
}

export interface DesktopAppOptions {
  /**
   * The channels each window is served.
   *
   * A function when a window needs a channel of its own, which is what
   * `windowsChannel` uses to give a window a way to close itself. It
   * is called once per window, and the observables it returns are
   * ordinarily the same ones every time: `provide` keeps a separate
   * record of what each client has seen, so sharing a source between
   * windows is what makes them agree.
   */
  channels: readonly ServedChannel[] | ((window: DesktopWindowHandle) => readonly ServedChannel[]);
  /**
   * Opens a native window.
   *
   * `receive` is what the window's frames must be fed into: wire it to
   * the RPC message the window sends frames on, before the window
   * opens, or the first handshake is lost.
   *
   * `window.route` is the application url the window should start at,
   * or null. Put it on the view's url with `withWindowRoute`, and read
   * it in the window with `windowRoute`; an `open` that ignores it
   * opens every window at the application's start, as before.
   */
  open: (receive: (frame: GessoFrame) => void, window: DesktopWindowHandle) => DesktopWindowTransport;
  /**
   * A url a window asked to have opened outside itself, with the
   * window that asked. `Utils.openExternal(url)` is what an Electrobun
   * application passes here.
   */
  onOpenUrl?: (url: string, window: DesktopWindowHandle) => void;
  /**
   * One of the application's own urls a window asked to have opened
   * somewhere new (a Cmd-click or a Ctrl-click on an in-app link), with
   * the window that asked.
   *
   * Defaults to `app.openWindow({ route: url })`: a new window of this
   * application, at that route, which is what a new tab is in an
   * application whose windows have none. An outbound url never comes
   * here; it is `onOpenUrl`'s, and goes to the person's browser.
   */
  onOpenRoute?: (url: string, window: DesktopWindowHandle) => void;
  /**
   * The appearance the platform is in, pushed to every window as it
   * changes and to a new window as it opens.
   *
   * The application supplies it because Electrobun does not: its SDK
   * has no appearance API at all, and the webview's own
   * `prefers-color-scheme` is wrong on WebKitGTK
   *. On a platform that has a
   * signal, this is where it goes; on one that does not, an
   * application setting is a perfectly good source.
   */
  colorScheme?: Observable<'light' | 'dark'>;
  /**
   * Called when the last window closes. A desktop application usually
   * stops here; one with a tray or a menu bar does not, which is why
   * this is a callback rather than an exit.
   */
  onLastWindowClosed?: () => void;
  /** Overrides the frame size messages are split at. Only a test should need to. */
  chunkBytes?: number;
}

export interface DesktopApp {
  /**
   * Opens a window, serves it every channel, and returns its handle;
   * at `options.route` when one is given.
   */
  openWindow(options?: DesktopWindowOptions): DesktopWindowHandle;
  /** The windows open now, in the order they were opened. */
  readonly windows: readonly DesktopWindowHandle[];
  /** How many windows are open, as something a channel can publish. */
  readonly windowCount: Observable<number>;
  /** Closes every window and stops serving. */
  dispose(): void;
}

export function createDesktopApp(options: DesktopAppOptions): DesktopApp {
  interface Entry {
    handle: DesktopWindowHandle;
    transport: DesktopWindowTransport;
    host: ChannelHost;
  }
  const entries = new Map<number, Entry>();
  /** One appearance subscription per window, ended when it closes. */
  const subscriptions = new Map<number, Subscription>();
  const order: DesktopWindowHandle[] = [];
  const count = new BehaviorSubject(0);
  let nextId = 1;
  let disposed = false;

  const forget = (id: number, closeNative: boolean): void => {
    const entry = entries.get(id);
    if (entry === undefined) {
      return;
    }
    entries.delete(id);
    subscriptions.get(id)?.unsubscribe();
    subscriptions.delete(id);
    const at = order.indexOf(entry.handle);
    if (at >= 0) {
      order.splice(at, 1);
    }
    entry.host.dispose();
    if (closeNative) {
      entry.transport.close();
    }
    count.next(order.length);
    if (order.length === 0 && !disposed) {
      options.onLastWindowClosed?.();
    }
  };

  const app: DesktopApp = {
    openWindow(windowOptions: DesktopWindowOptions = {}): DesktopWindowHandle {
      if (disposed) {
        throw new Error('This desktop application has been disposed; it cannot open a window.');
      }
      const id = nextId++;
      const handle: DesktopWindowHandle = {
        id,
        route: windowOptions.route ?? null,
        close: () => forget(id, true)
      };

      // The host exists before the window does, because `open` may
      // deliver a frame synchronously and a window whose first
      // handshake was dropped never replicates anything.
      let transport: DesktopWindowTransport | undefined;
      const host = serveChannelsToWindow(
        typeof options.channels === 'function' ? options.channels(handle) : options.channels,
        {
          send: frame => transport?.send(frame),
          chunkBytes: options.chunkBytes,
          onOpenUrl: url => options.onOpenUrl?.(url, handle),
          onOpenRoute: url => {
            if (options.onOpenRoute !== undefined) {
              options.onOpenRoute(url, handle);
            } else if (!disposed) {
              app.openWindow({ route: url });
            }
          }
        }
      );
      entries.set(id, { handle, transport: { send: () => {}, close: () => {} }, host });
      order.push(handle);

      // Anything pushed before the window has spoken is lost: a
      // webview's RPC is not listening until its page has loaded, and
      // the window opens well before that. Channels do not notice,
      // because a channel starts with the window asking. The
      // appearance is the one thing this side sends first, so it waits
      // for the window's first frame, whatever that frame is. A native
      // window found this; a spec with a transport that was live
      // immediately could not.
      let greeted = false;
      let latest: 'light' | 'dark' | undefined;
      transport = options.open(frame => {
        if (!greeted) {
          greeted = true;
          if (latest !== undefined) {
            host.setColorScheme(latest);
          }
        }
        host.receive(frame);
      }, handle);
      entries.set(id, { handle, transport, host });
      const appearance = options.colorScheme?.subscribe(scheme => {
        latest = scheme;
        if (greeted) {
          host.setColorScheme(scheme);
        }
      });
      if (appearance !== undefined) {
        subscriptions.set(id, appearance);
      }
      count.next(order.length);
      return handle;
    },
    get windows(): readonly DesktopWindowHandle[] {
      return [...order];
    },
    windowCount: count.asObservable(),
    dispose(): void {
      disposed = true;
      for (const id of new Set(entries.keys())) {
        forget(id, true);
      }
      count.complete();
    }
  };

  return app;
}

/** What a window can see and do about the windows of its application. */
export interface DesktopWindowsView {
  /** How many windows this application has open. */
  count: number;
  /** Which one this is, so a screen can say "window 2 of 3" without asking. */
  id: number;
}

export interface DesktopWindowsCommands {
  open: () => void;
  closeThis: () => void;
}

/**
 * The channel a window opens another window through.
 *
 * It exists because opening a window is the one native act a screen
 * genuinely needs, and going through a channel keeps the view layer
 * from importing an adapter. the "native menus bound to
 * store actions" is the same idea from the other end, and on Linux it
 * is the only end: the runtime has no application menus there, so a
 * menu is a component and this is what it calls.
 */
export const DesktopWindows: ChannelToken<DesktopWindowsView, DesktopWindowsCommands> = channel<
  DesktopWindowsView,
  DesktopWindowsCommands
>('gesso:windows', { count: 0, id: 0 });

/** Serves `DesktopWindows` to one window. Put it in `channels`. */
export function windowsChannel(app: DesktopApp, window: DesktopWindowHandle): ServedChannel {
  return {
    token: DesktopWindows,
    source: {
      view: {
        count: app.windowCount,
        id: new BehaviorSubject(window.id)
      },
      commands: {
        open: () => {
          app.openWindow();
        },
        closeThis: () => {
          window.close();
        }
      }
    }
  };
}

export { createScreenAgent, type ScreenAgent } from './screen';
export {
  messageBoxConfirm,
  serveDesktopAgent,
  type DesktopAgent,
  type DesktopAgentOptions,
  type DesktopServe,
  type ShowMessageBox
} from './agent';

/** One item of an application menu, in the shape Electrobun's `ApplicationMenu.setApplicationMenu` takes. */
export type MenuItem =
  | { type: 'divider' }
  | { label?: string; role?: string; action?: string; accelerator?: string; submenu?: MenuItem[] };

/**
 * The menu every macOS application is expected to have, for
 * `ApplicationMenu.setApplicationMenu` from `electrobun/main`:
 *
 * ```ts
 * ApplicationMenu.setApplicationMenu(standardMenu('My App'));
 * ```
 *
 * Without an Edit menu, macOS sends ⌘V, ⌘C, ⌘X, ⌘A and ⌘Z nowhere, and
 * a text field in the window cannot be pasted into or copied from:
 * keys a person expects to work, and does not think to blame the app's
 * menu for. Each item here is a role, which macOS hands to whatever has
 * focus, so they reach Gesso's text editing as the keyboard would. The
 * application menu brings ⌘Q and ⌘H, and the Window menu ⌘M.
 *
 * `extra` goes after the Edit menu: an application's own menus.
 */
export function standardMenu(appName: string, extra: readonly MenuItem[] = []): MenuItem[] {
  return [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'divider' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'showAll' },
        { type: 'divider' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'divider' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    ...extra,
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'divider' }, { role: 'bringAllToFront' }]
    }
  ];
}
