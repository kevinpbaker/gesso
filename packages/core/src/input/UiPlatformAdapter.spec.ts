import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiNodeType } from '../graph/UiNodeType';
import { UiEventType, type UiPointerEvent } from './UiInputEvent';
import { CanvasPlatformSurface, prepareInputSurface } from './UiPlatformAdapter';
import { InputTestHarness, FakePlatformSurface } from './UiInputTestUtils';

function pointerEvent(props: {
  type?: string;
  clientX?: number;
  clientY?: number;
  button?: number;
  buttons?: number;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  pointerType?: string;
  pointerId?: number;
  target?: unknown;
  preventDefault?: () => void;
}): Event {
  return {
    type: props.type ?? 'pointerdown',
    clientX: props.clientX ?? 0,
    clientY: props.clientY ?? 0,
    button: props.button ?? 0,
    buttons: props.buttons ?? 1,
    shiftKey: props.shiftKey ?? false,
    ctrlKey: props.ctrlKey ?? false,
    altKey: props.altKey ?? false,
    metaKey: props.metaKey ?? false,
    pointerType: props.pointerType ?? 'mouse',
    pointerId: props.pointerId ?? 1,
    target: props.target ?? null,
    preventDefault: props.preventDefault ?? (() => {}),
    defaultPrevented: false
  } as unknown as Event;
}

function wheelEvent(props: {
  clientX?: number;
  clientY?: number;
  deltaX?: number;
  deltaY?: number;
  shiftKey?: boolean;
  preventDefault?: () => void;
}): Event {
  return {
    type: 'wheel',
    clientX: props.clientX ?? 0,
    clientY: props.clientY ?? 0,
    deltaX: props.deltaX ?? 0,
    deltaY: props.deltaY ?? 0,
    shiftKey: props.shiftKey ?? false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: props.preventDefault ?? (() => {}),
    defaultPrevented: false
  } as unknown as Event;
}

function keyEvent(props: {
  type: 'keydown' | 'keyup';
  key?: string;
  shiftKey?: boolean;
  preventDefault?: () => void;
}): Event {
  return {
    type: props.type,
    key: props.key ?? 'a',
    shiftKey: props.shiftKey ?? false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: props.preventDefault ?? (() => {}),
    defaultPrevented: false
  } as unknown as Event;
}

