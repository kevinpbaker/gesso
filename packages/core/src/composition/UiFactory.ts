import { UiNodeType } from '../graph/UiNodeType';
import { type UiChild, type UiElement, isUiElement } from './UiElement';
import type { UiProps } from './UiProps';

/**
 * Creates a declarative UI element.
 *
 * This does not create a UiNode and does not interact with UiGraph.
 */
export function createElement(type: UiNodeType, props: UiProps = {}, children: readonly UiChild[] = []): UiElement {
  if (isUiElement(props)) {
    throw new Error(
      `createElement: props for '${type}' look like a UiElement. ` +
        `Did you forget to call the component with props before its children? ` +
        `Elements can only be passed as children, never as props.`
    );
  }
  return {
    type,
    props,
    children
  };
}
