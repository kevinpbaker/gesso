import { describe, expect, it, vi } from 'vitest';

import type { UiSemanticsRecord, UiSemanticsUpdate } from '@gesso/core';
import { SemanticsMirror, type EditingMirrorTarget, type SemanticsMirrorSink } from './SemanticsMirror';

/**
 * Just enough DOM for the mirror: a tree with ordered children,
 * attributes, text, focus that moves `activeElement`, and events that
 * bubble to the container the mirror listens on. Vitest runs in Node,
 * and what this class owes the DOM is exactly what these specs pin —
 * the same approach `EditingProxy.spec` takes.
 */
class FakeElement {
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  tabIndex = 0;
  textContent = '';
  rect = { left: 24, top: 16, width: 800, height: 600 };

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly tag: string
  ) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  appendChild(child: FakeElement): void {
    child.remove();
    child.parent = this;
    this.children.push(child);
  }

  insertBefore(child: FakeElement, before: FakeElement | null): void {
    child.remove();
    child.parent = this;
    const index = before === null ? -1 : this.children.indexOf(before);
    if (index < 0) {
      this.children.push(child);
    } else {
      this.children.splice(index, 0, child);
    }
  }

  remove(): void {
    const index = this.parent?.children.indexOf(this) ?? -1;
    if (this.parent !== null && index >= 0) {
      this.parent.children.splice(index, 1);
    }
    this.parent = null;
  }

  contains(other: FakeElement | null): boolean {
    for (let node = other; node !== null; node = node.parent) {
      if (node === this) {
        return true;
      }
    }
    return false;
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

  /** Dispatches an event that bubbles, as a DOM event does. */
  dispatch(type: string, init: Partial<FakeEvent> = {}): FakeEvent {
    const event = new FakeEvent(type, { target: this, ...init });
    const path: FakeElement[] = [this];
    while (path[path.length - 1].parent !== null) {
      path.push(path[path.length - 1].parent!);
    }
    for (const node of path) {
      for (const listener of node.listeners.get(type) ?? []) {
        listener(event);
      }
    }
    return event;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  focus(): void {
    const previous = this.ownerDocument.activeElement;
    if (previous === this) {
      return;
    }
    this.ownerDocument.activeElement = this;
    this.dispatch('focusin', { relatedTarget: previous });
  }
}

class FakeEvent {
  target: FakeElement | null = null;
  relatedTarget: FakeElement | null = null;
  key = '';

  constructor(
    readonly type: string,
    init: Partial<FakeEvent>
  ) {
    Object.assign(this, init);
  }
}

class FakeDocument {
  readonly body: FakeElement;
  activeElement: FakeElement | null;
  readonly defaultView = { addEventListener: vi.fn(), removeEventListener: vi.fn() };

  constructor() {
    this.body = new FakeElement(this, 'body');
    this.activeElement = this.body;
  }

  createElement(tag: string): FakeElement {
    return new FakeElement(this, tag);
  }
}

function record(id: string, overrides: Partial<UiSemanticsRecord> = {}): UiSemanticsRecord {
  return { id, parent: null, index: 0, ...overrides };
}

function update(overrides: Partial<UiSemanticsUpdate> = {}): UiSemanticsUpdate {
  return { patches: [], boxes: [], ...overrides };
}

function setup(editing: (EditingMirrorTarget & { described: UiSemanticsRecord | null }) | null = null) {
  const doc = new FakeDocument();
  const canvas = doc.createElement('canvas');
  doc.body.appendChild(canvas);
  canvas.focus();
  const actions: unknown[] = [];
  const keys: string[] = [];
  const sink: SemanticsMirrorSink = {
    action: action => void actions.push(action),
    keyDown: event => void keys.push(`down:${event.key}`),
    keyUp: event => void keys.push(`up:${event.key}`)
  };
  const mirror = new SemanticsMirror(
    canvas as unknown as HTMLCanvasElement,
    sink,
    editing as EditingMirrorTarget | null
  );
  const container = mirror.element as unknown as FakeElement;
  const elementFor = (id: string): FakeElement => mirror.elementFor(id) as unknown as FakeElement;
  const apply = (next: Partial<UiSemanticsUpdate>): void => mirror.apply(update(next));
  return { doc, canvas, mirror, container, actions, keys, elementFor, apply };
}

function fakeEditing(active: boolean): EditingMirrorTarget & { described: UiSemanticsRecord | null; focused: number } {
  return {
    active,
    described: null,
    focused: 0,
    describe(next) {
      this.described = next;
    },
    focus() {
      this.focused++;
    }
  };
}

describe('SemanticsMirror', () => {
  it('mirrors a record as an element carrying its ARIA', () => {
    const { container, elementFor, apply } = setup();

    const button = record('n1', { role: 'button', label: 'Save', description: 'Writes the file' });
    apply({ patches: [{ op: 'add', node: button }] });

    expect(container.children).toHaveLength(1);
    const element = elementFor('n1');
    expect(element.getAttribute('role')).toBe('button');
    expect(element.getAttribute('aria-label')).toBe('Save');
    expect(element.getAttribute('aria-description')).toBe('Writes the file');
    // Not in the browser's tab order: the app owns its focus order.
    expect(element.tabIndex).toBe(-1);
  });

  it('writes prose as text rather than as a label', () => {
    const { elementFor, apply } = setup();
    apply({ patches: [{ op: 'add', node: record('n1', { label: 'All notes saved' }) }] });

    const element = elementFor('n1');
    expect(element.textContent).toBe('All notes saved');
    expect(element.getAttribute('aria-label')).toBeNull();
    expect(element.getAttribute('role')).toBeNull();
  });

  it('turns states, values and set position into ARIA attributes', () => {
    const { elementFor, apply } = setup();
    apply({
      patches: [
        {
          op: 'add',
          node: record('n1', {
            role: 'checkbox',
            label: 'Wrap lines',
            states: ['checked', 'required'],
            disabled: true,
            posInSet: 2,
            setSize: 5
          })
        }
      ]
    });

    const element = elementFor('n1');
    expect(element.getAttribute('aria-checked')).toBe('true');
    expect(element.getAttribute('aria-required')).toBe('true');
    expect(element.getAttribute('aria-disabled')).toBe('true');
    expect(element.getAttribute('aria-posinset')).toBe('2');
    expect(element.getAttribute('aria-setsize')).toBe('5');
  });

  it('clears an attribute a record stopped saying', () => {
    const { elementFor, apply } = setup();
    const checked = record('n1', { role: 'checkbox', label: 'Wrap', states: ['checked'] });
    apply({ patches: [{ op: 'add', node: checked }] });
    apply({
      patches: [{ op: 'update', node: record('n1', { role: 'checkbox', label: 'Wrap' }) }]
    });

    expect(elementFor('n1').getAttribute('aria-checked')).toBeNull();
  });

  it('nests records under their parent, in index order', () => {
    const { elementFor, apply } = setup();
    apply({
      patches: [
        { op: 'add', node: record('list', { role: 'list', label: 'Notes' }) },
        { op: 'add', node: record('r0', { parent: 'list', index: 0, role: 'listitem', label: 'Row 0' }) },
        { op: 'add', node: record('r1', { parent: 'list', index: 1, role: 'listitem', label: 'Row 1' }) }
      ]
    });

    const list = elementFor('list');
    expect(list.children.map(child => child.getAttribute('aria-label'))).toEqual(['Row 0', 'Row 1']);

    // The first row leaves; the second takes its place, and the
    // reading order has to follow.
    apply({
      patches: [
        { op: 'remove', id: 'r0' },
        { op: 'update', node: record('r1', { parent: 'list', index: 0, role: 'listitem', label: 'Row 1' }) }
      ]
    });
    expect(list.children.map(child => child.getAttribute('aria-label'))).toEqual(['Row 1']);
  });

  it('positions elements over the canvas from the boxes it is sent', () => {
    const { container, elementFor, apply } = setup();
    apply({
      patches: [{ op: 'add', node: record('n1', { role: 'button', label: 'Save' }) }],
      boxes: [{ id: 'n1', box: { x: 12, y: 40, width: 80, height: 32 } }]
    });

    const element = elementFor('n1');
    expect(element.style.left).toBe('12px');
    expect(element.style.top).toBe('40px');
    expect(element.style.width).toBe('80px');
    expect(element.style.height).toBe('32px');
    // The container sits exactly over the canvas, so the boxes are
    // already in the right coordinate space.
    expect(container.style.left).toBe('24px');
    expect(container.style.top).toBe('16px');
  });

  it('moves DOM focus to follow the app, and back to the canvas when nothing has it', () => {
    const { elementFor, doc, canvas, actions, apply } = setup();
    apply({
      patches: [{ op: 'add', node: record('n1', { role: 'button', label: 'Save' }) }],
      focused: 'n1'
    });

    expect(doc.activeElement).toBe(elementFor('n1'));
    // Focus the mirror moved itself is not an assistive technology
    // moving it, so nothing goes back to the runtime.
    expect(actions).toEqual([]);

    apply({ focused: null });
    expect(doc.activeElement).toBe(canvas);
  });

  it('reports focus an assistive technology moved itself', () => {
    const { elementFor, actions, apply } = setup();
    apply({
      patches: [
        { op: 'add', node: record('n1', { role: 'button', label: 'Save' }) },
        { op: 'add', node: record('n2', { index: 1, role: 'button', label: 'Cancel' }) }
      ],
      focused: 'n1'
    });

    elementFor('n2').focus();

    expect(actions).toEqual([{ id: 'n2', action: 'focus' }]);
  });

  it('sends a press as a click action', () => {
    const { elementFor, actions, apply } = setup();
    apply({ patches: [{ op: 'add', node: record('n1', { role: 'button', label: 'Save' }) }] });

    elementFor('n1').dispatch('click');

    expect(actions).toEqual([{ id: 'n1', action: 'click' }]);
  });

  it('forwards keys that reached a mirrored element', () => {
    const { elementFor, keys, apply } = setup();
    apply({ patches: [{ op: 'add', node: record('n1', { role: 'button', label: 'Save' }) }] });

    elementFor('n1').dispatch('keydown', { key: 'Enter' });
    elementFor('n1').dispatch('keyup', { key: 'Enter' });

    expect(keys).toEqual(['down:Enter', 'up:Enter']);
  });

  it('leaves a focused editable to the editing proxy, and describes it there', () => {
    const editing = fakeEditing(true);
    const { elementFor, doc, apply } = setup(editing);
    const field = record('n1', { role: 'textbox', label: 'Email', valueText: 'ada@example.com' });
    apply({ patches: [{ op: 'add', node: field }], focused: 'n1' });

    // The hidden textarea keeps DOM focus: it is the only element an
    // IME will compose into.
    expect(doc.activeElement).not.toBe(elementFor('n1'));
    expect(editing.described?.label).toBe('Email');
    expect(editing.focused).toBe(1);
  });

  it('clears the proxy description when focus leaves the field', () => {
    const editing = fakeEditing(false);
    const { apply } = setup(editing);
    editing.described = record('n1', { role: 'textbox', label: 'Email' });
    apply({ focused: null });

    expect(editing.described).toBeNull();
  });

  it('removes its container on dispose', () => {
    const { mirror, container, doc } = setup();
    mirror.dispose();

    expect(doc.body.children).not.toContain(container);
  });
});
