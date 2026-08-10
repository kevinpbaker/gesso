import { UiNodeType } from '../graph/UiNodeType';
import { createElement } from './UiFactory';
import type { UiElement } from './UiElement';
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
 */
export function Row(...children: UiElement[]): UiElement {
  return createElement(UiNodeType.Row, {}, children);
}

/**
 * Creates a Column element.
 */
export function Column(...children: UiElement[]): UiElement {
  return createElement(UiNodeType.Column, {}, children);
}

/**
 * Creates a ScrollView element.
 */
export function ScrollView(props: UiProps = {}, ...children: UiElement[]): UiElement {
  return createElement(UiNodeType.ScrollView, props, children);
}
