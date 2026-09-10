/**
 * The main process: the application's state, and the windows that
 * replicate it.
 *
 * Nothing about a component, a layout or a pixel appears in this file,
 * and nothing about a window appears in the render worker. What the
 * two sides share is the channel token in `src/shared/Counter.ts`.
 *
 * A second window is free: `createDesktopApp` serves the same
 * observables to every window it opens, each with its own record of
 * what that window has already seen, so two windows agree by
 * construction rather than by synchronising.
 */
import { BrowserView, BrowserWindow, Utils } from 'electrobun/main';
import { BehaviorSubject, map } from 'rxjs';

import type { GessoFrame } from '@gesso/electrobun';
import { createDesktopApp, windowsChannel } from '@gesso/electrobun/desktop';

import { Counter } from '../shared/Counter';
import type { GessoWindowRPC } from '../shared/rpc';

/** The application's whole state, in the process that owns it. */
const count = new BehaviorSubject(0);

/**
 * The appearance every window is told about.
 *
 * The application owns it because Electrobun has no appearance API,
 * and because the webview's own `prefers-color-scheme` is wrong on
 * WebKitGTK. On a platform that has a signal this is where it would be
 * fed from; here it is a setting, which is a perfectly good source.
 */
const dark = new BehaviorSubject(true);

const app = createDesktopApp({
  channels: window => [
    {
      token: Counter,
      source: {
        view: { count, dark },
        commands: {
          increment: (by: number) => count.next(count.value + by),
          setDark: (next: boolean) => dark.next(next)
        }
      }
    },
    // What a window opens another window through. Without it a screen
    // would have to import this adapter to do it.
    windowsChannel(app, window)
  ],
  open: (receive, handle) => {
    const rpc = BrowserView.defineRPC<GessoWindowRPC>({
      maxRequestTime: 30_000,
      handlers: {
        requests: {},
        // Wired before the window exists, because the first handshake
        // arrives as soon as the page loads and a lost handshake is a
        // window that never replicates anything.
        messages: { gessoFrame: (frame: GessoFrame) => receive(frame) }
      }
    });
    const window = new BrowserWindow({
      title: '{{name}}',
      url: 'views://mainview/index.html',
      frame: { width: 460, height: 360, x: 100 + handle.id * 60, y: 120 + handle.id * 40 },
      rpc
    });
    return {
      send: (frame: GessoFrame) => window.webview.rpc?.send.gessoFrame(frame),
      close: () => window.close()
    };
  },
  colorScheme: dark.pipe(map(on => (on ? 'dark' : 'light'))),
  onOpenUrl: url => {
    // The application decides what it is willing to hand to the
    // operating system; the adapter only carries the request.
    if (url.startsWith('https://')) {
      Utils.openExternal(url);
    }
  },
  onLastWindowClosed: () => {
    // A desktop application usually stops here. One with a tray or a
    // menu bar would not, which is why this is a callback and not an
    // exit the adapter takes on its own.
    process.exit(0);
  }
});

app.openWindow();
