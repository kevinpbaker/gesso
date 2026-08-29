import type { Observable } from 'rxjs';

import type { UiNode } from '../graph/UiNode';
import type {
  UiBeforeInputEvent,
  UiFocusEvent,
  UiKeyboardEvent,
  UiPointerEvent,
  UiTextChangeEvent,
  UiWheelEvent
} from '../input/UiInputEvent';
import type { UiPropertyName, UiPropertyValues } from '../properties/UiProperty';

/**
 * A prop value that may be supplied once or driven over time.
 *
 * Every element prop is `Reactive`: a plain value is written to the
 * node, an Observable becomes a binding that writes each emission.
 * Cells (`state()`, `input()`) are Observables, so they drop straight
 * in.
 */
export type Reactive<T> = T | Observable<T>;

/**
 * Receives the UiNode an element produced, and null when it is removed.
 */
export type UiNodeRef = (node: UiNode | null) => void;

/**
 * The props for a set of registered properties, each `Reactive` and
 * optional. Types come from the registry, so a property's type here
 * is by construction the type the runtime reads.
 */
export type PropsOf<K extends UiPropertyName> = {
  [P in K]?: Reactive<UiPropertyValues[P]>;
};

/**
 * Declarative event handlers, typed by the event each one receives.
 *
 * Gesture events (click, long press, drag, pan) are synthesized from
 * pointer input and carry a pointer event.
 */
export type UiEventProps = {
  onPointerDown?: (event: UiPointerEvent) => void;
  onPointerUp?: (event: UiPointerEvent) => void;
  onPointerMove?: (event: UiPointerEvent) => void;
  onPointerCancel?: (event: UiPointerEvent) => void;
  onPointerEnter?: (event: UiPointerEvent) => void;
  onPointerLeave?: (event: UiPointerEvent) => void;
  onClick?: (event: UiPointerEvent) => void;
  onLongPress?: (event: UiPointerEvent) => void;
  onDragStart?: (event: UiPointerEvent) => void;
  onDragMove?: (event: UiPointerEvent) => void;
  onDragEnd?: (event: UiPointerEvent) => void;
  onPanStart?: (event: UiPointerEvent) => void;
  onPanMove?: (event: UiPointerEvent) => void;
  onPanEnd?: (event: UiPointerEvent) => void;
  onWheel?: (event: UiWheelEvent) => void;
  onKeyDown?: (event: UiKeyboardEvent) => void;
  onKeyUp?: (event: UiKeyboardEvent) => void;
  onFocus?: (event: UiFocusEvent) => void;
  onBlur?: (event: UiFocusEvent) => void;
  /** An edit is about to reach an editable; preventDefault() rejects it. */
  onBeforeInput?: (event: UiBeforeInputEvent) => void;
  /** An editable's text changed. */
  onInput?: (event: UiTextChangeEvent) => void;
};

/** Reconciliation identity and node access; never stored on the node. */
export type IdentityProps = {
  key?: string | number;
  ref?: UiNodeRef;
};

export type BoxModelProps = PropsOf<
  | 'width'
  | 'height'
  | 'minWidth'
  | 'maxWidth'
  | 'minHeight'
  | 'maxHeight'
  | 'padding'
  | 'paddingTop'
  | 'paddingRight'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'margin'
  | 'marginTop'
  | 'marginRight'
  | 'marginBottom'
  | 'marginLeft'
  | 'aspectRatio'
>;

/** How an element behaves as a child of a Row, Column or ScrollView. */
export type FlexItemProps = PropsOf<'flex' | 'flexGrow' | 'flexShrink' | 'flexBasis' | 'selfX' | 'selfY'>;

/** Where an element sits in a Grid. */
export type GridItemProps = PropsOf<'column' | 'columnSpan' | 'row' | 'rowSpan'>;

export type PositionProps = PropsOf<
  'position' | 'top' | 'right' | 'bottom' | 'left' | 'inset' | 'zIndex' | 'anchor' | 'placement' | 'anchorOffset'
>;

export type PaintProps = PropsOf<
  | 'backgroundColor'
  | 'borderColor'
  | 'borderWidth'
  | 'borderRadius'
  | 'opacity'
  | 'boxShadows'
  | 'visible'
  | 'transform'
>;

/**
 * Inherited text properties. Legal on any element: set on a container,
 * they cascade to the text below it.
 */
export type TypographyProps = PropsOf<
  'color' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing' | 'textAlign' | 'textDirection'
>;

export type InteractionProps = PropsOf<
  'cursor' | 'pointerEvents' | 'focusable' | 'disabled' | 'hitTestable' | 'visualState' | 'selectable'
>;

/** Environment values an element provides to its subtree. */
export type EnvironmentProps = PropsOf<'theme' | 'textStyle' | 'contentColor'>;

/** Props every element accepts. */
export type CommonProps = IdentityProps &
  UiEventProps &
  BoxModelProps &
  FlexItemProps &
  GridItemProps &
  PositionProps &
  PaintProps &
  TypographyProps &
  InteractionProps &
  EnvironmentProps;

/** Props of an element that has children. */
export type ContainerProps = CommonProps & PropsOf<'overflow' | 'scrollX' | 'scrollY'>;

/** Props of a flex container: Row, Column, ScrollView. */
export type FlexContainerProps = ContainerProps &
  PropsOf<'gap' | 'rowGap' | 'columnGap' | 'x' | 'y' | 'flexWrap' | 'alignContent' | 'direction'>;

/** The text an element draws and how it wraps. */
export type TextContentProps = PropsOf<
  'text' | 'textWrap' | 'maxLines' | 'textOverflow' | 'verticalAlign' | 'selectionColor' | 'matchColor'
>;

export type TextProps = CommonProps & TextContentProps;

/**
 * Text the user types into. `value` sets the text; `onInput` reports
 * every change; `multiline` lets Enter insert a newline. Wrapping
 * follows `textWrap` (use `'none'` for a single-line field that scrolls
 * rather than wraps).
 */
export type EditableTextProps = CommonProps &
  PropsOf<
    | 'value'
    | 'placeholder'
    | 'multiline'
    | 'readOnly'
    | 'textWrap'
    | 'verticalAlign'
    | 'caretColor'
    | 'selectionColor'
    | 'placeholderColor'
  >;

/**
 * A Box stacks its children in one content box, aligned by `x` / `y`,
 * and may draw an image behind them.
 */
export type BoxProps = ContainerProps & PropsOf<'x' | 'y' | 'image' | 'objectFit'>;

export type StackProps = BoxProps;

/** A Button is a Box that also draws `text` when it has no children. */
export type ButtonProps = BoxProps & TextContentProps;

export type RowProps = FlexContainerProps;

export type ColumnProps = FlexContainerProps;

export type ScrollViewProps = FlexContainerProps;

export type GridProps = ContainerProps &
  PropsOf<
    | 'columns'
    | 'rows'
    | 'autoColumns'
    | 'autoRows'
    | 'autoFlow'
    | 'gap'
    | 'rowGap'
    | 'columnGap'
    | 'x'
    | 'y'
    | 'justifyContent'
    | 'alignContent'
  >;
