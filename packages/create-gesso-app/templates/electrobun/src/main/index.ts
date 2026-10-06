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

import type { GessoFrame } from 'gesso-electrobun';
import {
  createDesktopApp,
  messageBoxConfirm,
  serveDesktopAgent,
  windowsChannel,
  withWindowRoute
} from 'gesso-electrobun/desktop';
import { serve } from 'gesso-framework';

import { Counter } from '../shared/Counter';
// Describes the channels for agents. Written by `hutch run channels`.
import '../shared/channels.described';
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

/** The counter, served to every window and to AI agents alike. */
const counter = serve(Counter, {
  view: { count, dark },
  commands: {
    increment: (by: number) => count.next(count.value + by),
    setDark: (next: boolean) => dark.next(next)
  }
});

const app = createDesktopApp({
  channels: window => [
    counter,
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
      // The route a Cmd-click asked for, if any, for the window to
      // start at; see `windowRoute` in the view.
      url: withWindowRoute('views://mainview/index.html', handle.route),
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

/**
 * The same channel, served to AI agents over MCP on this machine.
 *
 * An agent such as Claude Code connects with the line this prints, then
 * reads the count and sends `increment` and `setDark` the way a window
 * does, and the windows follow. A command marked `@confirm` in the
 * contract is put to the person with the native dialog first.
 * `channels.described.ts`, imported above, is what tells the agent what
 * each command is for; `hutch run channels` rewrites it after a contract
 * changes, and every other script does so first.
 */
const agent = serveDesktopAgent([counter], {
  name: '{{name}}',
  confirm: messageBoxConfirm(Utils.showMessageBox)
});
console.log(`AI agents can connect: claude mcp add --transport http {{name}} ${agent.url}`);
