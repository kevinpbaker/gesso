import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { IslandHost, clipPathFor, type IslandHostSink } from './IslandHost';
import { island, provideIsland, type IslandContext, type IslandFactory } from './islandToken';
import { nativeInputIsland, type NativeInputIslandProps } from './nativeInput';
import type { IslandPlacement, IslandShellMessage } from './IslandProtocol';

/**
 * Just enough DOM for the host and the native field: elements in a
 * tree, styles, attributes, focus that moves `activeElement`, and events
 * that bubble. Vitest runs in Node, so this is the approach the mirror's
 * and the editing proxy's specs take.
 */
type Listener = (event: FakeEvent) => void;

class FakeEvent {
  defaultPrevented = false;
  target: FakeElement | null = null;
  constructor(
    readonly type: string,
    init: Partial<FakeEvent> & Record<string, unknown> = {}
  ) {
    Object.assign(this, init);
  }
  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

class FakeElement {
  id = '';
  tabIndex = 0;
  parentNode: FakeElement | null = null;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<Listener>>();
  readonly style: Record<string, string> & { setProperty(name: string, value: string): void } = Object.assign(
    {} as Record<string, string>,
    {
      setProperty(this: Record<string, string>, name: string, value: string) {
        this[name] = value;
      }
    }
  ) as never;
  // <input>
  value = '';
  type = 'text';
  disabled = false;
  readOnly = false;
  required = false;
  spellcheck = false;
  // <form>
  method = '';
  action = '';
  noValidate = false;
  textContent = '';

  constructor(
    readonly tagName: string,
    readonly doc: FakeDocument
  ) {}

