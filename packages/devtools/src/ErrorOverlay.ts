import type { RuntimeErrorSource } from '@gesso/framework';
import { codeFrame, type CodeFrame } from './codeFrame';
import { SourceMapStore } from './sourceMap';
import { formatFrame, mapStack, parseStack, primaryFrame, type StackFrame } from './stackTrace';

/**
 * Where an error came from.
 *
 * The render worker's four sources, plus `window` for the thread the
 * overlay itself runs on — the single-thread configuration, and
 * anything the shell does around the app.
 */
export type ErrorOrigin = RuntimeErrorSource | 'window';

/** What each origin is called, and the sentence under the message. */
const ORIGINS: Record<ErrorOrigin, { label: string; note: string }> = {
  uncaught: {
    label: 'render worker',
    note: 'Nothing caught this, so it happened outside a message, almost always during a frame. That frame’s work was already taken off the dirty set, so what you see may be stale.'
  },
  message: {
    label: 'render worker',
    note: 'Thrown while handling a message from the shell, so that input or resize was dropped. The rest of the application is intact.'
  },
  renderer: {
    label: 'renderer',
    note: 'The backend refused to draw. Layout and state are unaffected; the surface is not being updated.'
  },
  listener: {
    label: 'event listener',
    note: 'The dispatcher caught this, so the event still reached the rest of the tree and the application is running. What did not happen is whatever this handler was for.'
  },
  channel: {
    label: 'channel',
    note: 'A channel’s worker or its patch stream threw. The view is intact; the data behind it has stopped arriving.'
  },
  window: { label: 'main thread', note: '' }
};

export interface ErrorOverlayOptions {
  /**
   * Also write every error to the console (default true).
   *
   * On by default because the overlay is a second place to see an
   * error, not a replacement for the first: the console keeps the live
   * object, its `cause`, and the "expand to see the real frames" that
   * no snapshot of a stack can offer.
   */
  echoToConsole?: boolean;
  /** Where source maps are fetched from. Injected by the specs. */
  sourceMaps?: SourceMapStore;
}

/** One distinct error, and how many times it has arrived. */
interface Entry {
  message: string;
  stack: string | undefined;
  origin: ErrorOrigin;
  repeats: number;
  frames: StackFrame[];
  /** Set once the source maps for this entry's frames have resolved. */
  mapped: boolean;
  code: CodeFrame | null;
}

/**
 * The error overlay: what a worker threw, drawn over the app that was
 * running when it threw.
 *
 * A canvas UI has no equivalent of a page that stops rendering. When a
 * render worker throws, the last good frame stays on screen — pixels
 * that look exactly like a working application — and the only witness
 * is a console message on a thread the developer has to know to
 * select. `WorkerApp` already forwards those errors to `onError`;
 * this is that callback, with the stack put back through the source
 * maps and the offending line quoted.
 *
 * It is a development tool and it makes a development tool's trade:
 * it fetches source maps, keeps every distinct error of the session,
 * and covers the application it is reporting on.
 */
export class ErrorOverlay {
  private readonly host: HTMLElement;
  /**
   * The document the host belongs to, rather than the global one.
   *
   * The same rule `SemanticsMirror` follows: everything this class
   * builds hangs off the element it was handed, so it works in a
   * second window and can be driven by a fake document in a spec —
   * which is the only way to test it in a suite that runs in Node.
   */
  private readonly doc: Document;
  private readonly view: (Window & typeof globalThis) | null;
  private readonly container: HTMLDivElement;
  private readonly root: ShadowRoot;
  private readonly panel: HTMLDivElement;
  private readonly maps: SourceMapStore;
  private readonly echo: boolean;
  private readonly entries: Entry[] = [];
  private readonly restoreHostPosition: string | null;

  private shown = -1;
  private disposed = false;
  private detachWindow: (() => void) | null = null;

