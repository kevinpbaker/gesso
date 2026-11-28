import { afterEach, describe, expect, it } from 'vitest';

import { WorkerApp, type WorkerAppOptions } from './WorkerApp';
import type { RuntimeToShellMessage, ShellToRuntimeMessage } from './RenderWorkerProtocol';

/**
 * The shell's half of an app that is one part of a page.
 *
 * Tab leaving the app arrives from the worker as `tabExit`, after the
 * browser's default is long gone, so the shell moves the page's focus
 * itself. Tab coming in from the page reaches the canvas by the
 * browser's default, and the shell sends it on so the app's first or
 * last stop takes it. A title or a leave warning asked for by an app
 * that is not the page goes to the host's callbacks, not the page.
 *
 * As in `WorkerApp.input.spec`, these drive the private wiring rather
 * than `mount`, which wants an `OffscreenCanvas` and a real worker.
 */
interface Internals {
  renderWorker: unknown;
  host: unknown;
  handleWorkerMessage(event: MessageEvent<RuntimeToShellMessage>): void;
  attachTabEntry(canvas: unknown, host: unknown): () => void;
}

const scope = globalThis as Record<string, unknown>;
const saved = { document: scope.document, window: scope.window };

afterEach(() => {
  scope.document = saved.document;
  scope.window = saved.window;
});

type Listener = (event: unknown) => void;

function listenable(): {
  listeners: Map<string, Listener>;
  addEventListener: (t: string, l: Listener) => void;
  removeEventListener: (t: string) => void;
} {
  const listeners = new Map<string, Listener>();
  return {
    listeners,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: type => listeners.delete(type)
  };
}

function harness(options: Partial<WorkerAppOptions> = {}) {
  const outside = {
    name: 'save',
    tabIndex: 0,
    focused: 0,
    focus: () => (outside.focused += 1),
    getClientRects: () => [{}]
  };
  const doc = {
    ...listenable(),
    activeElement: null as unknown,
    querySelectorAll: () => [outside],
    title: 'Host page'
  };
  scope.document = doc;
  const canvas = { ...listenable() };
  const host = {
    ownerDocument: doc,
    contains: (node: unknown) => node === canvas,
    compareDocumentPosition: () => 4
  };
  const posts: ShellToRuntimeMessage[] = [];
  const app = new WorkerApp({ ...options, renderWorker: () => ({}) as unknown as Worker });
  const internals = app as unknown as Internals;
  internals.renderWorker = { postMessage: (message: ShellToRuntimeMessage) => posts.push(message) };
  internals.host = host;
  const receive = (data: RuntimeToShellMessage): void =>
    internals.handleWorkerMessage({ data } as MessageEvent<RuntimeToShellMessage>);
  return { app, internals, doc, canvas, host, outside, posts, receive };
}

describe('WorkerApp tabExit', () => {
  it("moves the page's focus to the control after the host when Tab leaves the app", () => {
    const { receive, outside } = harness({ tabExit: true });

    receive({ type: 'tabExit', direction: 1 });

    expect(outside.focused).toBe(1);
  });

  it('sends a Tab pressed outside the app on to the worker, from nothing focused, when it brings focus to the canvas', () => {
    const { internals, doc, canvas, host, posts } = harness({ tabExit: true });
    internals.attachTabEntry(canvas, host);

    doc.listeners.get('keydown')!({ key: 'Tab', shiftKey: true, target: {} });
    canvas.listeners.get('focus')!({ relatedTarget: {} });

    expect(posts.map(post => post.type)).toEqual(['blur', 'keyDown', 'keyUp']);
    expect(posts[1]).toMatchObject({ key: 'Tab', modifiers: { shift: true } });
  });

  it('sends nothing when the canvas takes focus from a click, or from the app itself', () => {
    const { internals, doc, canvas, host, posts } = harness({ tabExit: true });
    internals.attachTabEntry(canvas, host);

    canvas.listeners.get('focus')!({ relatedTarget: {} });
    doc.listeners.get('keydown')!({ key: 'Tab', shiftKey: false, target: {} });
    canvas.listeners.get('focus')!({ relatedTarget: canvas });

    expect(posts).toEqual([]);
  });

  it('removes its listeners when detached', () => {
    const { internals, doc, canvas, host } = harness({ tabExit: true });
    const detach = internals.attachTabEntry(canvas, host);

    detach();

    expect(doc.listeners.size).toBe(0);
    expect(canvas.listeners.size).toBe(0);
  });
});

describe('WorkerApp onTitle and onLeaveWarning', () => {
  it("gives the title to the host and leaves the page's alone", () => {
    const titles: string[] = [];
    const { receive, doc } = harness({ onTitle: title => titles.push(title) });

    receive({ type: 'title', title: 'Grid' } as RuntimeToShellMessage);

    expect(titles).toEqual(['Grid']);
    expect(doc.title).toBe('Host page');
  });

  it('gives the leave warning to the host and puts nothing on the window', () => {
    const warnings: boolean[] = [];
    const window = listenable();
    scope.window = window;
    const { receive } = harness({ onLeaveWarning: on => warnings.push(on) });

    receive({ type: 'leaveWarning', on: true } as RuntimeToShellMessage);

    expect(warnings).toEqual([true]);
    expect(window.listeners.size).toBe(0);
  });
});