describe('UiPlatformAdapter', () => {
  function setup() {
    const h = new InputTestHarness();
    const a = h.node('a', UiNodeType.Box, { width: 100, height: 100 });
    h.add(h.root, a);
    h.layoutTree();
    const adapter = h.createPlatformAdapter();
    const surface = new FakePlatformSurface();
    surface.localX = 50;
    surface.localY = 50;
    adapter.attach(surface);
    return { h, a, adapter, surface };
  }

  it('routes pointerdown through the pointer controller', () => {
    const { a, h, surface } = setup();
    const listener = vi.fn();
    h.dispatcher.addEventListener(a, UiEventType.PointerDown, listener);

    surface.pointerTarget.emit('pointerdown', pointerEvent({}));

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]![0];
    expect(event.x).toBe(50);
    expect(event.y).toBe(50);
  });

  it('routes pointermove and pointerup to the captured press', () => {
    const { h, surface } = setup();
    const move = vi.fn();
    const up = vi.fn();
    h.dispatcher.addEventListener(h.root, UiEventType.PointerMove, move);
    h.dispatcher.addEventListener(h.root, UiEventType.PointerUp, up);

    surface.pointerTarget.emit('pointerdown', pointerEvent({}));
    surface.pointerTarget.emit('pointermove', pointerEvent({ type: 'pointermove' }));
    surface.pointerTarget.emit('pointerup', pointerEvent({ type: 'pointerup' }));

    expect(move).toHaveBeenCalledTimes(1);
    expect(up).toHaveBeenCalledTimes(1);
  });

  it('routes pointercancel to the active press', () => {
    const { h, surface } = setup();
    const cancel = vi.fn();
    h.dispatcher.addEventListener(h.root, UiEventType.PointerCancel, cancel);

    surface.pointerTarget.emit('pointerdown', pointerEvent({}));
    surface.pointerTarget.emit('pointercancel', pointerEvent({ type: 'pointercancel' }));

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('routes wheel through the wheel controller', () => {
    const { h, surface } = setup();
    const wheel = vi.fn();
    h.dispatcher.addEventListener(h.root, UiEventType.Wheel, wheel);

    surface.pointerTarget.emit('wheel', wheelEvent({ deltaY: 100 }));

    expect(wheel).toHaveBeenCalledTimes(1);
    expect(wheel.mock.calls[0]![0].deltaY).toBe(100);
  });

  it('prevents the browser default only for a wheel the runtime used', () => {
    // Both directions were bugs. Preventing unconditionally makes the
    // canvas a scroll trap in the page around it; never preventing
    // lets one wheel scroll the container and the page behind it.
    const h = new InputTestHarness();
    const scroll = h.node('scroll', UiNodeType.ScrollView, { width: 100, height: 100 });
    h.add(h.root, scroll);
    h.add(scroll, h.node('content', UiNodeType.Box, { width: 100, height: 400 }));
    h.layoutTree();
    const adapter = h.createPlatformAdapter();
    const surface = new FakePlatformSurface();
    surface.localX = 50;
    surface.localY = 50;
    adapter.attach(surface);

    const down = vi.fn();
    surface.pointerTarget.emit('wheel', wheelEvent({ deltaY: 100, preventDefault: down }));
    expect(down).toHaveBeenCalledTimes(1);

    // Now at the top edge for an upward wheel: the page gets it.
    const up = vi.fn();
    surface.pointerTarget.emit('wheel', wheelEvent({ deltaY: -1000, preventDefault: up }));
    surface.pointerTarget.emit('wheel', wheelEvent({ deltaY: -100, preventDefault: up }));
    expect(up).toHaveBeenCalledTimes(1);
  });

  it('prevents the browser default when an application handler took the wheel', () => {
    const { h, surface } = setup();
    h.dispatcher.addEventListener(h.root, UiEventType.Wheel, event => {
      event.preventDefault();
    });
    const prevented = vi.fn();

    surface.pointerTarget.emit('wheel', wheelEvent({ deltaY: 100, preventDefault: prevented }));

    expect(prevented).toHaveBeenCalledTimes(1);
  });

  it('relaxes touch-action when the runtime has nothing of its own to scroll', () => {
    // On a touchscreen this is the whole fix: `touch-action` is
    // latched when the finger lands, so a canvas left at `none`
    // swallows the gesture before any handler could hand it back.
    const { surface } = setup();

    expect(surface.touchAction).toBe('auto');
  });

  it('keeps touch-action at none when the runtime does scroll', () => {
    const h = new InputTestHarness();
    const scroll = h.node('scroll', UiNodeType.ScrollView, { width: 100, height: 100 });
    h.add(h.root, scroll);
    h.add(scroll, h.node('content', UiNodeType.Box, { width: 100, height: 400 }));
    h.layoutTree();
    const surface = new FakePlatformSurface();
    h.createPlatformAdapter().attach(surface);

    expect(surface.touchAction).toBe('none');
  });

  it('routes keydown and keyup through the keyboard controller', () => {
    const { h, surface } = setup();
    const down = vi.fn();
    const up = vi.fn();
    h.dispatcher.addEventListener(h.root, UiEventType.KeyDown, down);
    h.dispatcher.addEventListener(h.root, UiEventType.KeyUp, up);

    surface.keyboardTarget.emit('keydown', keyEvent({ type: 'keydown', key: 'Tab' }));
    surface.keyboardTarget.emit('keyup', keyEvent({ type: 'keyup', key: 'Tab' }));

    expect(down).toHaveBeenCalledTimes(1);
    expect(down.mock.calls[0]![0].key).toBe('Tab');
    expect(up).toHaveBeenCalledTimes(1);
  });

  it('maps DOM modifier keys to UiKeyModifiers', () => {
    const { a, h, surface } = setup();
    const received: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean }[] = [];
    h.dispatcher.addEventListener(a, UiEventType.PointerDown, event => {
      received.push(
        (event as unknown as { modifiers: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean } }).modifiers
      );
    });

    surface.pointerTarget.emit('pointerdown', pointerEvent({ shiftKey: true, ctrlKey: true }));

    expect(received).toEqual([{ shift: true, ctrl: true, alt: false, meta: false }]);
  });

  it('prevents the default action when a framework listener calls preventDefault', () => {
    const { h, surface } = setup();
    const prevented: string[] = [];
    h.dispatcher.addEventListener(h.root, UiEventType.PointerDown, event => {
      event.preventDefault();
    });

    surface.pointerTarget.emit(
      'pointerdown',
      pointerEvent({
        preventDefault: () => {
          prevented.push('pointerdown');
        }
      })
    );

    expect(prevented).toEqual(['pointerdown']);
  });

  it('detaches cleanly', () => {
    const { h, surface, adapter } = setup();
    const listener = vi.fn();
    h.dispatcher.addEventListener(h.root, UiEventType.PointerDown, listener);

    adapter.detach();
    surface.pointerTarget.emit('pointerdown', pointerEvent({}));

    expect(listener).not.toHaveBeenCalled();
    expect(adapter.attached).toBe(false);
  });

  it('forwards the pointer device from the DOM event', () => {
    const h = new InputTestHarness();
    const box = h.node('box', UiNodeType.Box, { width: 100, height: 100 });
    h.add(h.root, box);
    h.layoutTree();
    const surface = new FakePlatformSurface();
    const adapter = h.createPlatformAdapter();
    adapter.attach(surface);
    const seen: { kind: string; id: number }[] = [];
    h.dispatcher.addEventListener(box, UiEventType.PointerDown, event => {
      const pointerEvent = event as UiPointerEvent;
      seen.push({ kind: pointerEvent.pointer.kind, id: pointerEvent.pointer.id });
    });

    surface.localX = 50;
    surface.localY = 50;
    surface.pointerTarget.emit('pointerdown', pointerEvent({ pointerType: 'touch', pointerId: 42 }));

    expect(seen).toEqual([{ kind: 'touch', id: 42 }]);
  });

  it('reads an unrecognised pointerType as a mouse', () => {
    const h = new InputTestHarness();
    const box = h.node('box', UiNodeType.Box, { width: 100, height: 100 });
    h.add(h.root, box);
    h.layoutTree();
    const surface = new FakePlatformSurface();
    const adapter = h.createPlatformAdapter();
    adapter.attach(surface);
    const kinds: string[] = [];
    h.dispatcher.addEventListener(box, UiEventType.PointerDown, event =>
      kinds.push((event as UiPointerEvent).pointer.kind)
    );

    surface.localX = 50;
    surface.localY = 50;
    surface.pointerTarget.emit('pointerdown', pointerEvent({ pointerType: 'gamepad' }));

    expect(kinds).toEqual(['mouse']);
  });

  it('captures the contact on the element the press landed on', () => {
    const h = new InputTestHarness();
    const box = h.node('box', UiNodeType.Box, { width: 100, height: 100 });
    h.add(h.root, box);
    h.layoutTree();
    const surface = new FakePlatformSurface();
    const adapter = h.createPlatformAdapter();
    adapter.attach(surface);
    const setPointerCapture = vi.fn();

    surface.pointerTarget.emit('pointerdown', pointerEvent({ pointerId: 42, target: { setPointerCapture } }));

    expect(setPointerCapture).toHaveBeenCalledWith(42);
  });

  it('survives an element that refuses the capture', () => {
    const h = new InputTestHarness();
    const surface = new FakePlatformSurface();
    const adapter = h.createPlatformAdapter();
    adapter.attach(surface);
    const setPointerCapture = vi.fn(() => {
      throw new Error('pointer is no longer active');
    });

    expect(() =>
      surface.pointerTarget.emit('pointerdown', pointerEvent({ target: { setPointerCapture } }))
    ).not.toThrow();
  });
});

