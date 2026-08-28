import { describe, expect, it } from 'vitest';

import { UiEventType } from '../input/UiInputEvent';
import { eventTypeForProp, isEventProp, knownEventPropNames } from './UiEventProps';

describe('UiEventProps', () => {
  it('maps every event type to exactly one prop name', () => {
    const covered = knownEventPropNames().map(name => eventTypeForProp(name));
    const expected = Object.values(UiEventType);

    // Adding a UiEventType without a prop name fails here rather than
    // leaving the event silently unbindable from a UiElement.
    expect([...covered].sort()).toEqual([...expected].sort());
    expect(new Set(covered).size).toBe(expected.length);
  });

  it('maps camelCase prop names onto lowercase event types', () => {
    expect(eventTypeForProp('onClick')).toBe(UiEventType.Click);
    expect(eventTypeForProp('onPointerDown')).toBe(UiEventType.PointerDown);
    expect(eventTypeForProp('onLongPress')).toBe(UiEventType.LongPress);
    expect(eventTypeForProp('onPanMove')).toBe(UiEventType.PanMove);
  });

  it('does not recognize unknown or misspelled handler names', () => {
    expect(eventTypeForProp('onClicked')).toBeUndefined();
    expect(eventTypeForProp('onclick')).toBeUndefined();
    expect(eventTypeForProp('onChange')).toBeUndefined();
  });

  it('treats only function-valued on* props as handlers', () => {
    expect(isEventProp('onClick', () => {})).toBe(true);
    expect(isEventProp('onClick', 'not a function')).toBe(false);
    expect(isEventProp('onlyChild', () => {})).toBe(false);
    expect(isEventProp('opacity', () => {})).toBe(false);
  });
});
