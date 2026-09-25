import type { Observable } from 'rxjs';
import type { UiModifier } from '../modifiers/UiModifier';
import type { UiTransitionValue } from '../animation/UiTransition';

import type { UiNode } from '../graph/UiNode';
import type {
  UiBeforeInputEvent,
  UiFocusEvent,
  UiKeyboardEvent,
  UiPinchEvent,
  UiPasteEvent,
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
 * Cells (`internalState()`, `input()`) are Observables, so they drop straight
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
  /** A secondary press or a long press asked for a menu. */
  onContextMenu?: (event: UiPointerEvent) => void;
  onPinchStart?: (event: UiPinchEvent) => void;
  onPinchMove?: (event: UiPinchEvent) => void;
  onPinchEnd?: (event: UiPinchEvent) => void;
  onWheel?: (event: UiWheelEvent) => void;
  onKeyDown?: (event: UiKeyboardEvent) => void;
  onKeyUp?: (event: UiKeyboardEvent) => void;
  onFocus?: (event: UiFocusEvent) => void;
  onBlur?: (event: UiFocusEvent) => void;
  /** An edit is about to reach an editable; preventDefault() rejects it. */
  onBeforeInput?: (event: UiBeforeInputEvent) => void;
  /** An editable's text changed. */
  onInput?: (event: UiTextChangeEvent) => void;
  /**
   * Text from the clipboard, when nothing editable has the caret.
   *
   * `preventDefault()` says it was taken. A paste with a caret in it
   * belongs to the text and never reaches here.
   */
  onPaste?: (event: UiPasteEvent) => void;
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
  | 'paddingX'
  | 'paddingY'
  | 'paddingTop'
  | 'paddingRight'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'paddingStart'
  | 'paddingEnd'
  | 'margin'
  | 'marginX'
  | 'marginY'
  | 'marginTop'
  | 'marginRight'
  | 'marginBottom'
  | 'marginLeft'
  | 'marginStart'
  | 'marginEnd'
  | 'aspectRatio'
>;

/** How an element behaves as a child of a Row, Column or ScrollView. */
export type FlexItemProps = PropsOf<
  'flex' | 'flexGrow' | 'flexShrink' | 'flexBasis' | 'selfX' | 'selfY' | 'layoutData'
>;

/** Where an element sits in a Grid. */
export type GridItemProps = PropsOf<'column' | 'columnSpan' | 'row' | 'rowSpan'>;

export type PositionProps = PropsOf<
  | 'position'
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'inset'
  | 'zIndex'
  | 'lift'
  | 'liftBoundary'
  | 'anchor'
  | 'placement'
  | 'anchorOffset'
>;

export type PaintProps = PropsOf<
  | 'backgroundColor'
  | 'backgroundGradient'
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
  | 'color'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'lineHeight'
  | 'letterSpacing'
  | 'textAlign'
  | 'textDirection'
  | 'fontStyle'
  | 'fontStretch'
  | 'fontVariant'
  | 'fontKerning'
  | 'textDecoration'
>;

export type InteractionProps = PropsOf<
  'cursor' | 'pointerEvents' | 'focusable' | 'tabStop' | 'disabled' | 'hitTestable' | 'visualState' | 'selectable'
>;

/**
 * What the element means, for assistive technology. Legal on any
 * element; a component sets them on the node that *is* the control,
 * not on a wrapper. See `UiSemantics.ts`.
 */
export type SemanticsProps = PropsOf<
  | 'role'
  | 'label'
  | 'description'
  | 'live'
  | 'states'
  | 'valueNow'
  | 'valueMin'
  | 'valueMax'
  | 'valueText'
  | 'posInSet'
  | 'setSize'
  | 'level'
>;

/** Environment values an element provides to its subtree. */
export type EnvironmentProps = PropsOf<'theme' | 'textStyle' | 'contentColor' | 'containerSize' | 'insets'>;

/**
 * Behaviour attached to an element without wrapping it: hover and
 * press state, a focus ring, a tooltip, drag. See `packages/core/src/modifiers`.
 * The list is static per element — a modifier's own arguments may be
 * Observables, as props are.
 */
export type ModifierProps = {
  modifiers?: readonly UiModifier[];
};

/**
 * How named properties get from one value to the next.
 *
 * A number is a duration in milliseconds; `tween()` and `spring()`
 * build the longer forms. The key names a registered property, and an
 * unknown one throws the way an unknown prop does — but `transition`
 * itself is not a property: nothing in layout, paint, input or the
 * environment reads it, and it is reserved beside `key`, `ref` and
 * `modifiers` for exactly that reason. See `packages/core/src/animation`.
 */
export type TransitionProps = {
  transition?: Partial<Record<UiPropertyName, UiTransitionValue>>;
};

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
  SemanticsProps &
  ModifierProps &
  TransitionProps &
  EnvironmentProps;

/**
 * Props of an element that has children.
 *
 * `layout` is here rather than on `BoxProps` alone because a custom
 * layout replaces whatever the container would have done with its
 * children, whichever container it is; see `layout/CustomLayout.ts`.
 */
export type ContainerProps = CommonProps &
  PropsOf<'overflow' | 'scrollX' | 'scrollY' | 'scrollBehavior' | 'overscrollBehavior' | 'layout'>;

/** Props of a flex container: Row, Column, ScrollView. */
export type FlexContainerProps = ContainerProps &
  PropsOf<'gap' | 'rowGap' | 'columnGap' | 'x' | 'y' | 'flexWrap' | 'alignContent' | 'direction'>;

/**
 * The text an element draws and how it wraps.
 *
 * `spans` is `text` in runs: set one or the other, never both. The
 * runs' texts concatenated are the paragraph, so everything that reads
 * a paragraph by offset reads either the same way.
 */
export type TextContentProps = PropsOf<
  'text' | 'spans' | 'textWrap' | 'maxLines' | 'textOverflow' | 'verticalAlign' | 'selectionColor' | 'matchColor'
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

/**
 * A Paint element draws itself, through a `paint` function or a static
 * `path`, and is otherwise a Box: a box model, a background, a border,
 * children stacked in its content box.
 *
 * `clipPath` and `blur` shape what it drew. See
 * `rendering/PaintSurface.ts` for the drawing vocabulary.
 */
export type PaintElementProps = BoxProps & PropsOf<'paint' | 'path' | 'clipPath' | 'blur'>;

/** A Button is a Box that also draws `text` when it has no children. */
export type ButtonProps = BoxProps & TextContentProps;

export type RowProps = FlexContainerProps;

export type ColumnProps = FlexContainerProps;

export type ScrollViewProps = FlexContainerProps;

export type GridProps = ContainerProps &
  PropsOf<
    | 'columns'
    | 'subgrid'
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
