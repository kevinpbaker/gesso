import { describe, expect, it } from 'vitest';

import { createRelay, PAGE_PORT, PANEL_PORT, type RelayPort } from './relay';

/** A port the relay can hold, with the other end in the spec's hand. */
function fakePort(name: string, tabId?: number) {
  const received: unknown[] = [];
  let onMessage: ((message: unknown) => void) | null = null;
  let onDisconnect: (() => void) | null = null;
  const port: RelayPort = {
    name,
    ...(tabId === undefined ? {} : { tabId }),
    postMessage: message => received.push(message),
    onMessage: listener => {
      onMessage = listener;
    },
    onDisconnect: listener => {
      onDisconnect = listener;
    }
  };
  return {
    port,
    received,
    send: (message: unknown) => onMessage?.(message),
    disconnect: () => onDisconnect?.()
  };
}

describe('the relay', () => {
  it('joins a panel to the content script of the tab it inspects, both ways', () => {
    const relay = createRelay();
    const page = fakePort(PAGE_PORT, 7);
    const panel = fakePort(PANEL_PORT);
    relay.connect(page.port);
    relay.connect(panel.port);
    panel.send({ type: 'gesso:init', tabId: 7 });

    // The page was there first, so the panel is told at once.
    expect(panel.received).toEqual([{ type: 'gesso:page-ready' }]);

    panel.send({ type: 'hello' });
    expect(page.received).toEqual([{ type: 'hello' }]);

    page.send({ type: 'apps', apps: [{ id: 'app-1', name: 'demo' }] });
    expect(panel.received[1]).toEqual({ type: 'apps', apps: [{ id: 'app-1', name: 'demo' }] });
  });

  it('keeps tabs apart', () => {
    const relay = createRelay();
    const pageA = fakePort(PAGE_PORT, 1);
    const pageB = fakePort(PAGE_PORT, 2);
    const panelA = fakePort(PANEL_PORT);
    relay.connect(pageA.port);
    relay.connect(pageB.port);
    relay.connect(panelA.port);
    panelA.send({ type: 'gesso:init', tabId: 1 });

    panelA.send({ type: 'hello' });
    pageB.send({ type: 'apps', apps: [] });

    expect(pageA.received).toEqual([{ type: 'hello' }]);
    expect(pageB.received).toEqual([]);
    expect(panelA.received).toEqual([{ type: 'gesso:page-ready' }]);
  });

  it('answers a panel with no page in its tab, so the panel can say so', () => {
    const relay = createRelay();
    const panel = fakePort(PANEL_PORT);
    relay.connect(panel.port);
    panel.send({ type: 'gesso:init', tabId: 3 });

    panel.send({ type: 'hello' });
    panel.send({ type: 'request', app: 'app-1', request: { kind: 'tree' } });

    expect(panel.received).toEqual([{ type: 'apps', apps: [] }]);
  });

  it('tells the panels when the page goes and when it comes back', () => {
    const relay = createRelay();
    const panel = fakePort(PANEL_PORT);
    relay.connect(panel.port);
    panel.send({ type: 'gesso:init', tabId: 5 });
    const first = fakePort(PAGE_PORT, 5);
    relay.connect(first.port);
    expect(panel.received).toEqual([{ type: 'gesso:page-ready' }]);

    first.disconnect();
    expect(panel.received[1]).toEqual({ type: 'apps', apps: [] });
    expect(relay.tabs.get(5)).toEqual({ page: false, panels: 1 });

    // A reload: the new content script connects before the old port
    // has finished disconnecting. The old one's departure must not
    // unregister the new one.
    const second = fakePort(PAGE_PORT, 5);
    const third = fakePort(PAGE_PORT, 5);
    relay.connect(second.port);
    relay.connect(third.port);
    second.disconnect();
    expect(relay.tabs.get(5)).toEqual({ page: true, panels: 1 });
    panel.send({ type: 'hello' });
    expect(third.received).toEqual([{ type: 'hello' }]);
  });

  it('forgets a panel that disconnected and ignores ports it does not know', () => {
    const relay = createRelay();
    const panel = fakePort(PANEL_PORT);
    relay.connect(panel.port);
    panel.send({ type: 'gesso:init', tabId: 9 });
    panel.disconnect();
    relay.connect(fakePort('someone-else', 9).port);
    relay.connect(fakePort(PAGE_PORT).port);

    expect(relay.tabs.get(9)).toEqual({ page: false, panels: 0 });
    expect(relay.tabs.size).toBe(1);
  });
});
