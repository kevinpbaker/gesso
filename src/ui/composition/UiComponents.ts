import { UiNodeType } from '../graph/UiNodeType';
import { createElement } from './UiFactory';
import { type UiElement, isUiElement } from './UiElement';
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
export function Button(props: UiProps = {}, ...children: UiElement[]): UiElement {
  return createElement(UiNodeType.Button, props, children);
}

/**
 * Creates a Row element.
 *
 * Accepts either children only or props followed by children.
 */
export function Row(...children: UiElement[]): UiElement;
export function Row(props: UiProps, ...children: UiElement[]): UiElement;
export function Row(first: UiProps | UiElement = {}, ...rest: UiElement[]): UiElement {
  if (isUiElement(first)) {
    return createElement(UiNodeType.Row, {}, [first, ...rest]);
  }
  return createElement(UiNodeType.Row, first, rest);
}

/**
 * Creates a Column element.
 *
 * Accepts either children only or props followed by children.
 */
export function Column(...children: UiElement[]): UiElement;
export function Column(props: UiProps, ...children: UiElement[]): UiElement;
export function Column(first: UiProps | UiElement = {}, ...rest: UiElement[]): UiElement {
  if (isUiElement(first)) {
    return createElement(UiNodeType.Column, {}, [first, ...rest]);
  }
  return createElement(UiNodeType.Column, first, rest);
}

/**
 * Creates a ScrollView element.
 */
export function ScrollView(props: UiProps = {}, ...children: UiElement[]): UiElement {
  return createElement(UiNodeType.ScrollView, props, children);
}