  get ownerDocument(): FakeDocument {
    return this.doc;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  appendChild(child: FakeElement): FakeElement {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  remove(): void {
    const parent = this.parentNode;
    if (parent !== null) {
      parent.children.splice(parent.children.indexOf(this), 1);
      this.parentNode = null;
    }
  }
  contains(other: unknown): boolean {
    for (let node = other as FakeElement | null; node !== null && node !== undefined; node = node.parentNode) {
      if (node === this) return true;
    }
    return false;
  }
  matches(): boolean {
    return false;
  }
  addEventListener(type: string, listener: Listener): void {
    let set = this.listeners.get(type);
    if (set === undefined) this.listeners.set(type, (set = new Set()));
    set.add(listener);
  }
  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(event: FakeEvent): FakeEvent {
    event.target ??= this;
    const path: FakeElement[] = [];
    for (let node: FakeElement | null = this.parentNode; node !== null; node = node.parentNode) path.push(node);
    for (const node of [this as FakeElement, ...path]) {
      for (const listener of node.listeners.get(event.type) ?? []) listener(event);
    }
    return event;
  }
  focus(): void {
    const previous = this.doc.activeElement;
    if (previous === this) return;
    this.doc.activeElement = this;
    if (previous !== null) previous.dispatch(new FakeEvent('focusout', { relatedTarget: this }));
    this.dispatch(new FakeEvent('focusin', { relatedTarget: previous }));
  }
  requestSubmit(): void {
    this.dispatch(new FakeEvent('submit'));
  }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
}

// Read by `islandOf`, which walks up from an event's target; Node has no `Element`.
const hadElement = 'Element' in globalThis;
beforeAll(() => {
  (globalThis as { Element?: unknown }).Element ??= FakeElement;
});
afterAll(() => {
  if (!hadElement) delete (globalThis as { Element?: unknown }).Element;
});

class FakeDocument {
  activeElement: FakeElement | null = null;
  readonly body = new FakeElement('body', this);
  readonly head = new FakeElement('head', this);
  readonly defaultView = { devicePixelRatio: 2, addEventListener() {}, removeEventListener() {} };
  createElement(tag: string): FakeElement {
    return new FakeElement(tag, this);
  }
  getElementById(id: string): FakeElement | null {
    const visit = (node: FakeElement): FakeElement | null => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = visit(child);
        if (found !== null) return found;
      }
      return null;
    };
    return visit(this.head) ?? visit(this.body);
  }
  hasFocus(): boolean {
    return true;
  }
}

function setup(registrations = [provideIsland(Plain, plainFactory)]) {
  const doc = new FakeDocument();
  const canvas = doc.createElement('canvas');
  doc.body.appendChild(canvas);
  const posted: IslandShellMessage[] = [];
  const sink: IslandHostSink = {
    post: message => posted.push(message),
    hover: vi.fn(),
    wheel: vi.fn(),
    key: vi.fn(),
    blur: vi.fn()
  };
  const host = new IslandHost(canvas as unknown as HTMLCanvasElement, registrations, sink);
  const layer = host.element as unknown as FakeElement;
  return { doc, canvas, host, layer, posted, sink };
}

const Plain = island<{ n: number }, { said: string }>('spec:plain');
let lastContext: IslandContext<{ said: string }> | null = null;
const updates: { props: { n: number }; current: boolean }[] = [];
const plainFactory: IslandFactory<{ n: number }, { said: string }> = {
  create(_props, context) {
    lastContext = context;
    const element = context.document.createElement('div');
    return { element, update: (props, info) => updates.push({ props, current: info.current }) };
  }
};

function placement(overrides: Partial<IslandPlacement> = {}): IslandPlacement {
  return {
    id: 'a',
    visible: true,
    box: { x: 10.3, y: 20, width: 100, height: 30 },
    clip: { x: 0, y: 0, width: 800, height: 600 },
    cuts: [],
    opacity: 1,
    moving: false,
    focused: false,
    inert: false,
    ...overrides
  };
}

const element = (layer: FakeElement): FakeElement =>
  layer.children.find(child => child.getAttribute('data-gesso-island') === 'a')!;

describe('IslandHost', () => {
  it('puts the element over its box, snapped to device pixels', () => {
    const { host, layer } = setup();
    host.apply({ mounts: [{ id: 'a', kind: 'spec:plain', props: { n: 1 }, standIn: 'never' }], places: [placement()] });
    const style = element(layer).style;
    // 10.3 at a ratio of 2 is 10.5: the nearest device pixel.
    expect(style.transform).toBe('translate(10.5px, 20px)');
    expect([style.width, style.height, style.opacity, style.pointerEvents, style.clipPath]).toEqual([
      '100px',
      '30px',
      '1',
      'auto',
      ''
    ]);
  });

  it('cuts the element where its clip ends and where something covers it', () => {
    const { host, layer } = setup();
    host.apply({
      mounts: [{ id: 'a', kind: 'spec:plain', props: { n: 1 }, standIn: 'never' }],
      places: [
        placement({
          box: { x: 0, y: 0, width: 100, height: 30 },
          clip: { x: 0, y: 10, width: 800, height: 600 },
          cuts: [{ x: 50, y: 0, width: 50, height: 30 }]
        })
      ]
    });
    expect(element(layer).style.clipPath).toBe("path('M0 10H50V30H0Z')");
  });

  it('hides a fully covered or invisible element from the pointer, and keeps it in the document', () => {
    const { host, layer } = setup();
    host.apply({
      mounts: [{ id: 'a', kind: 'spec:plain', props: { n: 1 }, standIn: 'never' }],
      places: [placement({ cuts: [{ x: 0, y: 0, width: 800, height: 600 }] })]
    });
    expect([element(layer).style.opacity, element(layer).style.pointerEvents]).toEqual(['0', 'none']);
    host.apply({ places: [placement({ inert: true })] });
    expect([element(layer).style.opacity, element(layer).style.pointerEvents]).toEqual(['1', 'none']);
  });

  it('conceals an element by its stand-in rule, and shows a field DOM focus is already in', () => {
    const { host, layer, doc } = setup();
    host.apply({
      mounts: [{ id: 'a', kind: 'spec:plain', props: { n: 1 }, standIn: 'unfocused' }],
      places: [placement()]
    });
    expect(element(layer).style.opacity).toBe('0');
    // Clickable while concealed: the click is what focuses it.
    expect(element(layer).style.pointerEvents).toBe('auto');
    element(layer).focus();
    expect(doc.activeElement).toBe(element(layer));
    expect(element(layer).style.opacity).toBe('1');
    host.apply({ places: [placement({ focused: true, moving: true })] });
    expect(element(layer).style.opacity).toBe('0');
  });

  it('numbers what an element emits, and says whether an update is as new as it', () => {
    updates.length = 0;
    const { host, posted } = setup();
    host.apply({ mounts: [{ id: 'a', kind: 'spec:plain', props: { n: 1 }, standIn: 'never' }] });
    lastContext!.emit({ said: 'one' });
    lastContext!.emit({ said: 'two' });
    expect(posted).toEqual([
      { type: 'islandEvent', id: 'a', event: { said: 'one' }, seq: 1 },
      { type: 'islandEvent', id: 'a', event: { said: 'two' }, seq: 2 }
    ]);
    host.apply({ props: [{ id: 'a', props: { n: 2 }, seen: 1 }] });
    host.apply({ props: [{ id: 'a', props: { n: 3 }, seen: 2 }] });
    expect(updates).toEqual([
      { props: { n: 2 }, current: false },
      { props: { n: 3 }, current: true }
    ]);
  });

  it('makes a lazily loaded kind once it arrives, with the props it has by then', async () => {
    updates.length = 0;
    let release!: (factory: IslandFactory<{ n: number }, { said: string }>) => void;
    const loading = new Promise<IslandFactory<{ n: number }, { said: string }>>(resolve => (release = resolve));
    const created: number[] = [];
    const { host, layer } = setup([provideIsland(Plain, () => loading)]);
    host.apply({
      mounts: [{ id: 'a', kind: 'spec:plain', props: { n: 1 }, standIn: 'never' }],
      places: [placement()],
      focused: 'a'
    });
    host.apply({ props: [{ id: 'a', props: { n: 5 }, seen: 0 }] });
    expect(layer.children.length).toBe(0);
    release({
      create(props, context) {
        created.push(props.n);
        return { element: context.document.createElement('div') as unknown as HTMLElement };
      }
    });
    await loading;
    await Promise.resolve();
    expect(created).toEqual([5]);
    expect(element(layer).style.transform).toBe('translate(10.5px, 20px)');
  });

  it('moves DOM focus into the element the runtime names, and back to the canvas when it names none', () => {
    const { host, layer, doc, canvas, posted } = setup();
    host.apply({ mounts: [{ id: 'a', kind: 'spec:plain', props: { n: 1 }, standIn: 'never' }], focused: 'a' });
    expect(doc.activeElement).toBe(element(layer));
    // Its own move, not a focus the person made: nothing posted.
    expect(posted).toEqual([]);
    host.apply({ focused: null });
    expect(doc.activeElement).toBe(canvas);
  });

  it('tells the runtime when DOM focus goes into an element, and sends Tab and Escape on', () => {
    const { host, layer, posted, sink } = setup();
    host.apply({ mounts: [{ id: 'a', kind: 'spec:plain', props: { n: 1 }, standIn: 'never' }] });
    element(layer).focus();
    expect(posted).toEqual([{ type: 'islandFocus', id: 'a' }]);
    const tab = element(layer).dispatch(new FakeEvent('keydown', { key: 'Tab' }));
    expect(tab.defaultPrevented).toBe(true);
    element(layer).dispatch(new FakeEvent('keydown', { key: 'a' }));
    element(layer).dispatch(new FakeEvent('keydown', { key: 'Escape' }));
    expect(
      (sink.key as ReturnType<typeof vi.fn>).mock.calls.map(([event]) => (event as FakeEvent & { key: string }).key)
    ).toEqual(['Tab', 'Escape']);
  });

  it('reports a page submission of a form from the field in it with focus, and not one it made itself', () => {
    const { host, layer, posted } = setup([nativeInputIsland]);
    const field = (name: string): NativeInputIslandProps => ({
      type: 'text',
      name,
      form: 'sign-in',
      value: '',
      valueVersion: 1,
      fontFamily: 'serif',
      fontSize: 14,
      fontWeight: 400,
      color: 'black',
      placeholderColor: 'gray',
      paddingLeft: 8,
      paddingRight: 8
    });
    host.apply({
      mounts: [
        { id: 'user', kind: 'gesso:native-input', props: field('user'), standIn: 'unfocused' },
        { id: 'pass', kind: 'gesso:native-input', props: field('pass'), standIn: 'unfocused' }
      ]
    });
    const form = layer.children.find(child => child.tagName === 'form')!;
    expect(form.children.map(input => input.getAttribute('name'))).toEqual(['user', 'pass']);
    expect([form.method, form.noValidate]).toEqual(['post', true]);
    form.children[1]!.focus();
    posted.length = 0;
    form.children[1]!.dispatch(new FakeEvent('keydown', { key: 'Enter' }));
    expect(posted).toEqual([{ type: 'islandSubmit', form: 'sign-in', id: 'pass' }]);
    posted.length = 0;
    host.apply({ submits: ['sign-in'] });
    expect(posted).toEqual([]);
  });
});

describe('nativeInputIsland', () => {
  it('writes a value only when its version changes, so an echo never lands over newer typing', () => {
    const { host, layer, posted } = setup([nativeInputIsland]);
    const props: NativeInputIslandProps = {
      type: 'email',
      autocomplete: 'username',
      value: 'a',
      valueVersion: 1,
      fontFamily: 'serif',
      fontSize: 14,
      fontWeight: 400,
      color: 'black',
      placeholderColor: 'gray',
      paddingLeft: 8,
      paddingRight: 8
    };
    host.apply({ mounts: [{ id: 'a', kind: 'gesso:native-input', props, standIn: 'unfocused' }] });
    const input = element(layer);
    expect([input.value, input.type, input.getAttribute('autocomplete'), input.tabIndex]).toEqual([
      'a',
      'email',
      'username',
      -1
    ]);
    input.value = 'abc';
    input.dispatch(new FakeEvent('input'));
    expect(posted.at(-1)).toMatchObject({
      type: 'islandEvent',
      event: { type: 'input', value: 'abc', autofilled: false }
    });
    // The worker's echo of an older value, same version: left alone.
    host.apply({ props: [{ id: 'a', props: { ...props, value: 'ab' }, seen: 1 }] });
    expect(input.value).toBe('abc');
    // A value the application set: a new version, written.
    host.apply({ props: [{ id: 'a', props: { ...props, value: '', valueVersion: 2 }, seen: 1 }] });
    expect(input.value).toBe('');
  });

  it('turns Enter in a field with no form into a submit event', () => {
    const { host, layer, posted } = setup([nativeInputIsland]);
    host.apply({
      mounts: [
        {
          id: 'a',
          kind: 'gesso:native-input',
          props: {
            type: 'search',
            value: '',
            valueVersion: 1,
            fontFamily: 'serif',
            fontSize: 14,
            fontWeight: 400,
            color: 'black',
            placeholderColor: 'gray',
            paddingLeft: 8,
            paddingRight: 8
          },
          standIn: 'unfocused'
        }
      ]
    });
    const enter = element(layer).dispatch(new FakeEvent('keydown', { key: 'Enter' }));
    expect(enter.defaultPrevented).toBe(true);
    expect(posted.at(-1)).toMatchObject({ type: 'islandEvent', event: { type: 'submit' } });
  });
});

describe('clipPathFor', () => {
  it('writes one sub-path per piece, relative to the box', () => {
    expect(
      clipPathFor(
        [
          { x: 10, y: 20, width: 5, height: 5 },
          { x: 20, y: 20, width: 5, height: 5 }
        ],
        { x: 10, y: 20, width: 100, height: 100 }
      )
    ).toBe("path('M0 0H5V5H0Z M10 0H15V5H10Z')");
  });
});
