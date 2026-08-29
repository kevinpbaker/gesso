import { UiNodeType } from '../graph/UiNodeType';
import { createElement } from './UiFactory';
import {
  type UiChild,
  type UiElement,
  isComponentLikeElement,
  isUiChild,
  isUiElement,
  isObservable
} from './UiElement';
import type { UiProps } from './UiProps';

/**
 * Creates a Text element.
 */
export function Text(props: UiProps = {}): UiElement {
  return createElement(UiNodeType.Text, props);
}

/**
 * Creates a Button element.
 */
export function Button(props: UiProps = {}, ...children: UiChild[]): UiElement {
  return createElement(UiNodeType.Button, props, children);
}

/**
 * Creates a Box element.
 *
 * Boxes are leaves or plain stacked containers sized by
 * explicit width/height (or flex props).
 */
export function Box(props: UiProps = {}, ...children: UiChild[]): UiElement {
  return createElement(UiNodeType.Box, props, children);
}

/**
 * Creates a Stack element: a Box whose children overlap in one content
 * box, aligned by `x` / `y` (start, center, end, stretch) and per child
 * by `selfX` / `selfY`. Same runtime node as Box; the name says what
 * the children do.
 */
export function Stack(props: UiProps = {}, ...children: UiChild[]): UiElement {
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
export function Grid(props: UiProps = {}, ...children: UiChild[]): UiElement {
  return createElement(UiNodeType.Grid, props, children);
}

/**
 * Creates a Row element.
 *
 * Accepts either children only or props followed by children.
 */
export function Row(...children: UiChild[]): UiElement;
export function Row(props: UiProps, ...children: UiChild[]): UiElement;
export function Row(first: UiProps | UiChild = {}, ...rest: UiChild[]): UiElement {
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
export function Column(props: UiProps, ...children: UiChild[]): UiElement;
export function Column(first: UiProps | UiChild = {}, ...rest: UiChild[]): UiElement {
  if (isUiChild(first) && !isPlainProps(first)) {
    return createElement(UiNodeType.Column, {}, [first, ...rest]);
  }
  return createElement(UiNodeType.Column, first as UiProps, rest);
}

/**
 * Creates a ScrollView element.
 */
export function ScrollView(props: UiProps = {}, ...children: UiChild[]): UiElement {
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
