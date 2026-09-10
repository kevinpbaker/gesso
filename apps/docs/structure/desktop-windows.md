---
description: 'Running a Gesso application in an Electrobun window: the state in the main process, a webview per window, and what the transport between them costs.'
---

# Desktop windows

A Gesso application in a desktop window is the same application.
Components, layout, hit-testing and paint are in a render worker,
exactly as they are on the web. What changes is where the other half
lives: `@gesso/electrobun` puts the application layer in the native
main process, so an application's data, its files and its background
work run in the process that owns the windows rather than inside one
of them.

Nothing in [channels and the barrier](/structure/channels-and-the-barrier)
changes for this. A channel is still a token, view keys in, typed
commands out, and a screen cannot tell whether the other end of its
replica is a worker in the same page or a process outside the window.
That is the claim this page is about, and the reason a port to the
desktop was a transport rather than a rewrite.

```
main process (Cottontail or Bun)     window 1                window 2
  the store, the files            shell + render worker   shell + render worker
  Notes channel            ──▶    replica ──▶ screen      replica ──▶ screen
  DesktopWindows channel   ◀──    commands                commands
```

## What runs where

| Thread                       | Owns                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Main process**             | The application layer: api, files, domain and view models, published as channels. And the windows.        |
| **A window's main thread**   | The bridge, and nothing else. It carries frames it does not read, plus the canvas and the shell's own job |
| **A window's render worker** | Components, cells, layout, focus, gestures, text, paint. One per window                                   |

The window's main thread is the part worth looking at twice. On the
web it is the shell described in [workers](/guide/workers): the canvas,
input forwarding, the editing proxy, the accessibility mirror. In a
desktop window it does all of that and one more thing, and the one more
thing is deliberately dull. It takes the port handshakes the render
worker sends and pumps each one over Electrobun's RPC as a numbered
stream, serializing a value it never looks inside.

**The pump never reads a message body.** No differ on that thread, no
patch inspection, no knowledge of what a channel is. It is the rule the
implementation is written against, and it is what keeps a webview's
main thread a transport rather than the application's router.

## The package, in four entries

| Import                      | Runs where              | Holds                                           |
| --------------------------- | ----------------------- | ----------------------------------------------- |
| `@gesso/electrobun`         | both                    | `GessoFrame`, the wire format, and nothing else |
| `@gesso/electrobun/view`    | a webview's main thread | `createElectrobunBridge`                        |
| `@gesso/electrobun/main`    | the main process        | `serveChannelsToWindow`                         |
| `@gesso/electrobun/desktop` | the main process        | `createDesktopApp`, `windowsChannel`            |

They are separate entries because the halves have opposite dependencies
and neither should be able to import the other's. Four frame kinds
cross between them: `open` says a named channel wants a stream, `data`
carries one channel message, `close` ends a stream, and `control` is
the adapter's own traffic, which is the appearance and an external url.

**The package imports nothing from Electrobun.** The SDK is projected
into a project by its toolchain rather than installed from a registry,
so an application passes in the two Electrobun-shaped things itself: a
`send` function per window, and a function that opens one. That is five
lines at the call site, and it is why every part of this can be
specified without a window.

## The four files

An Electrobun application is the same three files a worker application
has, plus one both processes import.

### The contract, which both processes import

```ts
// notes.contract.ts
import { channel } from '@gesso/framework';

export interface NoteSummary {
  id: string;
  title: string;
  excerpt: string;
}

export interface NotesView {
  notes: NoteSummary[];
  selectedId: string | null;
}

export interface NotesCommands {
  create: () => void;
  select: (id: string | null) => void;
}

export const Notes = channel<NotesView, NotesCommands>('notes', { notes: [], selectedId: null });
```

This is the whole of what the two processes share: names, shapes and
defaults, with no framework type above it and no window below it. The
store behind it is plain classes and plain observables, and it can read
files, open a socket and hold a connection pool, because it is in a
process that has all of those.

