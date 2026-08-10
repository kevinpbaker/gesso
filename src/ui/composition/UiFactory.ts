import type { UiNodeType } from '../UiNodeType';
import type { UiElement } from './UiElement';
import type { UiProps } from './UiProps';

/**
 * Creates a declarative UI element.
 *
 * This does not create a UiNode and does not interact with UiGraph.
 */
export function createElement(type: UiNodeType, props: UiProps = {}, children: readonly UiElement[] = []): UiElement {
  return {
    type,
    props,
    children
  };
}
