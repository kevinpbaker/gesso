import type { DevtoolsEvent, DevtoolsRequest } from '@gesso/framework';
import type { ActionEntry } from './ActionLog';

/**
 * What a devtools panel and the page it inspects say to each other
 * (`ADOPTION_ROADMAP.md` A4).
 *
 * The framework's `DevtoolsRequest` and `DevtoolsEvent` are one
 * application's vocabulary. A page may run several (a documentation
 * site's examples), and a panel arrives after they started, so this
 * layer adds the two things the framework's protocol does not have: an
 * application id on every message, and a greeting that answers with
 * the list.
 *
 * Both sides speak through a `DevtoolsPort`, which is only `post` and
 * `onMessage`. Two ports are provided here: a pair joined in memory,
 * for a panel mounted in the same page and for tests, and one over
 * `window.postMessage`, which is how a browser extension's content
 * script reaches a page. The extension's own hop, from its content
 * script to its devtools page, is one more port of the same shape and
 * lives with the extension.
 */

export interface DevtoolsAppInfo {
  readonly id: string;
  readonly name: string;
}

/** Page to panel. */
export type PageMessage =
  /** The applications the page has connected; sent on `hello` and whenever the list changes. */
  | { type: 'apps'; apps: readonly DevtoolsAppInfo[] }
  | { type: 'event'; app: string; event: DevtoolsEvent }
  /** A store action log entry, from an `ActionLog` the application connected alongside itself. */
  | { type: 'action'; app: string; entry: ActionEntry };

/** Panel to page. */
export type PanelMessage =
  /** "Is anyone there": answered with `apps`. */
  { type: 'hello' } | { type: 'request'; app: string; request: DevtoolsRequest };

/** One end of a conversation: what it hears and what it says. */
export interface DevtoolsPort<In, Out> {
  post(message: Out): void;
  /** Returns a function that stops listening. */
  onMessage(listener: (message: In) => void): () => void;
  /** Drops every listener and stops posting. */
  close(): void;
}

/** The page's end. */
export type PagePort = DevtoolsPort<PanelMessage, PageMessage>;
/** The panel's end. */
export type PanelPort = DevtoolsPort<PageMessage, PanelMessage>;

/**
 * Two ports joined in memory, delivering synchronously.
 *
 * For a panel mounted in the page it inspects, and for specs: the
 * hook and the panel are exercised end to end with nothing between
 * them but a function call.
 */
export function createDirectPorts(): { page: PagePort; panel: PanelPort } {
  const toPanel = new Set<(message: PageMessage) => void>();
  const toPage = new Set<(message: PanelMessage) => void>();
  let open = true;
  const page: PagePort = {
    post(message) {
      if (open) {
        for (const listener of Array.from(toPanel)) {
          listener(message);
        }
      }
    },
    onMessage(listener) {
      toPage.add(listener);
      return () => toPage.delete(listener);
    },
    close() {
      open = false;
      toPage.clear();
    }
  };
  const panel: PanelPort = {
    post(message) {
      if (open) {
        for (const listener of Array.from(toPage)) {
          listener(message);
        }
      }
    },
    onMessage(listener) {
      toPanel.add(listener);
      return () => toPanel.delete(listener);
    },
    close() {
      open = false;
      toPanel.clear();
    }
  };
  return { page, panel };
}

/** What a message carries over `window.postMessage`, so both sides can ignore everything else on the window. */
export interface Envelope<T> {
  readonly source: typeof ENVELOPE_SOURCE;
  /** Who it is for. A page ignores what it sent, and so does a panel. */
  readonly to: 'page' | 'panel';
  readonly message: T;
}

export const ENVELOPE_SOURCE = 'gesso-devtools';

export function isEnvelope(value: unknown, to: 'page' | 'panel'): value is Envelope<unknown> {
  const envelope = value as { source?: unknown; to?: unknown; message?: unknown } | null;
  return (
    typeof envelope === 'object' &&
    envelope !== null &&
    envelope.source === ENVELOPE_SOURCE &&
    envelope.to === to &&
    'message' in envelope
  );
}

/** The part of `Window` the transport uses, so a spec can hand it a plain object. */
export interface WindowLike {
  addEventListener(type: 'message', listener: (event: { data: unknown; source?: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown; source?: unknown }) => void): void;
  postMessage(message: unknown, targetOrigin: string): void;
  readonly location?: { readonly origin: string };
}

/**
 * The page's end of a conversation over its own window.
 *
 * A content script shares the page's window but not its JavaScript, so
 * `window.postMessage` to the page's own origin is the one channel
 * they have. Messages are posted to that origin rather than to `*`,
 * and the page hears only envelopes addressed to it, so its own posts
 * come straight back through the same listener and are dropped.
 */
export function windowPagePort(win: WindowLike): PagePort {
  return windowPort<PanelMessage, PageMessage>(win, 'page', 'panel');
}

/** The other end, for whatever sits in the page beside it (an extension's content script). */
export function windowPanelPort(win: WindowLike): PanelPort {
  return windowPort<PageMessage, PanelMessage>(win, 'panel', 'page');
}

function windowPort<In, Out>(win: WindowLike, me: 'page' | 'panel', them: 'page' | 'panel'): DevtoolsPort<In, Out> {
  const listeners = new Set<(message: In) => void>();
  const origin = win.location?.origin;
  // `file:` and sandboxed pages have an opaque origin, which postMessage
  // refuses as a target; `*` is the only address they answer to.
  const target = origin === undefined || origin === 'null' || origin === '' ? '*' : origin;
  const handle = (event: { data: unknown }): void => {
    if (!isEnvelope(event.data, me)) {
      return;
    }
    const message = event.data.message as In;
    for (const listener of Array.from(listeners)) {
      listener(message);
    }
  };
  win.addEventListener('message', handle);
  let open = true;
  return {
    post(message) {
      if (open) {
        const envelope: Envelope<Out> = { source: ENVELOPE_SOURCE, to: them, message };
        win.postMessage(envelope, target);
      }
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      open = false;
      listeners.clear();
      win.removeEventListener('message', handle);
    }
  };
}