There is one shared type more, and it is Electrobun's rather than
Gesso's. The RPC is declared against a schema both sides name:

```ts
// rpc.ts
import type { RPCSchema } from 'electrobun/view';
import type { GessoFrame } from '@gesso/electrobun';

export type GessoWindowRPC = {
  bun: RPCSchema<{
    requests: Record<string, never>;
    messages: { gessoFrame: GessoFrame };
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: { gessoFrame: GessoFrame };
  }>;
};
```

One message, both directions, and no requests. A patch expects no
answer and a command expects no answer, so making either a request
would put a timeout on a stream that is meant to run for the life of
the window.

### The main process

```ts
// main/index.ts
import { BrowserView, BrowserWindow, Utils } from 'electrobun/main';
import type { GessoFrame } from '@gesso/electrobun';
import { createDesktopApp, windowsChannel } from '@gesso/electrobun/desktop';

import { Notes } from '../shared/notes.contract';
import type { GessoWindowRPC } from '../shared/rpc';

const app = createDesktopApp({
  channels: window => [{ token: Notes, source: notesSource(store, window) }, windowsChannel(app, window)],
  open: (receive, handle) => {
    const rpc = BrowserView.defineRPC<GessoWindowRPC>({
      maxRequestTime: 30_000,
      handlers: {
        requests: {},
        messages: { gessoFrame: (frame: GessoFrame) => receive(frame) }
      }
    });
    const window = new BrowserWindow({
      title: 'Notes',
      url: 'views://mainview/index.html',
      frame: { width: 980, height: 660, x: 90 + handle.id * 40, y: 90 + handle.id * 40 },
      rpc
    });
    return {
      send: (frame: GessoFrame) => window.webview.rpc?.send.gessoFrame(frame),
      close: () => window.close()
    };
  },
  onOpenUrl: url => {
    if (url.startsWith('https://')) {
      Utils.openExternal(url);
    }
  },
  onLastWindowClosed: () => process.exit(0)
});

app.openWindow();
```

`open` is the only Electrobun-shaped thing the adapter needs, and it
has one obligation: **wire `receive` to the RPC before the window
exists.** A window may deliver a frame the moment it is constructed,
and a window whose first handshake was dropped never replicates
anything.

`channels` is a function here rather than an array because each window
gets a selection of its own. It is called once per window, as the
window opens, which is why it can name `app` before `createDesktopApp`
has returned. The observables it hands back are ordinarily the same
ones every time, and that is the arrangement rather than an oversight:
sharing a source between windows is what makes them agree.

| On `DesktopApp` | Is                                                        |
| --------------- | --------------------------------------------------------- |
| `openWindow()`  | Opens a window, serves it every channel, returns a handle |
| `windows`       | The windows open now, in the order they were opened       |
| `windowCount`   | How many, as an `Observable` a channel can publish        |
| `dispose()`     | Closes every window and stops serving                     |

A `DesktopWindowHandle` is an `id` that is stable for the life of the
window and never reused, and a `close()`.

### The window's main thread

```ts
// view/main.ts
import type { GessoFrame } from '@gesso/electrobun';
import { createElectrobunBridge } from '@gesso/electrobun/view';
import { createApp } from '@gesso/framework';
import { Electroview } from 'electrobun/view';

import type { GessoWindowRPC } from '../shared/rpc';

const bridge = createElectrobunBridge({
  send: frame => view.rpc?.send.gessoFrame(frame),
  onColorScheme: scheme => shell.setColorScheme(scheme)
});

const rpc = Electroview.defineRPC<GessoWindowRPC>({
  maxRequestTime: 30_000,
  handlers: {
    requests: {},
    messages: { gessoFrame: (frame: GessoFrame) => bridge.receive(frame) }
  }
});
const view = new Electroview({ rpc });

const shell = createApp({
  renderWorker: () => new Worker(new URL('./app.render.worker.ts', import.meta.url), { type: 'module' }),
  appLogicWorker: bridge.endpoint,
  history: { mode: 'memory' },
  onOpenUrl: url => bridge.openUrl(url),
  onError: (message, stack, source) => console.error(`[gesso ${source}] ${message}`, stack)
});
shell.mount('#app');
```

