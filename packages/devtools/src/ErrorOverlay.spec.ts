import { describe, expect, it, vi } from 'vitest';

import { ErrorOverlay } from './ErrorOverlay';
import { SourceMapStore } from './sourceMap';

/**
 * Just enough DOM for the overlay: elements with children, text,
 * classes, listeners and a shadow root.
 *
 * The suite runs in Node, and this is the approach `SemanticsMirror`
 * and `EditingProxy` already take — the overlay builds everything off
 * the document of the element it was handed, so a fake document is all
 * it takes to drive it. What a real browser has to answer instead is
 * whether the thing is legible, which is a screenshot's job and not a
 * spec's.
 */
class FakeElement {
  /**
   * A real `style` answers '' for a property nobody set, and the
   * overlay reads `position` before it writes it — so a plain object,
   * which answers undefined, would let a restore-on-dispose bug
   * through.
   */
  readonly style: Record<string, string> = new Proxy<Record<string, string>>(
    {},
    { get: (target, key) => (typeof key === 'string' ? (target[key] ?? '') : undefined) }
  );
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, ((event: unknown) => void)[]>();
  readonly attributes = new Map<string, string>();
  className = '';
  textContent = '';
  title = '';
  type = '';
  tabIndex = 0;
  focused = false;
  shadow: FakeElement | null = null;
  parent: FakeElement | null = null;

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly tag: string
  ) {}

  attachShadow(): FakeElement {
    this.shadow = new FakeElement(this.ownerDocument, '#shadow');
    return this.shadow;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  appendChild(child: FakeElement): void {
    this.append(child);
  }

  replaceChildren(): void {
    this.children.length = 0;
  }

  remove(): void {
    const index = this.parent?.children.indexOf(this) ?? -1;
    if (this.parent !== null && index >= 0) {
      this.parent.children.splice(index, 1);
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  focus(): void {
    this.focused = true;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      existing.filter(entry => entry !== listener)
    );
  }

  dispatch(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  /** Every element in this subtree, self first. */
  all(): FakeElement[] {
    return [this as FakeElement, ...this.children.flatMap(child => child.all())];
  }

  /** All the text in this subtree, in document order. */
  text(): string {
    return this.all()
      .map(element => element.textContent)
      .filter(text => text !== '')
      .join(' ');
  }

  /** The first descendant with a class, for a spec that wants one. */
  byClass(name: string): FakeElement | undefined {
    return this.all().find(element => element.className.split(' ').includes(name));
  }

  /** A button by its accessible name, which is how a person finds it. */
  byLabel(label: string): FakeElement | undefined {
    return this.all().find(element => element.attributes.get('aria-label') === label);
  }
}

class FakeDocument {
  readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      existing.filter(entry => entry !== listener)
    );
  }

  /**
   * Fires an event at the document, where the overlay captures keys.
   *
   * `removeEventListener` above replaces the array rather than
   * splicing it, so a listener that detaches itself mid-dispatch —
   * which is exactly what Escape does — does not disturb this loop.
   */
  dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  readonly defaultView = {
    getComputedStyle: () => ({ position: 'static' }),
    location: { origin: 'http://localhost:5173' },
    navigator: { clipboard: { writeText: vi.fn(async () => {}) } },
    listeners: new Map<string, ((event: unknown) => void)[]>(),
    addEventListener(type: string, listener: (event: unknown) => void) {
      const existing = this.listeners.get(type) ?? [];
      existing.push(listener);
      this.listeners.set(type, existing);
    },
    removeEventListener(type: string, listener: (event: unknown) => void) {
      const existing = this.listeners.get(type) ?? [];
      this.listeners.set(
        type,
        existing.filter(entry => entry !== listener)
      );
    },
    dispatch(type: string, event: unknown) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }
  };

  createElement(tag: string): FakeElement {
    return new FakeElement(this, tag);
  }
}

function mount(options: { sourceMaps?: SourceMapStore } = {}) {
  const doc = new FakeDocument();
  const host = doc.createElement('div');
  const overlay = new ErrorOverlay(host as unknown as HTMLElement, { echoToConsole: false, ...options });
  // The container is the host's only child; its shadow root holds the panel.
  const container = host.children[0];
  return { doc, host, overlay, container, panel: () => container.shadow!.byClass('panel')! };
}

const STACK = ['Error: boom', '    at NoteRow.render (http://localhost:5173/src/Notes.tsx?t=17:154:11)'].join('\n');

