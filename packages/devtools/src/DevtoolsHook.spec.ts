import { describe, expect, it, vi } from 'vitest';

import type { DevtoolsEvent, DevtoolsRequest } from 'gesso-framework';
import { BehaviorSubject } from 'rxjs';
import { channel, ChannelReplica, provide, type ChannelPort } from 'gesso-framework';
import { createActionLog, type ActionLog } from './ActionLog';
import { connectDevtools, getDevtoolsHook, HOOK_PROPERTY, type DevtoolsApp, type HookHost } from './DevtoolsHook';
import { createDirectPorts, type PageMessage, type WindowLike } from './PanelProtocol';

const Ticker = channel<{ ticks: number }, { step(by: number): void }>('ticker', { ticks: 0 });

/** A provided channel with a replica whose port the log taps; synchronous, as `ActionLog.spec` does it. */
function tickerReplica(log: ActionLog) {
  const left: ChannelPort = { postMessage: message => right.onmessage?.({ data: message }), onmessage: null };
  const right: ChannelPort = { postMessage: message => left.onmessage?.({ data: message }), onmessage: null };
  const ticks = new BehaviorSubject(0);
  provide(Ticker, { view: { ticks }, commands: { step: (by: number) => ticks.next(ticks.value + by) } }, left);
  return new ChannelReplica(Ticker, log.tapPort(right, Ticker));
}

/** An application that records what it was asked and can emit events. */
function fakeApp() {
  const requests: DevtoolsRequest[] = [];
  let listener: ((event: DevtoolsEvent) => void) | null = null;
  const app: DevtoolsApp = {
    devtools: request => requests.push(request),
    onDevtools: next => {
      listener = next;
    }
  };
  return {
    app,
    requests,
    emit: (event: DevtoolsEvent) => listener?.(event),
    get listening() {
      return listener !== null;
    }
  };
}

function attachPanel(hook: ReturnType<typeof getDevtoolsHook>) {
  const { page, panel } = createDirectPorts();
  const heard: PageMessage[] = [];
  panel.onMessage(message => heard.push(message));
  const detach = hook.attach(page);
  return { panel, heard, detach };
}