`bridge.endpoint` goes where a second `new Worker(...)` goes on the
web. `appLogicWorker` takes an endpoint as well as a worker, and the
shell treats one exactly as it treats a worker it was handed rather
than one it spawned: it wires it up, and it never closes it.

The rest of the bridge is three methods. `receive(frame)` is what the
RPC handler feeds. `openUrl(url)` hands a url out to be opened outside
the window. `dispose()` closes every stream.

### The render worker

```ts
// app.render.worker.ts
import { DesktopWindows } from '@gesso/electrobun/desktop';
import { renderRoot } from '@gesso/framework';

import { Notes } from '../shared/notes.contract';
import { App } from './App';

renderRoot(App).useChannel(Notes).useChannel(DesktopWindows);
```

Unchanged from the web, apart from the one channel that is about
windows. The worker attaches to a channel by name and never learns that
the other end is in another process.

## Two windows, because each is a replica

Multi-window costs no code. `provide` already keeps a separate record
of what each client has been sent, so a second window is a second
handshake against the same observables: a second diff, and nothing
else. Two windows agree by construction rather than by anything
synchronising them, and a window that opens late is current rather than
replayed, because each client is seeded from what it has actually been
sent.

A window opens another window through a channel, so a component asks
for one the way it asks for anything else and no screen calls a native
API:

```ts
// in the main process, in the channels array
windowsChannel(app, window);
```

```tsx
// in a component, in the render worker
const windows = ctx.channel(DesktopWindows);

<Button label="New window" onPress={() => windows.send.open()} />;
```

`DesktopWindows` publishes `count`, so a screen can say "window 2 of
3" without asking, and `id`, which is this window's. Its commands are
`open()` and `closeThis()`.

Two windows over one set of data is the arrangement to design for, and
it brings one decision with it: **what is per window and what is per
application.** A selection, a search query and a scroll position belong
to the window, and the way to give a window its own is to build them in
the `channels` function, where the closure is already per window. The
data underneath is shared, so an edit in one window reaches the other's
list while its editor stays where the person left it.

## Serving a window yourself

`createDesktopApp` is the ordinary way in, and it is built on a smaller
one. `serveChannelsToWindow` serves a set of channels to one window and
knows nothing about opening or closing any:

```ts
import { serveChannelsToWindow } from '@gesso/electrobun/main';

const host = serveChannelsToWindow([{ token: Notes, source: notesSource(store) }], {
  send: frame => window.webview.rpc?.send.gessoFrame(frame),
  onOpenUrl: url => Utils.openExternal(url)
});
```

It returns `receive(frame)` for the RPC handler, `setColorScheme(scheme)`,
and `dispose()`. Reach for it when the windows are already something
else's business; otherwise `createDesktopApp` is the same thing with
the window bookkeeping done.

## Two things the platform is told, not asked

Both exist because a shell that believes it is in a browser gets them
wrong in a window, and both travel as a `control` frame rather than as
a channel, because they are the adapter's own traffic rather than an
application's data.

### The appearance

[Shell services](/structure/shell-services) reads `prefers-color-scheme`
through `matchMedia`, which is right on the web. In an Electrobun window
on WebKitGTK it reported light on a desktop that was in dark mode. So
the main process tells the window instead:

```ts
const appearance = new BehaviorSubject<'light' | 'dark'>('dark');

createDesktopApp({ colorScheme: appearance /* … */ });
```

