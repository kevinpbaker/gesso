import { UiNodeType } from '../graph/UiNodeType';
import { BUTTON_INTERACTION } from '../modifiers/interaction';
import { createElement } from './UiFactory';
import {
  type UiChild,
  type UiElement,
  isComponentLikeElement,
  isUiChild,
  isUiElement,
  isObservable
} from './UiElement';
import type {
  BoxProps,
  ButtonProps,
  ColumnProps,
  EditableTextProps,
  GridProps,
  RowProps,
  ScrollViewProps,
  StackProps,
  TextProps
} from './UiElementProps';
import type { UiProps } from './UiProps';

/**
 * Creates a Text element.
 */
export function Text(props: TextProps = {}): UiElement {
  return createElement(UiNodeType.Text, props);
}

/**
 * Creates an EditableText element: text the user can type into, with
 * a caret, a selection and IME composition. The runtime owns the
 * editing; the app sets `value` and listens to `onInput`.
 */
export function EditableText(props: EditableTextProps = {}): UiElement {
  return createElement(UiNodeType.EditableText, props);
}

/**
 * Creates a Button element.
 *
 * Every button is interactive: it carries the modifier that publishes
 * hover and press as `visualState`, so a themed control can paint from
 * it without the app keeping a boolean per widget. A button that
 * declares its own modifiers keeps them, with the interaction one
 * first, so a caller's write of the same property wins.
 *
 * **Unless the caller brought their own interaction.** Two `interactive`
 * modifiers on one node is the conflict `modifiers/interaction.ts`
 * exists to avoid: both write `visualState`, so the later one's set
 * drops the earlier one's state and the two disagree about what the
 * pointer is doing. A caller who passes `interactive(...)` is asking
 * for their configuration rather than a second copy of the default,
 * so the default steps aside. This was found with the inspector, which
 * showed a playground button carrying `interactive, interactive`.
 */
export function Button(props: ButtonProps = {}, ...children: UiChild[]): UiElement {
  const declared = props.modifiers;
  const modifiers =
    declared === undefined
      ? DEFAULT_BUTTON_MODIFIERS
      : declared.some(modifier => modifier.kind === BUTTON_INTERACTION.kind)
        ? declared
        : [BUTTON_INTERACTION, ...declared];
  return createElement(UiNodeType.Button, { ...props, modifiers }, children);
}

const DEFAULT_BUTTON_MODIFIERS = Object.freeze([BUTTON_INTERACTION]);

/**
 * Creates a Box element.
 *
 * Boxes are leaves or plain stacked containers sized by
 * explicit width/height (or flex props).
 */
export function Box(props: BoxProps = {}, ...children: UiChild[]): UiElement {
  return createElement(UiNodeType.Box, props, children);
}

/**
 * Creates a Stack element: a Box whose children overlap in one content
 * box, aligned by `x` / `y` (start, center, end, stretch) and per child
 * by `selfX` / `selfY`. Same runtime node as Box; the name says what
 * the children do.
 */
export function Stack(props: StackProps = {}, ...children: UiChild[]): UiElement {
  return createElement(UiNodeType.Box, props, children);
}

/**
 * Creates a Grid element.
 *
 * Children fill cells of the tracks in `columns` / `rows` (numbers,
 * `percent()`, `auto`, `fr()`, `minmax()`), by `autoFlow` order or by
 * explicit `column` / `row` (1-based lines) and `columnSpan` / `rowSpan`.
 * `x` / `y` align items in their cells (stretch by default),
 * `justifyContent` / `alignContent` distribute the tracks.
 */
export function Grid(props: GridProps = {}, ...children: UiChild[]): UiElement {
  return createElement(UiNodeType.Grid, props, children);
}

/**
 * Creates a Row element.
 *
 * Accepts either children only or props followed by children.
 */
export function Row(...children: UiChild[]): UiElement;
export function Row(props: RowProps, ...children: UiChild[]): UiElement;
export function Row(first: RowProps | UiChild = {}, ...rest: UiChild[]): UiElement {
  if (isUiChild(first) && !isPlainProps(first)) {
    return createElement(UiNodeType.Row, {}, [first, ...rest]);
  }
  return createElement(UiNodeType.Row, first as UiProps, rest);
}

/**
 * Creates a Column element.
 *
 * Accepts either children only or props followed by children.
 */
export function Column(...children: UiChild[]): UiElement;
export function Column(props: ColumnProps, ...children: UiChild[]): UiElement;
export function Column(first: ColumnProps | UiChild = {}, ...rest: UiChild[]): UiElement {
  if (isUiChild(first) && !isPlainProps(first)) {
    return createElement(UiNodeType.Column, {}, [first, ...rest]);
  }
  return createElement(UiNodeType.Column, first as UiProps, rest);
}

/**
 * Creates a ScrollView element.
 */
export function ScrollView(props: ScrollViewProps = {}, ...children: UiChild[]): UiElement {
  return createElement(UiNodeType.ScrollView, props, children);
}

/**
 * Returns true when a value is a plain props record rather than a child.
 *
 * Props are plain objects. Children are UiElements or Observables.
 */
function isPlainProps(value: unknown): value is UiProps {
  return (
    typeof value === 'object' &&
    value !== null &&
    !isUiElement(value) &&
    !isObservable(value) &&
    !isComponentLikeElement(value)
  );
}
