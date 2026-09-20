/**
 * The application in the main process, with a fake window opener in
 * place of Electrobun's.
 *
 * The exit criterion for E1.2 is about a native window, and a spec
 * cannot open one. What it can pin is everything the criterion is made
 * of: a second window opened from inside the application, two windows
 * agreeing because they replicate one source, one closing without
 * disturbing the other, and the last one closing being something the
 * application hears about.
 */
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { channel, ChannelReplica, portHandle, type ChannelPort, type ServedChannel } from 'gesso-framework';

import { createDesktopApp, DesktopWindows, windowsChannel, type DesktopApp, type DesktopWindowHandle } from './desktop';
import type { GessoFrame } from './frames';
import { createElectrobunBridge } from './view';
import type { ChannelHost } from './main';

interface CounterView {
  count: number;
}

interface CounterCommands {
  increment: () => void;
}

const Counter = channel<CounterView, CounterCommands>('counter', { count: 0 });

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/**
 * A window, as far as the adapter can tell: a bridge in place of the
 * webview, and a render worker attaching to whatever it asks for.
 */
function fakeWindow(receive: (frame: GessoFrame) => void): {
  send: (frame: GessoFrame) => void;
  close: () => void;
  attach: <View extends object, Commands extends object>(
    token: import('gesso-framework').ChannelToken<View, Commands>
  ) => ChannelReplica<View, Commands>;
  closed: () => boolean;
} {
  let closed = false;
  const bridge = createElectrobunBridge({ send: frame => receive(frame) });
  const hub = new MessageChannel();
  bridge.endpoint.postMessage({ type: 'gesso:hub' }, [hub.port2]);
  const handle = portHandle(hub.port1);
  return {
    send: frame => bridge.receive(frame),
    close: () => {
      closed = true;
      bridge.dispose();
    },
    attach: token => new ChannelReplica(token, handle.open(token.name) as unknown as ChannelPort),
    closed: () => closed
  };
}

/** Stands an application up with N windows, over one shared source. */
function standApp(extra?: (app: DesktopApp, window: DesktopWindowHandle) => ServedChannel[]): {
  app: DesktopApp;
  count: BehaviorSubject<number>;
  windows: ReturnType<typeof fakeWindow>[];
  lastClosed: () => number;
} {
  const count = new BehaviorSubject(0);
  const windows: ReturnType<typeof fakeWindow>[] = [];
  let lastClosed = 0;
  let app!: DesktopApp;
  app = createDesktopApp({
    channels: window => [
      {
        token: Counter,
        source: {
          view: { count },
          commands: { increment: () => count.next(count.value + 1) }
        }
      },
      ...(extra?.(app, window) ?? [])
    ],
    open: receive => {
      const window = fakeWindow(receive);
      windows.push(window);
      return { send: window.send, close: window.close };
    },
    onLastWindowClosed: () => {
      lastClosed++;
    }
  });
  return { app, count, windows, lastClosed: () => lastClosed };
}

describe('createDesktopApp', () => {
  it('serves a window the channels it was given', async () => {
    const { app, windows, count } = standApp();
    app.openWindow();
    const replica = windows[0].attach(Counter);
    await settle();

    expect(replica.view.count.value).toBe(0);
    count.next(7);
    await settle();
    expect(replica.view.count.value).toBe(7);
  });

  it('carries a command from a window back to the source', async () => {
    const { app, windows, count } = standApp();
    app.openWindow();
    const replica = windows[0].attach(Counter);
    await settle();

    replica.send.increment();
    await settle();
    expect(count.value).toBe(1);
  });

  it('makes two windows agree because they replicate one source', async () => {
    const { app, windows } = standApp();
    app.openWindow();
    app.openWindow();
    const first = windows[0].attach(Counter);
    const second = windows[1].attach(Counter);
    await settle();

    first.send.increment();
    await settle();

    expect(first.view.count.value).toBe(1);
    expect(second.view.count.value).toBe(1);
  });

  it('opens a window from inside a window, through the windows channel', async () => {
    const { app, windows } = standApp((application, window) => [windowsChannel(application, window)]);
    app.openWindow();
    const first = windows[0].attach(DesktopWindows);
    await settle();
    expect(first.view.count.value).toBe(1);
    expect(first.view.id.value).toBe(1);

    first.send.open();
    await settle();

    expect(app.windows).toHaveLength(2);
    expect(first.view.count.value).toBe(2);
    const second = windows[1].attach(DesktopWindows);
    await settle();
    expect(second.view.id.value).toBe(2);
  });

  it('leaves the other window running when one closes', async () => {
    const { app, windows, count } = standApp((application, window) => [windowsChannel(application, window)]);
    app.openWindow();
    app.openWindow();
    const first = windows[0].attach(DesktopWindows);
    const secondCounter = windows[1].attach(Counter);
    await settle();

    first.send.closeThis();
    await settle();

    expect(windows[0].closed()).toBe(true);
    expect(windows[1].closed()).toBe(false);
    expect(app.windows.map(window => window.id)).toEqual([2]);

    count.next(3);
    await settle();
    expect(secondCounter.view.count.value).toBe(3);
  });

  it('says when the last window has gone, once', async () => {
    const { app, lastClosed } = standApp();
    const first = app.openWindow();
    const second = app.openWindow();

    first.close();
    expect(lastClosed()).toBe(0);
    second.close();
    expect(lastClosed()).toBe(1);
  });

  it('gives a window a stable id and never reuses it', () => {
    const { app } = standApp();
    const first = app.openWindow();
    first.close();
    const second = app.openWindow();

    expect(second.id).toBe(2);
  });

  it('refuses to open a window after it has been disposed', () => {
    const { app } = standApp();
    app.openWindow();
    app.dispose();

    expect(() => app.openWindow()).toThrow(/disposed/);
  });

  it('closes every window it still holds when disposed', () => {
    const { app, windows } = standApp();
    app.openWindow();
    app.openWindow();

    app.dispose();

    expect(windows.every(window => window.closed())).toBe(true);
    expect(app.windows).toHaveLength(0);
  });

  it('serves a window whose transport answers before the window is built', async () => {
    // `open` may deliver a frame synchronously, and a handshake
    // dropped because the host did not exist yet is a window that
    // replicates nothing and says nothing about why.
    const count = new BehaviorSubject(4);
    let early: ReturnType<typeof fakeWindow> | undefined;
    const app = createDesktopApp({
      channels: [{ token: Counter, source: { view: { count }, commands: { increment: () => {} } } }],
      open: receive => {
        early = fakeWindow(receive);
        // The frames a window sends the instant it is created.
        early.attach(Counter);
        return { send: early.send, close: early.close };
      }
    });
    const handle = app.openWindow();
    await settle();

    expect(handle.id).toBe(1);
    expect(early).toBeDefined();
  });
});