  constructor(host: HTMLElement, options: ErrorOverlayOptions = {}) {
    this.host = host;
    this.doc = host.ownerDocument;
    this.view = this.doc.defaultView;
    this.maps = options.sourceMaps ?? new SourceMapStore();
    this.echo = options.echoToConsole !== false;

    // The overlay covers the element the app was mounted into rather
    // than the viewport, because a Gesso app is not necessarily the
    // whole page — the playground runs one in a pane. Covering the app
    // needs the app's element to be a containing block, which is the
    // one property this touches, and it is put back on dispose.
    const position = this.view?.getComputedStyle(host).position ?? 'static';
    this.restoreHostPosition = position === 'static' ? host.style.position : null;
    if (position === 'static') {
      host.style.position = 'relative';
    }

    this.container = this.doc.createElement('div');
    this.container.style.display = 'none';
    this.root = this.container.attachShadow({ mode: 'open' });
    const style = this.doc.createElement('style');
    style.textContent = STYLES;
    this.panel = this.doc.createElement('div');
    this.panel.className = 'panel';
    this.panel.tabIndex = -1;
    // `alert` and not `alertdialog`: the overlay traps nothing and
    // takes nothing over, and claiming a dialog would tell a screen
    // reader to expect a focus contract this does not honour.
    this.panel.setAttribute('role', 'alert');
    const scrim = this.doc.createElement('div');
    scrim.className = 'scrim';
    scrim.appendChild(this.panel);
    this.root.append(style, scrim);
    host.appendChild(this.container);
  }

  /** How many distinct errors have been reported. */
  get count(): number {
    return this.entries.length;
  }

  /** True while the overlay is covering the app. */
  get visible(): boolean {
    return this.container.style.display !== 'none';
  }

  /**
   * Reports an error, in the shape `WorkerApp`'s `onError` hands it
   * over, so the whole wiring is `onError: overlay.report`.
   *
   * Bound as a field rather than a method for exactly that: it is
   * passed as a callback far more often than it is called.
   */
  report = (message: string, stack?: string, origin: ErrorOrigin = 'window'): void => {
    if (this.disposed) {
      return;
    }
    if (this.echo) {
      console.error(`[gesso: ${origin}] ${message}`, stack ?? '');
    }
    const existing = this.entries.find(entry => entry.message === message && entry.stack === stack);
    if (existing !== undefined) {
      existing.repeats++;
      // A repeat does not reopen a dismissed overlay. An error thrown
      // every frame would otherwise be impossible to get out of the
      // way of, and getting it out of the way is how a developer looks
      // at the application underneath it.
      if (this.visible && this.entries[this.shown] === existing) {
        this.render();
      }
      return;
    }
    const entry: Entry = {
      message,
      stack,
      origin,
      repeats: 1,
      frames: stack === undefined ? [] : parseStack(stack),
      mapped: false,
      code: null
    };
    this.entries.push(entry);
    this.shown = this.entries.length - 1;
    this.show();
    void this.resolveSources(entry);
  };

  /** Reports a thrown value, which is usually but not always an Error. */
  reportError = (error: unknown, origin: ErrorOrigin = 'window'): void => {
    if (error instanceof Error) {
      this.report(error.message, error.stack, origin);
      return;
    }
    this.report(String(error), undefined, origin);
  };

  /**
   * Catches what this thread throws, too.
   *
   * The single-thread configuration runs components here, and even in
   * the worker configuration the shell around the app can throw. Returns
   * a function that stops listening; `dispose` calls it as well.
   */
  captureWindowErrors(target: Window | null = this.view): () => void {
    if (target === null) {
      return () => {};
    }
    const onError = (event: ErrorEvent): void => {
      this.reportError(event.error ?? event.message, 'window');
    };
    const onRejection = (event: PromiseRejectionEvent): void => {
      this.reportError(event.reason, 'window');
    };
    target.addEventListener('error', onError);
    target.addEventListener('unhandledrejection', onRejection);
    const detach = (): void => {
      target.removeEventListener('error', onError);
      target.removeEventListener('unhandledrejection', onRejection);
      this.detachWindow = null;
    };
    this.detachWindow = detach;
    return detach;
  }

  /** Hides the overlay. The errors are kept and can be shown again. */
  hide(): void {
    this.container.style.display = 'none';
    this.doc.removeEventListener('keydown', this.handleKeyDown, true);
  }

  /** Hides the overlay and forgets every error it was holding. */
  clear(): void {
    this.entries.length = 0;
    this.shown = -1;
    this.hide();
  }

  dispose(): void {
    this.disposed = true;
    this.detachWindow?.();
    this.doc.removeEventListener('keydown', this.handleKeyDown, true);
    this.container.remove();
    if (this.restoreHostPosition !== null) {
      this.host.style.position = this.restoreHostPosition;
    }
  }

