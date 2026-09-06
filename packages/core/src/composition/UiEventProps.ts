import { UiEventType } from '../input/UiInputEvent';

/**
 * A prop is treated as an event handler when it is named `on` +
 * PascalCase and holds a function. Props matching that shape whose
 * value is not a function stay ordinary node properties.
 */
const EVENT_PROP_PATTERN = /^on[A-Z]/;

/**
 * Declarative prop name for each input event.
 *
 * Spelled out rather than derived: UiEventType values are lowercase
 * concatenations ('pointerdown', 'longpress'), so the camelCase prop
 * name cannot be recovered from them. UiEventProps.spec asserts this
 * table stays exhaustive, so adding an event type without a prop name
 * fails the build rather than silently going unbindable.
 */
const EVENT_PROPS: Readonly<Record<string, UiEventType>> = {
  onPointerDown: UiEventType.PointerDown,
  onPointerUp: UiEventType.PointerUp,
  onPointerMove: UiEventType.PointerMove,
  onPointerCancel: UiEventType.PointerCancel,
  onPointerEnter: UiEventType.PointerEnter,
  onPointerLeave: UiEventType.PointerLeave,
  onWheel: UiEventType.Wheel,
  onKeyDown: UiEventType.KeyDown,
  onKeyUp: UiEventType.KeyUp,
  onFocus: UiEventType.Focus,
  onBlur: UiEventType.Blur,
  onBeforeInput: UiEventType.BeforeInput,
  onInput: UiEventType.Input,
  onClick: UiEventType.Click,
  onLongPress: UiEventType.LongPress,
  onDragStart: UiEventType.DragStart,
  onDragMove: UiEventType.DragMove,
  onDragEnd: UiEventType.DragEnd,
  onPanStart: UiEventType.PanStart,
  onPanMove: UiEventType.PanMove,
  onPanEnd: UiEventType.PanEnd,
  onContextMenu: UiEventType.ContextMenu,
  onPinchStart: UiEventType.PinchStart,
  onPinchMove: UiEventType.PinchMove,
  onPinchEnd: UiEventType.PinchEnd
};

/**
 * Whether a prop name/value pair declares an event handler.
 */
export function isEventProp(property: string, value: unknown): boolean {
  return typeof value === 'function' && EVENT_PROP_PATTERN.test(property);
}

/**
 * The event a handler prop binds to, or undefined when the name is
 * not a recognized event prop.
 */
export function eventTypeForProp(property: string): UiEventType | undefined {
  return EVENT_PROPS[property];
}

/**
 * Every accepted event prop name, sorted, for error messages.
 */
export function knownEventPropNames(): string[] {
  return Object.keys(EVENT_PROPS).sort();
}