describe('the shell adaptations a window needs', () => {
  const bridges: Array<ReturnType<typeof createElectrobunBridge>> = [];

  /** What a window does the moment its page runs: attach a channel. */
  function speak(bridge: ReturnType<typeof createElectrobunBridge>): void {
    const hub = new MessageChannel();
    bridge.endpoint.postMessage({ type: 'gesso:hub' }, [hub.port2]);
    portHandle(hub.port1).open(Counter.name);
  }

  it('hands a url from a window to the application, with the window that asked', async () => {
    const opened: Array<{ url: string; id: number }> = [];
    const count = new BehaviorSubject(0);
    let bridge!: ReturnType<typeof createElectrobunBridge>;
    let host!: ChannelHost;
    const app = createDesktopApp({
      channels: [{ token: Counter, source: { view: { count }, commands: { increment: () => {} } } }],
      open: receive => {
        host = { receive } as unknown as ChannelHost;
        bridge = createElectrobunBridge({ send: frame => receive(frame) });
        return { send: () => {}, close: () => {} };
      },
      onOpenUrl: (url, window) => opened.push({ url, id: window.id })
    });
    const handle = app.openWindow();

    bridge.openUrl('https://example.test/docs');

    expect(opened).toEqual([{ url: 'https://example.test/docs', id: handle.id }]);
    expect(host).toBeDefined();
  });

  it('waits for the window to speak before telling it the appearance', async () => {
    // A webview's RPC is not listening until its page has loaded, and
    // the window opens well before that. Anything pushed in between is
    // lost, which a native window found and a spec whose transport was
    // live immediately did not.
    const scheme = new BehaviorSubject<'light' | 'dark'>('dark');
    const seen: string[] = [];
    const count = new BehaviorSubject(0);
    let greet!: () => void;
    const app = createDesktopApp({
      channels: [{ token: Counter, source: { view: { count }, commands: { increment: () => {} } } }],
      colorScheme: scheme,
      open: (receive, handle) => {
        const bridge = createElectrobunBridge({
          send: frame => receive(frame),
          onColorScheme: value => seen.push(value)
        });
        // The window is open, but nothing in it is listening yet.
        greet = () => {
          const hub = new MessageChannel();
          bridge.endpoint.postMessage({ type: 'gesso:hub' }, [hub.port2]);
          portHandle(hub.port1).open(Counter.name);
        };
        void handle;
        return { send: frame => bridge.receive(frame), close: () => {} };
      }
    });
    app.openWindow();

    expect(seen).toEqual([]);
    scheme.next('light');
    expect(seen).toEqual([]);

    // The window's first frame is what says it is there. Here it is a
    // channel handshake, which is what a real window sends first.
    greet();
    await settle();
    expect(seen).toEqual(['light']);
  });

  it('tells a window the appearance once it has spoken, and again when it changes', async () => {
    const scheme = new BehaviorSubject<'light' | 'dark'>('dark');
    const seen: string[] = [];
    const count = new BehaviorSubject(0);
    const app = createDesktopApp({
      channels: [{ token: Counter, source: { view: { count }, commands: { increment: () => {} } } }],
      colorScheme: scheme,
      open: receive => {
        const bridge = createElectrobunBridge({
          send: frame => receive(frame),
          onColorScheme: value => seen.push(value)
        });
        bridges.push(bridge);
        return { send: frame => bridge.receive(frame), close: () => {} };
      }
    });
    app.openWindow();
    // Whatever the window's first frame is; a handshake is what a real
    // one sends.
    speak(bridges[bridges.length - 1]);
    await settle();

    expect(seen).toEqual(['dark']);
    scheme.next('light');
    expect(seen).toEqual(['dark', 'light']);
  });

  it('stops telling a window the appearance once it has closed', async () => {
    const scheme = new BehaviorSubject<'light' | 'dark'>('dark');
    const seen: string[] = [];
    const count = new BehaviorSubject(0);
    const app = createDesktopApp({
      channels: [{ token: Counter, source: { view: { count }, commands: { increment: () => {} } } }],
      colorScheme: scheme,
      open: receive => {
        const bridge = createElectrobunBridge({
          send: frame => receive(frame),
          onColorScheme: value => seen.push(value)
        });
        bridges.push(bridge);
        return { send: frame => bridge.receive(frame), close: () => {} };
      }
    });
    const handle = app.openWindow();
    speak(bridges[bridges.length - 1]);
    await settle();
    handle.close();

    scheme.next('light');
    expect(seen).toEqual(['dark']);
  });
});