describe('prepareInputSurface', () => {
  /**
   * The suite runs in node, so there is no `document` to make a canvas
   * from. `prepareInputSurface` writes to `style` and registers one
   * listener, which is the whole of what these assert, so a recorder
   * shaped like a `CSSStyleDeclaration` plus a listener log is the
   * honest double.
   */
  function surfaceDouble(): {
    element: HTMLElement;
    style: Record<string, string>;
    listeners: string[];
  } {
    const style: Record<string, string> = {
      setProperty(name: string, value: string) {
        style[name] = value;
      }
    } as unknown as Record<string, string>;
    const listeners: string[] = [];
    const element = {
      style,
      addEventListener(type: string) {
        listeners.push(type);
      }
    } as unknown as HTMLElement;
    return { element, style, listeners };
  }

  it('suppresses the platform focus outline', () => {
    // The canvas is focusable so that Tab can reach the application,
    // which otherwise means clicking anything drawn on it rings the
    // whole canvas. Gesso draws its own ring around the focused node.
    const { element, style } = surfaceDouble();

    prepareInputSurface(element);

    expect(style.outline).toBe('none');
  });

  it('leaves the browser nothing else to interpret as a gesture', () => {
    const { element, style, listeners } = surfaceDouble();

    prepareInputSurface(element);

    expect(style.touchAction).toBe('none');
    expect(style.userSelect).toBe('none');
    expect(style['-webkit-tap-highlight-color']).toBe('transparent');
    // The platform menu would otherwise land on top of the
    // `ContextMenu` event the runtime dispatches for the same press.
    expect(listeners).toContain('contextmenu');
  });
});

