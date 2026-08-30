import { describe, expect, it, vi } from 'vitest';

import type { EditingState } from '@gesso/core';
import { EditingProxy, type EditingProxySink } from './EditingProxy';

/**
 * Just enough DOM for the proxy: elements with listeners, focus that
 * moves `activeElement` and fires blur/focus, a textarea's value and
 * selection, and a document with a body and a window. Vitest runs in
 * Node, and the proxy's contract with the DOM is exactly what these
 * specs pin.
 */
class FakeElement {
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  tabIndex = 0;
  value = '';
  selectionStart = 0;
  selectionEnd = 0;
  parent: FakeElement | null = null;
  readonly children: FakeElement[] = [];
  rect = { left: 100, top: 50, width: 800, height: 600 };

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly tag: string
  ) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    let set = this.listeners.get(type);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (event: FakeEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, init: Partial<FakeEvent> = {}): FakeEvent {
    const event = new FakeEvent(type, init);
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
    return event;
  }

  appendChild(child: FakeElement): void {
    child.parent = this;
    this.children.push(child);
  }

  remove(): void {
    if (this.parent !== null) {
      const index = this.parent.children.indexOf(this);
      if (index >= 0) {
        this.parent.children.splice(index, 1);
      }
      this.parent = null;
    }
  }

  getBoundingClientRect() {
    return this.rect;
  }

  setSelectionRange(start: number, end: number): void {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  focus(): void {
    const previous = this.ownerDocument.activeElement;
    if (previous === this) {
      return;
    }
    this.ownerDocument.activeElement = this;
    previous?.dispatch('blur', { relatedTarget: this });
    this.dispatch('focus', { relatedTarget: previous });
  }

  blur(): void {
    if (this.ownerDocument.activeElement !== this) {
      return;
    }
    this.ownerDocument.activeElement = this.ownerDocument.body;
    this.dispatch('blur', { relatedTarget: null });
  }
}

class FakeEvent {
  defaultPrevented = false;
  inputType = '';
  data: string | null = null;
  relatedTarget: FakeElement | null = null;
  clipboardData: { getData(type: string): string; setData(type: string, value: string): void } | null = null;
  key = '';

  constructor(
    readonly type: string,
    init: Partial<FakeEvent>
  ) {
    Object.assign(this, init);
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

class FakeDocument {
  readonly body: FakeElement;
  activeElement: FakeElement | null;
  readonly defaultView = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  focused = true;

  constructor() {
    this.body = new FakeElement(this, 'body');
    this.activeElement = this.body;
  }

  createElement(tag: string): FakeElement {
    return new FakeElement(this, tag);
  }

  hasFocus(): boolean {
    return this.focused;
  }
}

function createSink(): EditingProxySink & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) =>
      void calls.push([name, ...args]);
  return {
    calls,
    beforeInput: record('beforeInput'),
    compositionStart: record('compositionStart'),
    compositionUpdate: record('compositionUpdate'),
    compositionEnd: record('compositionEnd'),
    paste: record('paste'),
    blur: record('blur'),
    keyDown: record('keyDown'),
    keyUp: record('keyUp')
  };
}

function setup() {
  const doc = new FakeDocument();
  const canvas = doc.createElement('canvas');
  doc.body.appendChild(canvas);
  canvas.focus();
  const sink = createSink();
  const proxy = new EditingProxy(canvas as unknown as HTMLCanvasElement, sink);
  const textarea = proxy.element as unknown as FakeElement;
  const state = (overrides: Partial<EditingState> = {}): EditingState => ({
    text: 'hello world',
    selectionStart: 5,
    selectionEnd: 5,
    caret: { x: 40, y: 20, width: 1, height: 17 },
    multiline: false,
    composing: false,
    ...overrides
  });
  return { doc, canvas, sink, proxy, textarea, state };
}