  private show(): void {
    this.container.style.display = 'block';
    this.render();
    // Escape is taken at the document, in the capture phase, rather
    // than from the panel: focus is not the overlay's to hold. The
    // accessibility mirror moves DOM focus to follow the application's
    // own, and it does so on the frames either side of an error — so a
    // panel that had focus when it opened does not have it a moment
    // later, and Escape would reach nothing. Capturing also means the
    // canvas underneath does not also see the key, which it should not
    // while it is covered.
    this.doc.addEventListener('keydown', this.handleKeyDown, true);
    // Focus anyway, for the screen reader: it lands on the message
    // instead of announcing it from wherever the user happened to be.
    this.panel.focus();
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.hide();
    }
  };

  /**
   * Maps the entry's stack and quotes the line it points at.
   *
   * Deliberately after the first paint: the raw stack is on screen
   * within a frame of the error, and the mapped one replaces it when
   * the network answers. A developer looking at an error should never
   * be waiting on a fetch to see it.
   */
  private async resolveSources(entry: Entry): Promise<void> {
    if (entry.frames.length === 0) {
      return;
    }
    entry.frames = await mapStack(entry.frames, this.maps);
    entry.mapped = true;
    const frame = primaryFrame(entry.frames);
    if (frame?.original != null && frame.location !== null) {
      const consumer = await this.maps.consumerFor(frame.location.url);
      const content = consumer?.contentFor(frame.original.source) ?? null;
      if (content !== null) {
        entry.code = codeFrame(content, frame.original.line, frame.original.column);
      }
    }
    if (!this.disposed && this.visible && this.entries[this.shown] === entry) {
      this.render();
    }
  }

  /** `element`, bound to this overlay's document. */
  private el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options: { className?: string; text?: string } = {}
  ): HTMLElementTagNameMap[K] => element(this.doc, tag, options);

  /** A header button, bound to this overlay's document. */
  private button = (label: string, title: string, onClick: () => void): HTMLButtonElement =>
    button(this.doc, label, title, onClick);

  private render(): void {
    const entry = this.entries[this.shown];
    if (entry === undefined) {
      return;
    }
    const origin = ORIGINS[entry.origin];
    this.panel.replaceChildren();

    const header = this.el('header');
    header.append(this.el('span', { className: 'badge', text: origin.label }));
    if (entry.repeats > 1) {
      header.append(this.el('span', { className: 'repeats', text: `×${entry.repeats}` }));
    }
    const spacer = this.el('span', { className: 'spacer' });
    header.append(spacer);
    if (this.entries.length > 1) {
      header.append(
        this.button('‹', 'Previous error', () => this.step(-1)),
        this.el('span', { className: 'count', text: `${this.shown + 1} / ${this.entries.length}` }),
        this.button('›', 'Next error', () => this.step(1))
      );
    }
    header.append(
      this.button('Copy', 'Copy this error to the clipboard', () => this.copy(entry)),
      this.button('✕', 'Dismiss', () => this.hide())
    );
    this.panel.append(header, this.el('h1', { text: entry.message }));

    if (origin.note !== '') {
      this.panel.append(this.el('p', { className: 'note', text: origin.note }));
    }

    if (entry.code !== null) {
      this.panel.append(renderCodeFrame(this.doc, entry.code));
    }

    if (entry.frames.length > 0) {
      const list = this.el('ol', { className: 'stack' });
      for (const frame of entry.frames) {
        const item = this.el('li');
        if (frame.location === null) {
          item.append(this.el('span', { className: 'raw', text: frame.raw }));
        } else {
          item.append(
            this.el('span', { className: 'fn', text: frame.fn ?? '(anonymous)' }),
            this.el('span', { className: 'at', text: formatFrame(frame, this.view?.location.origin) })
          );
        }
        list.append(item);
      }
      this.panel.append(list);
    } else if (entry.stack !== undefined) {
      // Nothing parsed: show what the engine wrote rather than nothing.
      this.panel.append(this.el('pre', { className: 'stack raw', text: entry.stack }));
    }

    const footer = this.el('footer');
    footer.append(
      this.el('span', {
        text: entry.mapped || entry.frames.length === 0 ? 'Escape dismisses this.' : 'Resolving source maps…'
      })
    );
    this.panel.append(footer);
  }

  private step(delta: number): void {
    const next = this.shown + delta;
    if (next < 0 || next >= this.entries.length) {
      return;
    }
    this.shown = next;
    this.render();
    void this.resolveSources(this.entries[next]);
  }

  private copy(entry: Entry): void {
    const frames = entry.frames.map(frame =>
      frame.location === null ? frame.raw : `  at ${frame.fn ?? '(anonymous)'} (${formatFrame(frame)})`
    );
    const text = [entry.message, ...frames].join('\n');
    void this.view?.navigator.clipboard?.writeText(text).catch(() => {
      // A clipboard permission the page does not have is not worth a
      // second error on top of the one being reported.
    });
  }
}

