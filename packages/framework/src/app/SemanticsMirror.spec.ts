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
  /**
   * Every style property this element has ever been assigned, in order,
   * as `name:value`.
   *
   * A style write is the cost these specs are about, and it is a cost
   * whether or not the value changed: assigning the same string still
   * invalidates the element's style. So counting assignments is the
   * only measurement that can tell the fix from the bug — reading
   * `style.left` afterwards looks identical either way. Hence the proxy
   * rather than a plain object: `Object.assign`, which is how the
   * mirror sets up an element, goes through the set trap too.
   */
  readonly styleWrites: string[] = [];

  readonly style: Record<string, string> = new Proxy({} as Record<string, string>, {
    set: (target, property, value: string) => {
      this.styleWrites.push(`${String(property)}:${value}`);
      target[property as string] = value;
      return true;
    }
  });

  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  tabIndex = 0;
  rect = { left: 24, top: 16, width: 800, height: 600 };

  /**
   * Text, with the DOM's own destructive semantics.
   *
   * Assigning `textContent` replaces *every* child node, elements
   * included. Modelling it as a plain field, which this did at first,
   * makes the fake disagree with the browser in the one way that
   * matters for a container: the mirror writes `textContent` while
   * describing a node, and in a real document that empties it. A
   * labelled `tablist` full of tabs came back from Chrome as a leaf
   * while these specs said it was fine.
   */
  private text = '';

  get textContent(): string {
    return this.text;
  }

  set textContent(value: string) {
    this.text = value;
    for (const child of this.children.splice(0)) {
      child.parent = null;
    }
  }

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

  it('writes a status as live text, so a screen reader announces the change', () => {
    const { elementFor, apply } = setup();
    apply({
      patches: [{ op: 'add', node: record('n1', { role: 'status', label: 'Passcode, 0 of 6 digits entered' }) }]
    });

    const element = elementFor('n1');
    expect(element.getAttribute('role')).toBe('status');
    // Named by the label, as every control is, and carrying the same
    // words as content: a live region announces what its content
    // becomes, and an aria-label changing on its own would be silent.
    expect(element.getAttribute('aria-label')).toBe('Passcode, 0 of 6 digits entered');
    expect(element.textContent).toBe('Passcode, 0 of 6 digits entered');

    apply({ patches: [{ op: 'add', node: record('n2', { role: 'group', label: 'Feed', live: 'polite' }) }] });
    expect(elementFor('n2').getAttribute('aria-live')).toBe('polite');
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
    const required = record('n1', { role: 'textbox', label: 'Name', states: ['required'] });
    apply({ patches: [{ op: 'add', node: required }] });
    apply({
      patches: [{ op: 'update', node: record('n1', { role: 'textbox', label: 'Name' }) }]
    });

    expect(elementFor('n1').getAttribute('aria-required')).toBeNull();
  });

  it('says a checkable role is not checked, rather than saying nothing', () => {
    // A control publishes `checked` when it is on and nothing when it is
    // off, which is the right shape for a state list and the wrong shape
    // for ARIA: on these roles the attribute is required, and an absent
    // one reads as "not a checkbox" rather than "not checked". A
    // `RadioGroup` in a native window is where this was noticed.
    const { elementFor, apply } = setup();
    apply({
      patches: [
        { op: 'add', node: record('n1', { role: 'radio', label: 'Newest first', states: ['checked'] }) },
        { op: 'add', node: record('n2', { role: 'radio', label: 'Title' }) },
        { op: 'add', node: record('n3', { role: 'switch', label: 'Wrap lines' }) },
        { op: 'add', node: record('n4', { role: 'button', label: 'Save' }) }
      ]
    });

    expect(elementFor('n1').getAttribute('aria-checked')).toBe('true');
    expect(elementFor('n2').getAttribute('aria-checked')).toBe('false');
    expect(elementFor('n3').getAttribute('aria-checked')).toBe('false');
    // Not every role has a checked state to report.
    expect(elementFor('n4').getAttribute('aria-checked')).toBeNull();
  });

  it('turns a checkable role back to false when it stops being checked', () => {
    const { elementFor, apply } = setup();
    apply({ patches: [{ op: 'add', node: record('n1', { role: 'checkbox', label: 'Wrap', states: ['checked'] }) }] });
    apply({ patches: [{ op: 'update', node: record('n1', { role: 'checkbox', label: 'Wrap' }) }] });

    expect(elementFor('n1').getAttribute('aria-checked')).toBe('false');
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

  it('offsets a nested element from its parent, so its rectangle stands where the box is', () => {
    // Every element is absolutely positioned inside its parent, so a
    // child written in canvas coordinates stood a parent's offset too
    // low: the bar's slider measured at y=1496 on an 813px page.
    const { elementFor, apply } = setup();
    apply({
      patches: [
        { op: 'add', node: record('bar', { role: 'region', label: 'Now playing' }) },
        { op: 'add', node: record('seek', { parent: 'bar', index: 0, role: 'slider', label: 'Seek' }) }
      ],
      boxes: [
        { id: 'bar', box: { x: 0, y: 700, width: 1280, height: 88 } },
        { id: 'seek', box: { x: 300, y: 740, width: 400, height: 26 } }
      ]
    });
    expect(elementFor('bar').style.top).toBe('700px');
    expect(elementFor('seek').style.left).toBe('300px');
    expect(elementFor('seek').style.top).toBe('40px');

    // The parent moves and the child's box does not: its offset follows.
    apply({ boxes: [{ id: 'bar', box: { x: 0, y: 600, width: 1280, height: 88 } }] });
    expect(elementFor('seek').style.top).toBe('140px');
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

describe('a labelled container and its children', () => {
  /**
   * The bug this pins: `describe` writes `element.textContent`, and
   * assigning `textContent` replaces every child node an element has,
   * elements included. A container that carries a role and a label
   * therefore loses whatever the mirror had already put inside it, and
   * a screen reader is told the container exists and nothing about
   * what is in it.
   *
   * Found on Segue's artist page, whose four tabs were absent from the
   * accessibility tree while drawing correctly on screen: a `tablist`
   * and a `tabpanel` were both leaves. It is not specific to tabs. Any
   * labelled `group`, `region` or `list` is a container, and the
   * screenshot gate cannot see this because the pixels are right.
   */
  it('keeps the children of a container that has a role and a label', () => {
    const { elementFor, apply } = setup();
    apply({
      patches: [
        { op: 'add', node: record('tabs', { role: 'tablist', label: 'What this artist has made' }) },
        { op: 'add', node: record('t0', { parent: 'tabs', index: 0, role: 'tab', label: 'Tracks' }) },
        { op: 'add', node: record('t1', { parent: 'tabs', index: 1, role: 'tab', label: 'Albums' }) }
      ]
    });
    const tabs = elementFor('tabs');
    expect(tabs.getAttribute('aria-label')).toBe('What this artist has made');
    expect(tabs.children.map(child => child.getAttribute('aria-label'))).toEqual(['Tracks', 'Albums']);
  });

  it('keeps them when the container is described again after they arrive', () => {
    // The order that actually happens: the container is placed, its
    // children are placed, and then something about the container
    // changes and it is described a second time.
    const { elementFor, apply } = setup();
    apply({
      patches: [
        { op: 'add', node: record('panel', { role: 'tabpanel', label: 'Tracks' }) },
        { op: 'add', node: record('row', { parent: 'panel', index: 0, role: 'button', label: 'A track' }) }
      ]
    });
    apply({ patches: [{ op: 'update', node: record('panel', { role: 'tabpanel', label: 'Albums' }) }] });
    const panel = elementFor('panel');
    expect(panel.getAttribute('aria-label')).toBe('Albums');
    expect(panel.children.map(child => child.getAttribute('aria-label'))).toEqual(['A track']);
  });
});

/**
 * What a scroll costs the main thread.
 *
 * A scroll marks the scroll container's transform, which counts as a
 * laid-out frame, so the render worker sends every moved box on every
 * scroll frame. Whatever `apply` does per box it therefore does sixty
 * times a second on the one thread the worker configuration exists to
 * keep idle, and a style write is not free even when the value is
 * unchanged: it invalidates that element's style either way.
 *
 * These specs count assignments rather than read values back, because
 * the end state was already correct before the fix — what was wrong was
 * how much work it took to get there.
 */
describe('the cost of a frame', () => {
  /** A list of rows, positioned, with the setup writes forgotten. */
  function scrollingList() {
    const harness = setup();
    harness.apply({
      patches: [
        { op: 'add', node: record('list', { role: 'list', label: 'Notes' }) },
        { op: 'add', node: record('r0', { parent: 'list', index: 0, role: 'listitem', label: 'Row 0' }) },
        { op: 'add', node: record('r1', { parent: 'list', index: 1, role: 'listitem', label: 'Row 1' }) },
        { op: 'add', node: record('r2', { parent: 'list', index: 2, role: 'listitem', label: 'Row 2' }) }
      ],
      boxes: [
        { id: 'list', box: { x: 0, y: 100, width: 300, height: 400 } },
        { id: 'r0', box: { x: 8, y: 108, width: 284, height: 40 } },
        { id: 'r1', box: { x: 8, y: 152, width: 284, height: 40 } },
        { id: 'r2', box: { x: 8, y: 196, width: 284, height: 40 } }
      ]
    });
    const rows = ['r0', 'r1', 'r2'].map(harness.elementFor);
    const list = harness.elementFor('list');
    for (const element of [list, ...rows]) {
      element.styleWrites.length = 0;
    }
    return { ...harness, list, rows };
  }

  it('writes nothing the second time the same boxes arrive', () => {
    const { list, rows, apply } = scrollingList();

    apply({
      boxes: [
        { id: 'list', box: { x: 0, y: 100, width: 300, height: 400 } },
        { id: 'r0', box: { x: 8, y: 108, width: 284, height: 40 } },
        { id: 'r1', box: { x: 8, y: 152, width: 284, height: 40 } },
        { id: 'r2', box: { x: 8, y: 196, width: 284, height: 40 } }
      ]
    });

    expect(list.styleWrites).toEqual([]);
    expect(rows.map(row => row.styleWrites)).toEqual([[], [], []]);
  });

  it('writes nothing for the rows of a list that scrolled with its container', () => {
    // The shape a scroll actually has: the container and everything
    // inside it move by one identical delta. Each row's offset *from
    // its parent* is therefore exactly what it was, and the row is
    // carried along by the DOM without being told anything.
    const { list, rows, apply } = scrollingList();

    apply({
      boxes: [
        { id: 'list', box: { x: 0, y: 80, width: 300, height: 400 } },
        { id: 'r0', box: { x: 8, y: 88, width: 284, height: 40 } },
        { id: 'r1', box: { x: 8, y: 132, width: 284, height: 40 } },
        { id: 'r2', box: { x: 8, y: 176, width: 284, height: 40 } }
      ]
    });

    expect(rows.map(row => row.styleWrites)).toEqual([[], [], []]);
    // The container itself moved, and that it is told about.
    expect(list.styleWrites).toEqual(['left:0px', 'top:80px', 'width:300px', 'height:400px']);
    expect(rows[1].style.top).toBe('52px');
  });

  it('ignores a subpixel change that rounds to the pixel already written', () => {
    // The worker compares boxes exactly, so a third of a pixel of drift
    // arrives here as a change. Rounded, it is the string that is
    // already on the element.
    const { list, apply } = scrollingList();

    apply({ boxes: [{ id: 'list', box: { x: 0.2, y: 100.1, width: 300.4, height: 399.9 } }] });

    expect(list.styleWrites).toEqual([]);
    expect(list.style.top).toBe('100px');
  });

  it('still repositions a child when only its parent moved', () => {
    // The correctness property none of the skipping may cost: after
    // `apply` returns, every element's offset is right relative to its
    // parent. A row whose own box did not change still has to give back
    // the distance its parent travelled.
    const { rows, apply } = scrollingList();

    apply({ boxes: [{ id: 'list', box: { x: 0, y: 300, width: 300, height: 400 } }] });

    expect(rows.map(row => row.style.top)).toEqual(['-192px', '-148px', '-104px']);
  });

  it('positions a child once when parent and child both moved, whichever order they arrive in', () => {
    // Two different deltas, so the row genuinely needs a write. It
    // needs exactly one: repositioning it for its parent as well wrote
    // an offset computed from the parent's new box and the row's old
    // one, which was a value the row was never meant to have.
    for (const reversed of [false, true]) {
      const { rows, apply } = scrollingList();
      const boxes = [
        { id: 'list', box: { x: 0, y: 60, width: 300, height: 400 } },
        { id: 'r1', box: { x: 8, y: 132, width: 284, height: 40 } }
      ];

      apply({ boxes: reversed ? [...boxes].reverse() : boxes });

      expect(rows[1].styleWrites).toEqual(['left:8px', 'top:72px', 'width:284px', 'height:40px']);
      // The rows this update said nothing about are repositioned for
      // the parent that moved under them, once each.
      expect(rows[0].styleWrites).toEqual(['left:8px', 'top:48px', 'width:284px', 'height:40px']);
      expect(rows[2].styleWrites).toEqual(['left:8px', 'top:136px', 'width:284px', 'height:40px']);
    }
  });

  it('keeps the offset of a reparented element right, cache and all', () => {
    // The cache holds what was written, not the box it came from, so
    // the offset is recomputed against whichever parent the record
    // names now. Moving the row to a container at a different origin
    // changes that offset, and the write happens.
    const { rows, apply } = scrollingList();
    apply({
      patches: [{ op: 'add', node: record('other', { index: 1, role: 'list', label: 'Archive' }) }],
      boxes: [{ id: 'other', box: { x: 0, y: 500, width: 300, height: 200 } }]
    });

    apply({
      patches: [{ op: 'update', node: record('r1', { parent: 'other', index: 0, role: 'listitem', label: 'Row 1' }) }]
    });

    expect(rows[1].style.top).toBe('-348px');
  });
});
