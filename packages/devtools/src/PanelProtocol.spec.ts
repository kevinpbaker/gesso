import { describe, expect, it, vi } from 'vitest';

import {
  createDirectPorts,
  ENVELOPE_SOURCE,
  isEnvelope,
  windowPagePort,
  windowPanelPort,
  type PageMessage,
  type PanelMessage,
  type WindowLike
} from './PanelProtocol';

/** A window whose `postMessage` is delivered back to its own listeners, as a real one's is. */
function fakeWindow(origin = 'https://app.example') {
  const listeners = new Set<(event: { data: unknown }) => void>();
  const posted: { message: unknown; target: string }[] = [];
  const win: WindowLike = {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    postMessage: (message, target) => {
      posted.push({ message, target });
      for (const listener of Array.from(listeners)) {
        listener({ data: message });
      }
    },
    location: { origin }
  };
  return { win, posted, listeners };
}

describe('direct ports', () => {
  it("deliver each side's posts to the other's listeners, synchronously", () => {
    const { page, panel } = createDirectPorts();
    const heardByPage: PanelMessage[] = [];
    const heardByPanel: PageMessage[] = [];
    page.onMessage(message => heardByPage.push(message));
    panel.onMessage(message => heardByPanel.push(message));

    panel.post({ type: 'hello' });
    page.post({ type: 'apps', apps: [] });

    expect(heardByPage).toEqual([{ type: 'hello' }]);
    expect(heardByPanel).toEqual([{ type: 'apps', apps: [] }]);
  });

  it('stop delivering once either side closes', () => {
    const { page, panel } = createDirectPorts();
    const heard = vi.fn();
    page.onMessage(heard);
    panel.close();
    panel.post({ type: 'hello' });
    expect(heard).not.toHaveBeenCalled();
  });
});

describe('window ports', () => {
  it("address the page's own origin and hear only envelopes for their side", () => {
    const { win, posted } = fakeWindow();
    const page = windowPagePort(win);
    const panel = windowPanelPort(win);
    const heardByPage: PanelMessage[] = [];
    const heardByPanel: PageMessage[] = [];
    page.onMessage(message => heardByPage.push(message));
    panel.onMessage(message => heardByPanel.push(message));

    panel.post({ type: 'hello' });
    page.post({ type: 'apps', apps: [{ id: 'app-1', name: 'demo' }] });

    expect(posted.map(entry => entry.target)).toEqual(['https://app.example', 'https://app.example']);
    expect(posted[0]?.message).toEqual({ source: ENVELOPE_SOURCE, to: 'page', message: { type: 'hello' } });
    // Each side's own post came back through the shared window and was ignored.
    expect(heardByPage).toEqual([{ type: 'hello' }]);
    expect(heardByPanel).toEqual([{ type: 'apps', apps: [{ id: 'app-1', name: 'demo' }] }]);
  });

  it('ignore other traffic on the window', () => {
    const { win } = fakeWindow();
    const page = windowPagePort(win);
    const heard = vi.fn();
    page.onMessage(heard);

    win.postMessage({ type: 'hello' }, '*');
    win.postMessage({ source: 'someone-else', to: 'page', message: {} }, '*');
    win.postMessage(null, '*');

    expect(heard).not.toHaveBeenCalled();
  });

  it('post to `*` from an opaque origin, which refuses anything else', () => {
    const { win, posted } = fakeWindow('null');
    windowPagePort(win).post({ type: 'apps', apps: [] });
    expect(posted[0]?.target).toBe('*');
  });

  it('close by removing the window listener', () => {
    const { win, listeners } = fakeWindow();
    const page = windowPagePort(win);
    expect(listeners.size).toBe(1);
    page.close();
    expect(listeners.size).toBe(0);
  });

  it('recognises an envelope by source and address', () => {
    expect(isEnvelope({ source: ENVELOPE_SOURCE, to: 'page', message: 1 }, 'page')).toBe(true);
    expect(isEnvelope({ source: ENVELOPE_SOURCE, to: 'page', message: 1 }, 'panel')).toBe(false);
    expect(isEnvelope({ source: ENVELOPE_SOURCE, to: 'page' }, 'page')).toBe(false);
    expect(isEnvelope('nope', 'page')).toBe(false);
  });
});