/**
 * Mounts an error overlay over an application's host element.
 *
 *   const overlay = mountErrorOverlay(host);
 *   createApp({ renderWorker, onError: overlay.report });
 *   overlay.captureWindowErrors();
 */
export function mountErrorOverlay(host: HTMLElement, options: ErrorOverlayOptions = {}): ErrorOverlay {
  return new ErrorOverlay(host, options);
}

function renderCodeFrame(doc: Document, frame: CodeFrame): HTMLElement {
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options: { className?: string; text?: string } = {}
  ): HTMLElementTagNameMap[K] => element(doc, tag, options);
  const width = String(frame.lines[frame.lines.length - 1].number).length;
  const block = el('pre', { className: 'code' });
  for (const line of frame.lines) {
    const row = el('div', { className: line.target ? 'line target' : 'line' });
    row.append(
      el('span', { className: 'gutter', text: String(line.number).padStart(width, ' ') }),
      el('span', { className: 'text', text: line.text })
    );
    block.append(row);
    if (line.target) {
      const caret = el('div', { className: 'line caret' });
      caret.append(
        el('span', { className: 'gutter', text: ' '.repeat(width) }),
        el('span', { className: 'text', text: `${' '.repeat(Math.max(0, frame.column - 1))}^` })
      );
      block.append(caret);
    }
  }
  return block;
}

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  options: { className?: string; text?: string } = {}
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (options.className !== undefined) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    // Every string here came from a thrown error or a source file, so
    // it is set as text and never as markup.
    node.textContent = options.text;
  }
  return node;
}

function button(doc: Document, label: string, title: string, onClick: () => void): HTMLButtonElement {
  const node = element(doc, 'button', { text: label });
  node.type = 'button';
  node.title = title;
  node.setAttribute('aria-label', title);
  node.addEventListener('click', onClick);
  return node;
}

/**
 * The overlay's own styles, inside its shadow root.
 *
 * Shadow rather than a stylesheet in the page: an overlay that
 * inherited the application's CSS would be unreadable in exactly the
 * applications whose CSS is broken, and one that leaked its own rules
 * would be a development tool changing the thing being developed.
 *
 * Dark and monospace whatever the page is, because this is a tool
 * rather than a part of the app, and it should never be mistaken for
 * one.
 */
const STYLES = `
:host { all: initial; }
.scrim {
  position: absolute;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  background: rgba(12, 12, 16, 0.72);
  backdrop-filter: blur(2px);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #e6e6ea;
  overflow: auto;
}
.panel {
  width: min(860px, 100%);
  max-height: 100%;
  overflow: auto;
  box-sizing: border-box;
  padding: 16px 18px 12px;
  border: 1px solid #7f1d1d;
  border-radius: 8px;
  background: #17171c;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
  outline: none;
}
header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.spacer { flex: 1; }
.badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: #7f1d1d;
  color: #fee2e2;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 10px;
}
.repeats { color: #fca5a5; }
.count { color: #9a9aa5; }
button {
  font: inherit;
  color: #cfcfd6;
  background: #24242c;
  border: 1px solid #34343e;
  border-radius: 5px;
  padding: 2px 8px;
  cursor: pointer;
}
button:hover { background: #2e2e38; color: #fff; }
button:focus-visible { outline: 2px solid #f87171; outline-offset: 1px; }
h1 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: #fca5a5;
  white-space: pre-wrap;
  word-break: break-word;
}
.note { margin: 0 0 12px; color: #9a9aa5; max-width: 68ch; }
.code {
  margin: 0 0 12px;
  padding: 10px 12px;
  background: #101015;
  border: 1px solid #26262f;
  border-radius: 6px;
  overflow-x: auto;
}
.code .line { white-space: pre; }
.code .gutter { color: #55555f; margin-right: 12px; user-select: none; }
.code .target { background: rgba(127, 29, 29, 0.35); }
.code .caret .text { color: #f87171; }
ol.stack { margin: 0; padding: 0; list-style: none; }
ol.stack li { display: flex; gap: 10px; padding: 1px 0; }
ol.stack .fn { color: #d4d4dc; flex: 0 0 auto; }
ol.stack .at { color: #8b8b96; word-break: break-all; }
ol.stack .raw { color: #6f6f7a; }
pre.stack { margin: 0; white-space: pre-wrap; color: #8b8b96; }
footer { margin-top: 12px; color: #6f6f7a; }
`;