describe('CanvasPlatformSurface', () => {
  /**
   * The suite runs in node, so there is neither a window nor a
   * `ResizeObserver` unless a test puts one there — which is the point
   * of the doubles below rather than an inconvenience of them. Every
   * global the surface reaches for is guarded, and these tests are how
   * both sides of each guard get exercised: a test that installs
   * nothing is the headless host, and a test that installs a window is
   * the browser.
   */
  function elementDouble(left = 10, top = 20) {
    const box = { left, top };
    let reads = 0;
    const element = {
      style: {} as CSSStyleDeclaration,
      getBoundingClientRect: () => {
        reads += 1;
        return box as DOMRect;
      }
    } as unknown as HTMLElement;
    return {
      element,
      box,
      reads: () => reads
    };
  }

  interface Registration {
    type: string;
    listener: (event: Event) => void;
    options?: AddEventListenerOptions | boolean;
  }

  function windowDouble() {
    const listeners: Registration[] = [];
    const target = {
      addEventListener(type: string, listener: (event: Event) => void, options?: AddEventListenerOptions | boolean) {
        listeners.push({ type, listener, options });
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        const index = listeners.findIndex(entry => entry.type === type && entry.listener === listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
    };
    (globalThis as { window?: unknown }).window = target;
    return {
      target,
      listeners,
      emit(type: string) {
        for (const entry of listeners) {
          if (entry.type === type) {
            entry.listener({ type } as Event);
          }
        }
      }
    };
  }

  function installResizeObserver() {
    let callback: (() => void) | null = null;
    const observed: unknown[] = [];
    let disconnects = 0;
    class Stub {
      constructor(cb: () => void) {
        callback = cb;
      }
      observe(target: unknown) {
        observed.push(target);
      }
      unobserve() {}
      disconnect() {
        disconnects += 1;
      }
    }
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = Stub;
    return {
      observed,
      resize: () => callback?.(),
      disconnects: () => disconnects
    };
  }

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  });

  it('measures the element once for a burst of pointer moves', () => {
    // The whole point of the cache: a drag is hundreds of these, and
    // each `getBoundingClientRect` against a dirty document is a
    // forced style and layout flush on the main thread.
    windowDouble();
    const { element, reads } = elementDouble(10, 20);
    const surface = new CanvasPlatformSurface(element);

    const points = [0, 1, 2, 3, 4].map(i => surface.clientToLocal(100 + i, 200 + i));

    expect(reads()).toBe(1);
    expect(points[0]).toEqual({ x: 90, y: 180 });
    expect(points[4]).toEqual({ x: 94, y: 184 });
  });

  it('measures again after a scroll anywhere in the ancestor chain', () => {
    const win = windowDouble();
    const { element, box, reads } = elementDouble(10, 20);
    const surface = new CanvasPlatformSurface(element);
    surface.clientToLocal(100, 200);

    box.left = 30;
    box.top = 40;
    win.emit('scroll');

    expect(surface.clientToLocal(100, 200)).toEqual({ x: 70, y: 160 });
    expect(reads()).toBe(2);
    // Captured, because a scroll on an inner container does not bubble
    // to window even though it moves the element just the same.
    expect(win.listeners.find(entry => entry.type === 'scroll')?.options).toEqual({
      capture: true,
      passive: true
    });
  });

  it('measures again after a window resize', () => {
    const win = windowDouble();
    const { element, box, reads } = elementDouble(10, 20);
    const surface = new CanvasPlatformSurface(element);
    surface.clientToLocal(0, 0);

    box.left = 11;
    win.emit('resize');
    surface.clientToLocal(0, 0);

    expect(reads()).toBe(2);
  });

  it('starts every gesture from a fresh measurement', () => {
    // A CSS transition can move the element with no event of its own,
    // and then the cache is stale with nothing to say so. The press is
    // the moment that matters, so the press re-reads.
    const win = windowDouble();
    const { element, box, reads } = elementDouble(10, 20);
    const surface = new CanvasPlatformSurface(element);
    surface.clientToLocal(100, 200);

    box.left = 60;
    box.top = 70;
    win.emit('pointerdown');

    expect(surface.clientToLocal(100, 200)).toEqual({ x: 40, y: 130 });
    expect(reads()).toBe(2);
  });

  it('measures again when the element itself resizes', () => {
    windowDouble();
    const observer = installResizeObserver();
    const { element, reads } = elementDouble();
    const surface = new CanvasPlatformSurface(element);
    surface.clientToLocal(0, 0);

    expect(observer.observed).toEqual([element]);
    observer.resize();
    surface.clientToLocal(0, 0);

    expect(reads()).toBe(2);
  });

  it('releases its listeners and stops caching on dispose', () => {
    const win = windowDouble();
    const observer = installResizeObserver();
    const { element, reads } = elementDouble();
    const surface = new CanvasPlatformSurface(element);
    surface.clientToLocal(0, 0);

    surface.dispose();

    expect(win.listeners).toEqual([]);
    expect(observer.disconnects()).toBe(1);
    // Nothing is left that could report a move, so a surface still in
    // use after its teardown answers from a fresh measurement every
    // time rather than from a rect nothing can correct.
    surface.clientToLocal(0, 0);
    surface.clientToLocal(0, 0);
    expect(reads()).toBe(3);
    expect(() => surface.dispose()).not.toThrow();
  });

  it('measures every call where nothing could invalidate a cache', () => {
    // No window, no ResizeObserver: a worker, a node host, a test.
    // Construction must not throw, and the surface must not pretend to
    // hold a measurement it can never be told is wrong.
    const { element, reads } = elementDouble();
    const surface = new CanvasPlatformSurface(element);

    surface.clientToLocal(0, 0);
    surface.clientToLocal(0, 0);

    expect(reads()).toBe(2);
    // The keyboard target stands in for the window that isn't there,
    // so a caller that attaches to it does not have to branch.
    expect(() => surface.keyboardTarget.addEventListener('keydown', () => {})).not.toThrow();
  });

  it('survives an element with no box to measure', () => {
    const element = { style: {} } as unknown as HTMLElement;
    const surface = new CanvasPlatformSurface(element);

    expect(surface.clientToLocal(5, 6)).toEqual({ x: 5, y: 6 });
  });
});

describe('UiPlatformAdapter teardown', () => {
  it('disposes the surface it detaches', () => {
    // The hosts construct the surface inline in `attach` and keep no
    // reference, so `detach` is the only hand that can reach it.
    const h = new InputTestHarness();
    const adapter = h.createPlatformAdapter();
    const surface = new FakePlatformSurface();
    const dispose = vi.fn();
    adapter.attach(Object.assign(surface, { dispose }));

    adapter.detach();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