The value is pushed to every window as it changes, and to a new window
as it opens. In the window it arrives as `onColorScheme`, and passing
it to `shell.setColorScheme` stops the shell watching the media query
and makes it report what it was told. Everything downstream of that,
the environment, the theme and [light and dark](/guide/appearance), is
unchanged.

**The application supplies the value, because Electrobun does not.**
Its SDK has no appearance API at all, so this is transport and not
detection. An application that can read the platform, through GTK
settings, a registry key or `NSApp.effectiveAppearance`, feeds it here.
One that cannot uses its own setting, which is a perfectly good source
and is what the demos do.

There is an ordering trap underneath this that the adapter handles for
you, and it is worth knowing about because it will bite anything else
you push. A webview's RPC is not listening until its page has loaded,
and the window opens well before that, so **anything the main process
sends before the window has spoken is lost.** Channels never notice,
because a channel begins with the window asking. `createDesktopApp`
holds the latest appearance and sends it when the window's first frame
arrives, whatever that frame is.

### A link that leaves the window

`window.open` in a webview opens another webview or nothing at all, and
a link in a desktop application belongs in the person's browser, which
only the process outside the window can reach. `ShellService.openUrl`
still works from a component; what changes is where it lands:

```ts
// in the window
createApp({ onOpenUrl: url => bridge.openUrl(url) /* … */ });

// in the main process
createDesktopApp({
  onOpenUrl: (url, window) => {
    if (url.startsWith('https://')) {
      Utils.openExternal(url);
    }
  }
});
```

**The adapter does not call `openExternal` itself.** Opening something
is an act, and which urls an application is willing to hand to the
operating system is the application's decision, so the request arrives
with the window that asked and stops there.

## Menus are a component, and the command is the shared thing

A native menu bound to the same handlers a command reaches is close to
free, and half of that idea holds up: a menu item in the main process
calls the handler a `channel:command` calls, so there is no second path
into an application and no menu-only code to keep in step. The other
half is not portable. **Linux has no application menus at all**, and
the runtime says so directly: menu UI there is built inside the window.
So the durable surface is the command rather than the menu. Build the
menu from the component library, bind it to the same commands, and add
a native menu on the platforms that have one, calling those same
handlers.

Only Linux and WebKitGTK have been run at all, which is the honest
statement of the whole platform surface and is repeated under Limits.

## Routing without an address bar

A window has no address bar, so its routes are its own:

```ts
createApp({ history: { mode: 'memory' } /* … */ });
```

`memory` mode is not degraded. The router keeps its own stack, `Back`
and `Forward` walk it, and nothing crosses to a window to ask.
[Routing](/structure/routing) has the three modes and what each costs.
A window that does want a url can have one: the adapter does not set
this, because the shell it configures is the application's.

## What the transport costs

Every message is `JSON.stringify`, then AES through WebCrypto, then a
WebSocket. Measured on WebKitGTK on Linux, on one machine, on one day:

| Measure                          | Result                           |
| -------------------------------- | -------------------------------- |
| A message there and back, 64 B   | 12 ms median, 10 best, 13 worst  |
| A typed request round trip, 64 B | 17 ms median                     |
| 500 messages of 200 B, one way   | 27,094 a second                  |
| 2,000 messages of 2 KiB          | 9,226 a second, 3.9 MiB          |
| 200 messages of 64 KiB           | 334 a second, 12.5 MiB           |
| One message of 4 MiB             | 282 ms, the largest seen to work |
| One message of 8 MiB             | never arrives                    |

Three things follow, and they are the three things to design against.

**Throughput is comfortable.** Roughly 18 to 22 MiB a second, and tens
of thousands of small messages a second. A patch stream is well inside
that, and a twenty-thousand-event burst is about a second of transport
rather than a wall.

