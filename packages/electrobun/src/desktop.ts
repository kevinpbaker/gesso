/**
 * An application in the main process: windows, and the channels each
 * one is served.
 *
 * Nothing here imports Electrobun, and that is not fastidiousness. The
 * SDK is projected into a project by Hutch rather than installed from
 * a registry (`decisions/0070-electrobun-spike.md`), so a package in
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
 *     open: receive => {
 *       const rpc = BrowserView.defineRPC<GessoWindowRPC>({
 *         handlers: { requests: {}, messages: { gessoFrame: receive } }
 *       });
 *       const window = new BrowserWindow({ title: 'Notes', url: 'views://mainview/index.html', rpc });
 *       return {
 *         send: frame => window.webview.rpc.send.gessoFrame(frame),
 *         close: () => window.close()
 *       };
 *     }
 *   });
 *   app.openWindow();
 *
 * The arrangement it buys is the one `ROADMAP.md` §4 promises: every
 * window is a replica of the same channels, so two windows agree by
 * construction rather than by synchronisation.
 */
import { channel, type ChannelToken, type ServedChannel } from '@gesso/framework';
import { BehaviorSubject, type Observable } from 'rxjs';

import type { GessoFrame } from './frames';
import { serveChannelsToWindow, type ChannelHost } from './main';

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
  /** Closes the window and disposes the channels it was served. */
  close(): void;
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
   */
  open: (receive: (frame: GessoFrame) => void, window: DesktopWindowHandle) => DesktopWindowTransport;
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
  /** Opens a window, serves it every channel, and returns its handle. */
  openWindow(): DesktopWindowHandle;
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
    openWindow(): DesktopWindowHandle {
      if (disposed) {
        throw new Error('This desktop application has been disposed; it cannot open a window.');
      }
      const id = nextId++;
      const handle: DesktopWindowHandle = {
        id,
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
          chunkBytes: options.chunkBytes
        }
      );
      entries.set(id, { handle, transport: { send: () => {}, close: () => {} }, host });
      order.push(handle);

      transport = options.open(frame => host.receive(frame), handle);
      entries.set(id, { handle, transport, host });
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
 * from importing an adapter. `ROADMAP.md` §4's "native menus bound to
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