describe('EditingProxy', () => {
  it('creates a hidden textarea in the body that is not in the tab order', () => {
    const { doc, textarea } = setup();
    expect(textarea.tag).toBe('textarea');
    expect(textarea.parent).toBe(doc.body);
    expect(textarea.tabIndex).toBe(-1);
    expect(textarea.style.opacity).toBe('0');
    expect(textarea.attributes.get('autocomplete')).toBe('off');
  });

  it('takes focus from the canvas, mirrors the text and selection, and sits at the caret', () => {
    const { doc, proxy, textarea, state } = setup();
    proxy.update(state());
    expect(proxy.active).toBe(true);
    expect(doc.activeElement).toBe(textarea);
    expect(textarea.value).toBe('hello world');
    expect(textarea.selectionStart).toBe(5);
    expect(textarea.style.left).toBe('140px');
    expect(textarea.style.top).toBe('70px');
    expect(textarea.style.height).toBe('17px');
  });

  it('does not steal focus from page chrome', () => {
    const { doc, proxy, state } = setup();
    const chrome = doc.createElement('input');
    doc.body.appendChild(chrome);
    chrome.focus();
    proxy.update(state());
    expect(doc.activeElement).toBe(chrome);
  });

  it('hands focus back to the canvas when no editable is focused', () => {
    const { doc, canvas, proxy, state, sink } = setup();
    proxy.update(state());
    proxy.update(null);
    expect(proxy.active).toBe(false);
    expect(doc.activeElement).toBe(canvas);
    // Our own blur is not a report that focus left the app.
    expect(sink.calls.filter(call => call[0] === 'blur')).toEqual([]);
  });

  it('forwards beforeinput as an edit intent and cancels it', () => {
    const { proxy, textarea, sink, state } = setup();
    proxy.update(state());
    const event = textarea.dispatch('beforeinput', { inputType: 'insertText', data: 'x' });
    expect(event.defaultPrevented).toBe(true);
    expect(sink.calls).toEqual([['beforeInput', 'insertText', 'x']]);
    textarea.dispatch('beforeinput', { inputType: 'insertReplacementText', data: 'y' });
    expect(sink.calls.at(-1)).toEqual(['beforeInput', 'insertReplacementText', 'y']);
  });

  it('cancels but does not forward the edits the keys already carry', () => {
    // Backspace reaches the runtime as a key press and is applied there;
    // forwarding the textarea's deleteContentBackward too deleted twice.
    const { proxy, textarea, sink, state } = setup();
    proxy.update(state());
    for (const inputType of [
      'deleteContentBackward',
      'deleteContentForward',
      'deleteWordBackward',
      'deleteSoftLineBackward',
      'insertLineBreak',
      'insertParagraph',
      'historyUndo',
      'historyRedo'
    ]) {
      expect(textarea.dispatch('beforeinput', { inputType }).defaultPrevented).toBe(true);
    }
    expect(textarea.dispatch('beforeinput', { inputType: 'insertFromPaste', data: 'p' }).defaultPrevented).toBe(true);
    expect(sink.calls).toEqual([]);
  });

  it('runs a composition: empties itself at the start, reports each input, commits at the end', () => {
    const { proxy, textarea, sink, state } = setup();
    proxy.update(state());
    textarea.dispatch('compositionstart');
    expect(textarea.value).toBe('');
    expect(sink.calls).toEqual([['compositionStart']]);

    // The IME writes into the empty element; those inputs are not cancellable.
    const composing = textarea.dispatch('beforeinput', { inputType: 'insertCompositionText', data: 'n' });
    expect(composing.defaultPrevented).toBe(false);
    textarea.value = 'n';
    textarea.setSelectionRange(1, 1);
    textarea.dispatch('input');
    textarea.value = 'ni';
    textarea.setSelectionRange(2, 2);
    textarea.dispatch('input');
    expect(sink.calls.slice(1)).toEqual([
      ['compositionUpdate', 'n', 1],
      ['compositionUpdate', 'ni', 2]
    ]);

    // A state arriving mid-composition must not overwrite the IME's text.
    proxy.update(state({ text: 'hello nworld' }));
    expect(textarea.value).toBe('ni');

    textarea.dispatch('compositionend', { data: '你' });
    expect(sink.calls.at(-1)).toEqual(['compositionEnd', '你']);
    // Mirrored again from the last known state.
    expect(textarea.value).toBe('hello nworld');
    // Later inputs are ordinary again.
    textarea.dispatch('input');
    expect(sink.calls.at(-1)).toEqual(['compositionEnd', '你']);
  });

  it('pastes from the clipboard event and copies or cuts the runtime selection', () => {
    const { proxy, textarea, sink, state } = setup();
    proxy.update(state({ selectionStart: 0, selectionEnd: 5 }));
    const written: string[] = [];
    const clipboardData = {
      getData: () => 'pasted',
      setData: (_type: string, value: string) => void written.push(value)
    };
    expect(textarea.dispatch('paste', { clipboardData }).defaultPrevented).toBe(true);
    expect(sink.calls.at(-1)).toEqual(['paste', 'pasted']);
    textarea.dispatch('copy', { clipboardData });
    expect(written).toEqual(['hello']);
    textarea.dispatch('cut', { clipboardData });
    expect(written).toEqual(['hello', 'hello']);
    expect(sink.calls.at(-1)).toEqual(['beforeInput', 'deleteByCut', null]);
  });

  it('forwards key events from the textarea', () => {
    const { proxy, textarea, sink, state } = setup();
    proxy.update(state());
    textarea.dispatch('keydown', { key: 'ArrowLeft' });
    textarea.dispatch('keyup', { key: 'ArrowLeft' });
    expect(sink.calls.map(call => call[0])).toEqual(['keyDown', 'keyUp']);
  });

  it('reports focus leaving for something other than the canvas, but not the window blurring', () => {
    const { doc, canvas, proxy, textarea, sink, state } = setup();
    proxy.update(state());
    textarea.dispatch('blur', { relatedTarget: canvas });
    expect(sink.calls).toEqual([]);
    doc.focused = false;
    textarea.dispatch('blur', { relatedTarget: null });
    expect(sink.calls).toEqual([]);
    doc.focused = true;
    textarea.dispatch('blur', { relatedTarget: doc.createElement('input') });
    expect(sink.calls).toEqual([['blur']]);
  });

  it("carries the focused editable's semantics for the accessibility mirror", () => {
    const { proxy, textarea, state } = setup();
    proxy.update(state());
    // Hidden from assistive technology by default: an unlabelled text
    // box floating over an application is noise.
    expect(textarea.attributes.get('aria-hidden')).toBe('true');

    proxy.describe({
      id: 'n1',
      parent: null,
      index: 0,
      role: 'textbox',
      label: 'Email',
      states: ['required']
    });

    expect(textarea.attributes.has('aria-hidden')).toBe(false);
    expect(textarea.attributes.get('role')).toBe('textbox');
    expect(textarea.attributes.get('aria-label')).toBe('Email');
    expect(textarea.attributes.get('aria-required')).toBe('true');

    proxy.describe(null);
    expect(textarea.attributes.get('aria-hidden')).toBe('true');
    expect(textarea.attributes.has('aria-label')).toBe(false);
  });

  it('takes focus back from whatever the mirror had focused', () => {
    const { doc, proxy, textarea, state } = setup();
    const mirrored = doc.createElement('div');
    doc.body.appendChild(mirrored);
    mirrored.focus();
    proxy.update(state());
    // `update` leaves focus alone when it is somewhere it does not
    // recognise; the mirror is the one that knows this element is the
    // app's own, and says so by calling focus().
    expect(doc.activeElement).toBe(mirrored);

    proxy.focus();

    expect(doc.activeElement).toBe(textarea);
  });

  it('removes the element and listeners on dispose', () => {
    const { doc, proxy, textarea, state } = setup();
    proxy.update(state());
    proxy.dispose();
    expect(textarea.parent).toBeNull();
    expect(doc.defaultView.removeEventListener).toHaveBeenCalled();
    expect(() => proxy.update(state())).not.toThrow();
  });
});