describe('the devtools hook', () => {
  it('answers hello with the connected applications, and keeps the list current', () => {
    const hook = getDevtoolsHook(null);
    const { panel, heard } = attachPanel(hook);
    const first = fakeApp();
    const second = fakeApp();

    panel.post({ type: 'hello' });
    expect(heard).toEqual([{ type: 'apps', apps: [] }]);

    const disconnectFirst = hook.register(first.app, { name: 'first' });
    hook.register(second.app, { name: 'second' });
    expect(heard[2]).toEqual({
      type: 'apps',
      apps: [
        { id: 'app-1', name: 'first' },
        { id: 'app-2', name: 'second' }
      ]
    });

    disconnectFirst();
    expect(heard[3]).toEqual({ type: 'apps', apps: [{ id: 'app-2', name: 'second' }] });
    expect(first.listening).toBe(false);
    // Disconnecting twice is harmless.
    disconnectFirst();
    expect(heard).toHaveLength(4);
  });

  it('routes a request to the application it names and drops one for an application that has gone', () => {
    const hook = getDevtoolsHook(null);
    const { panel } = attachPanel(hook);
    const first = fakeApp();
    const second = fakeApp();
    hook.register(first.app);
    hook.register(second.app);

    panel.post({ type: 'request', app: 'app-2', request: { kind: 'tree' } });
    panel.post({ type: 'request', app: 'app-9', request: { kind: 'tree' } });

    expect(first.requests).toEqual([]);
    expect(second.requests).toEqual([{ kind: 'tree' }]);
  });

  it("fans an application's events out to every attached panel, tagged with its id", () => {
    const hook = getDevtoolsHook(null);
    const one = attachPanel(hook);
    const two = attachPanel(hook);
    const app = fakeApp();
    hook.register(app.app);

    const event: DevtoolsEvent = { kind: 'console', entry: { thread: 'render', level: 'log', args: ['hi'], at: 1 } };
    app.emit(event);

    expect(one.heard.at(-1)).toEqual({ type: 'event', app: 'app-1', event });
    expect(two.heard.at(-1)).toEqual({ type: 'event', app: 'app-1', event });

    two.detach();
    app.emit(event);
    expect(one.heard).toHaveLength(3);
    expect(two.heard).toHaveLength(2);
  });

  it('forwards each new action log entry once, and starts over after a clear', () => {
    const hook = getDevtoolsHook(null);
    const { heard } = attachPanel(hook);
    const log = createActionLog();
    const app = fakeApp();
    hook.register(app.app, { actions: log });
    const replica = tickerReplica(log);

    replica.send.step(1);

    // One command and the patch it caused, each forwarded as it was recorded.
    const actions = heard.filter(message => message.type === 'action');
    expect(actions.map(message => (message.type === 'action' ? message.entry.kind : ''))).toEqual(['command', 'patch']);
    expect(actions[0]).toMatchObject({ app: 'app-1', entry: { command: 'step', payload: 1 } });

    log.clear();
    replica.send.step(2);
    const after = heard.filter(message => message.type === 'action');
    expect(after).toHaveLength(4);
    expect(after[2]).toMatchObject({ entry: { command: 'step', payload: 2 } });
    log.dispose();
  });

  it('lives on the window once, and connectDevtools installs the window transport there', () => {
    const posted: unknown[] = [];
    const listeners = new Set<(event: { data: unknown }) => void>();
    const win: WindowLike & HookHost = {
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
      postMessage: message => posted.push(message),
      location: { origin: 'https://app.example' }
    };
    const app = fakeApp();

    const disconnect = connectDevtools(app.app, { name: 'demo', window: win });

    expect(win[HOOK_PROPERTY]).toBeDefined();
    expect(getDevtoolsHook(win)).toBe(win[HOOK_PROPERTY]);
    expect(getDevtoolsHook(win).apps).toEqual([{ id: 'app-1', name: 'demo' }]);
    // A content script's hello over the window is answered over the window.
    for (const listener of listeners) {
      listener({ data: { source: 'gesso-devtools', to: 'page', message: { type: 'hello' } } });
    }
    expect(posted.at(-1)).toEqual({
      source: 'gesso-devtools',
      to: 'panel',
      message: { type: 'apps', apps: [{ id: 'app-1', name: 'demo' }] }
    });
    disconnect();
    expect(getDevtoolsHook(win).apps).toEqual([]);
  });

  it('arms the page to pick a node, and tells the panel what was picked', () => {
    const hook = getDevtoolsHook(null);
    const { panel, heard } = attachPanel(hook);
    const armed: boolean[] = [];
    const listeners: ((id: string) => void)[] = [];
    hook.register(fakeApp().app, {
      name: 'demo',
      picker: {
        setEnabled: enabled => armed.push(enabled),
        enabled: false,
        onPick: listener => {
          if (listener !== null) {
            listeners.push(listener);
          }
        },
        dispose: () => {}
      }
    });

    panel.post({ type: 'pick', app: 'app-1', enabled: true });
    expect(armed).toEqual([true]);

    // The click never reaches the application; the panel hears the id.
    listeners[0]?.('root:0:1');
    expect(heard.at(-1)).toEqual({ type: 'picked', app: 'app-1', id: 'root:0:1' });
  });

  it('lets the panel arm an application with no picker without breaking', () => {
    const hook = getDevtoolsHook(null);
    const { panel } = attachPanel(hook);
    hook.register(fakeApp().app, { name: 'demo' });

    expect(() => panel.post({ type: 'pick', app: 'app-1', enabled: true })).not.toThrow();
  });

  it('names an application `app` when nothing better is known', () => {
    const hook = getDevtoolsHook(null);
    hook.register(fakeApp().app);
    expect(hook.apps[0]?.name).toBe('app');
    vi.restoreAllMocks();
  });
});