describe('ErrorOverlay', () => {
  it('stays out of the way until something goes wrong', () => {
    const { container } = mount();

    expect(container.style.display).toBe('none');
  });

  it('shows the message, its origin and the frames when an error arrives', () => {
    const { overlay, container, panel } = mount();

    overlay.report('boom', STACK, 'uncaught');

    expect(container.style.display).toBe('block');
    expect(panel().text()).toContain('boom');
    expect(panel().text()).toContain('render worker');
    // The frame's compiled location, until a source map says otherwise.
    expect(panel().text()).toContain('/src/Notes.tsx:154:11');
    expect(panel().focused).toBe(true);
  });

  it('says what each origin costs the running application', () => {
    const { overlay, panel } = mount();

    // What `uncaught` means is the narrow set a forwarded tick cannot
    // reach, since the usual frame arrives as a message and is caught
    // there: see `decisions/0036-error-overlay.md`, amended by 0039.
    overlay.report('boom', undefined, 'uncaught');
    expect(panel().text()).toContain('the clock paced itself');

    // And `message` is where a frame most often lands, so this note
    // must not tell a reader the application is intact.
    overlay.report('halt', undefined, 'message');
    expect(panel().text()).toContain('a frame that did not finish');

    overlay.report('nope', undefined, 'channel');
    expect(panel().text()).toContain('data behind it has stopped');
  });

  it('counts a repeat instead of stacking up copies of it', () => {
    const { overlay, panel } = mount();

    overlay.report('boom', STACK, 'uncaught');
    overlay.report('boom', STACK, 'uncaught');
    overlay.report('boom', STACK, 'uncaught');

    expect(overlay.count).toBe(1);
    expect(panel().text()).toContain('×3');
  });

  it('does not reopen after a dismissal, however often the error repeats', () => {
    // An error thrown every frame would otherwise be impossible to get
    // out of the way of, and getting it out of the way is how you look
    // at the application underneath.
    const { overlay, container } = mount();

    overlay.report('boom', STACK, 'uncaught');
    overlay.hide();
    overlay.report('boom', STACK, 'uncaught');

    expect(container.style.display).toBe('none');
  });

  it('reopens for an error that is genuinely new', () => {
    const { overlay, container, panel } = mount();

    overlay.report('boom', STACK, 'uncaught');
    overlay.hide();
    overlay.report('a different failure', STACK, 'uncaught');

    expect(container.style.display).toBe('block');
    expect(panel().text()).toContain('a different failure');
  });

  it('keeps every distinct error and steps between them', () => {
    const { overlay, panel } = mount();

    overlay.report('first', undefined, 'uncaught');
    overlay.report('second', undefined, 'uncaught');

    expect(panel().text()).toContain('2 / 2');
    panel().byLabel('Previous error')?.dispatch('click');
    expect(panel().text()).toContain('first');
    expect(panel().text()).toContain('1 / 2');
  });

  it('dismisses on Escape, wherever focus happens to be', () => {
    // Focus is not the overlay's to hold — the accessibility mirror
    // moves DOM focus to follow the application's own — so the key is
    // taken at the document rather than from the panel.
    const { doc, overlay, container } = mount();
    const escape = { key: 'Escape', preventDefault: () => {}, stopPropagation: () => {} };

    overlay.report('boom', STACK, 'uncaught');
    doc.dispatch('keydown', escape);
    expect(container.style.display).toBe('none');

    // And once dismissed it stops listening, so Escape is the app's again.
    expect(doc.listeners.get('keydown')).toHaveLength(0);
  });

  it('replaces the compiled stack with the source once the map resolves', async () => {
    const map = JSON.stringify({
      version: 3,
      sources: ['src/Notes.tsx'],
      sourcesContent: ['const notes = [];\nfunction row() {\n  return notes[0].title;\n}\n'],
      // The generated 1:1 is the original 3:10 (0-based 2:9).
      mappings: 'AAES'
    });
    const store = new SourceMapStore(async () => `//# sourceMappingURL=data:application/json;base64,${btoa(map)}`);
    const { overlay, panel } = mount({ sourceMaps: store });

    overlay.report('boom', 'Error: boom\n    at row (http://localhost:5173/src/Notes.js:1:1)', 'uncaught');
    await vi.waitFor(() => expect(panel().text()).toContain('src/Notes.tsx:3:10'));

    // And the line itself, which is the part a stack trace cannot give.
    expect(panel().byClass('code')?.text()).toContain('return notes[0].title;');
  });

  it('reports a thrown value that was never an Error', () => {
    const { overlay, panel } = mount();

    overlay.reportError('a string, thrown');

    expect(panel().text()).toContain('a string, thrown');
  });

  it('catches what the main thread throws too, until it is told to stop', () => {
    const { doc, overlay } = mount();

    const stop = overlay.captureWindowErrors(doc.defaultView as unknown as Window);
    doc.defaultView.dispatch('error', { error: new Error('shell broke') });
    expect(overlay.count).toBe(1);

    stop();
    doc.defaultView.dispatch('error', { error: new Error('after stopping') });
    expect(overlay.count).toBe(1);
  });

  it('puts the host back the way it found it', () => {
    const { host, overlay } = mount();

    // A `static` host cannot contain an absolutely positioned overlay,
    // so mounting makes it a containing block — and disposing undoes it.
    expect(host.style.position).toBe('relative');
    overlay.dispose();

    expect(host.style.position).toBe('');
    expect(host.children).toHaveLength(0);
  });

  it('goes quiet after dispose', () => {
    const { overlay, container } = mount();

    overlay.dispose();
    overlay.report('too late', STACK, 'uncaught');

    expect(container.style.display).toBe('none');
  });
});
