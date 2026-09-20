import { describe, expect, it } from 'vitest';

import type { PageMessage } from 'gesso-devtools';
import { extensionPanelPort, type RuntimePort } from './extensionPort';

function fakeRuntime() {
  const ports: {
    name: string;
    sent: unknown[];
    deliver(message: unknown): void;
    drop(): void;
    disconnected: boolean;
  }[] = [];
  const pending: (() => void)[] = [];
  const connect = (name: string): RuntimePort => {
    const onMessage: ((message: unknown) => void)[] = [];
    const onDisconnect: (() => void)[] = [];
    const record = {
      name,
      sent: [] as unknown[],
      deliver: (message: unknown) => onMessage.forEach(listener => listener(message)),
      drop: () => onDisconnect.forEach(listener => listener()),
      disconnected: false
    };
    ports.push(record);
    return {
      postMessage: message => record.sent.push(message),
      onMessage: { addListener: listener => onMessage.push(listener) },
      onDisconnect: { addListener: listener => onDisconnect.push(listener) },
      disconnect: () => {
        record.disconnected = true;
      }
    };
  };
  return { connect, ports, pending, runTimers: () => pending.splice(0).forEach(callback => callback()) };
}

describe('the extension panel port', () => {
  it('introduces itself with the tab, greets the page when told it is ready, and relays the rest', () => {
    const runtime = fakeRuntime();
    const heard: PageMessage[] = [];
    const port = extensionPanelPort({ connect: runtime.connect, tabId: 42 });
    port.onMessage(message => heard.push(message));

    expect(runtime.ports[0]?.name).toBe('gesso-panel');
    expect(runtime.ports[0]?.sent).toEqual([{ type: 'gesso:init', tabId: 42 }]);

    runtime.ports[0]?.deliver({ type: 'gesso:page-ready' });
    expect(runtime.ports[0]?.sent[1]).toEqual({ type: 'hello' });
    expect(heard).toEqual([]);

    runtime.ports[0]?.deliver({ type: 'apps', apps: [] });
    port.post({ type: 'request', app: 'app-1', request: { kind: 'tree' } });
    expect(heard).toEqual([{ type: 'apps', apps: [] }]);
    expect(runtime.ports[0]?.sent[2]).toEqual({ type: 'request', app: 'app-1', request: { kind: 'tree' } });
  });

  it('reports the page gone and reconnects when the relay drops', () => {
    const runtime = fakeRuntime();
    const heard: PageMessage[] = [];
    const port = extensionPanelPort({
      connect: runtime.connect,
      tabId: 1,
      setTimeout: callback => runtime.pending.push(callback)
    });
    port.onMessage(message => heard.push(message));

    runtime.ports[0]?.drop();
    expect(heard).toEqual([{ type: 'apps', apps: [] }]);
    expect(runtime.ports).toHaveLength(1);

    runtime.runTimers();
    expect(runtime.ports).toHaveLength(2);
    expect(runtime.ports[1]?.sent).toEqual([{ type: 'gesso:init', tabId: 1 }]);
  });

  it('stops for good on close', () => {
    const runtime = fakeRuntime();
    const port = extensionPanelPort({
      connect: runtime.connect,
      tabId: 1,
      setTimeout: callback => runtime.pending.push(callback)
    });
    port.close();
    expect(runtime.ports[0]?.disconnected).toBe(true);
    runtime.ports[0]?.drop();
    runtime.runTimers();
    expect(runtime.ports).toHaveLength(1);
  });
});
