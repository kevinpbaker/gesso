import { UiNodeType } from '../graph/UiNodeType';
import { createElement } from './UiFactory';
import { type UiChild, type UiElement, isUiChild, isUiElement, isObservable } from './UiElement';
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
  return typeof value === 'object' && value !== null && !isUiElement(value) && !isObservable(value);
}
