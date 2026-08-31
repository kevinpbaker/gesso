import { describe, expect, it, vi } from 'vitest';
import { UiNodeType } from '../graph/UiNodeType';
import { UiEventType, type UiPointerEvent } from './UiInputEvent';
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