**Latency is not, and this is the rule: never wait for a command in an
interaction path.** A round trip is about 12 ms as a message and about
17 ms as a typed request, which is a frame at 60 Hz spent doing
nothing. The channel protocol already refuses to give you something to
await, because a command is fire and forget and its effect comes back
as a patch. What that leaves is a design rule for everything you build
beside it: a press handler that opens a request of its own and waits
for the answer has spent a frame and a half before it can draw. A hover
highlight, a caret, a pressed state and a scroll offset stay in the
render worker, where they were always supposed to be, and a screen that
must show progress publishes a `status` key and binds to it. Patches
themselves are one way and pipelined, so they never pay the round trip.

**A single message above roughly 8 MiB fails, and it fails badly.** The
main process throws while draining, the message never arrives, and the
sender sees only a timeout with the real error in a log nobody is
reading. This is why the adapter chunks: a serialized message longer
than `DEFAULT_CHUNK_BYTES`, which is 1 MiB, is split by the sender and
reassembled by stream on the other side. A megabyte leaves eight times
the headroom and costs nothing at the rates above. Chunking is not
something an application turns on, and `chunkBytes` exists for tests.

## Building it

The application code above is the whole of what is Gesso's. The rest is
Electrobun's toolchain, and three details of it show up in a Gesso
project:

- **Assets are served from `views://`, and the render worker loads from
  there.** Vite emits the worker as its own chunk under `dist/assets`,
  the Electrobun config's `copy` rule maps `dist/index.html` and
  `dist/assets` into the bundle, and
  `new Worker(new URL('./app.render.worker.ts', import.meta.url), { type: 'module' })`
  resolves to `views://mainview/assets/...` and starts. No loopback
  HTTP server is needed. This was checked on WebKitGTK only.
- **The main process is pre-bundled** in this repository's own
  applications, because the toolchain projects the Electrobun SDK into
  a project rather than installing it, so a project's own module loader
  cannot resolve a workspace package. The config's entrypoint is the
  bundle. A project that depends on the packages from a registry needs
  none of this.
- **`bundleCEF` is off**, so a window is the platform's webview.
  WebKitGTK has no `navigator.gpu`, and the renderer's `auto` choice
  resolves to Canvas2D there without being told. See
  [Canvas2D and WebGPU](/rendering/canvas2d-and-webgpu) for what that
  changes, which is less than it sounds.

## Limits

- **Only Linux and WebKitGTK have been run.** Every number and every
  claim on this page comes from one engine, on one machine, on one day.
  macOS with WKWebView and Windows with WebView2 are unverified: not
  known to be broken, and not known to work. If you are building for
  those, treat the first window you open on each as the experiment it
  is.
- **Nothing here is checked by a gate.** Every automated check in this
  project drives headless Chrome, and nothing in CI can open a native
  window. The specs cover the wire format and the bridge end to end,
  including a channel replicating through both pumps, a message split
  and reassembled, and a window whose transport answers before the
  window exists. They say the seam is right. They cannot say a window
  works.
- **Resize is unresolved.** A window created asking for 460 by 360 came
  up with a 925 by 463 canvas, and a later `setSize` from the main
  process changed nothing the canvas could see. It is either the
  compositor ignoring the request or the webview never reporting the
  change, and nobody has yet sat in front of the window to find out.
  Device pixel ratio reported 1 throughout, which is correct for that
  display and says nothing about a scaled one.
- **`undefined` does not survive.** The transport is JSON with or
  without this adapter, and JSON drops it where structured clone would
  have carried it. Only plain data crosses a channel in any
  configuration; this narrows it by one value, and the shape to watch
  is a key whose value goes from present to `undefined`. Publish `null`
  and it crosses everywhere.
- **No sustained load has been measured.** Every figure above is a
  burst measured once. Nothing here says what an hour of patches does
  to memory or to the socket.
- **The application process has no console forwarding.** Errors thrown
  in the render worker reach `onError` as they do on the web. What the
  main process logs, it logs to its own output.

## Next

[create-gesso-app](/tooling/create-gesso-app) is the scaffold, and what
it does and does not generate today.
