import { describe, expect, it } from 'vitest';
import { UiEventType, UiFocusEvent, UiInputEvent, noModifiers } from './UiInputEvent';

describe('UiInputEvent', () => {
  it('starts with a clean dispatch state', () => {
    const event = new UiInputEvent(UiEventType.PointerDown);
    expect(event.type).toBe(UiEventType.PointerDown);
    expect(event.target).toBeNull();
    expect(event.currentTarget).toBeNull();
    expect(event.defaultPrevented).toBe(false);
    expect(event.propagationStopped).toBe(false);
    expect(event.immediateStopped).toBe(false);
  });

  it('records preventDefault as an advisory flag without stopping travel', () => {
    const event = new UiInputEvent(UiEventType.Wheel);
    expect(event.defaultPrevented).toBe(false);
    event.preventDefault();
    expect(event.defaultPrevented).toBe(true);
    expect(event.propagationStopped).toBe(false);
  });

  it('stops propagation only', () => {
    const event = new UiInputEvent(UiEventType.Click);
    event.stopPropagation();
    expect(event.propagationStopped).toBe(true);
    expect(event.immediateStopped).toBe(false);
  });

  it('stops immediate propagation and propagation', () => {
    const event = new UiInputEvent(UiEventType.Click);
    event.stopImmediatePropagation();
    expect(event.propagationStopped).toBe(true);
    expect(event.immediateStopped).toBe(true);
  });

  it('reset clears targets and flags so pooled instances can be reused', () => {
    const event = new UiInputEvent(UiEventType.Click);
    event.target = {} as never;
    event.currentTarget = {} as never;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.reset();
    expect(event.target).toBeNull();
    expect(event.currentTarget).toBeNull();
    expect(event.defaultPrevented).toBe(false);
    expect(event.propagationStopped).toBe(false);
    expect(event.immediateStopped).toBe(false);
  });

  it('focus events carry the related node', () => {
    const event = new UiFocusEvent(UiEventType.Focus, { id: 'next' } as never);
    expect(event.type).toBe(UiEventType.Focus);
    expect(event.relatedNode?.id).toBe('next');
  });

  it('noModifiers returns an all-false modifier set', () => {
    expect(noModifiers()).toEqual({ ctrl: false, shift: false, alt: false, meta: false });
  });
});
