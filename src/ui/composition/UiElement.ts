import type { UiNodeType } from '../graph/UiNodeType';
import type { UiProps } from './UiProps';

/**
 * Declarative representation of a UI element.
 *
 * UiElement is NOT a runtime UiNode.
 *
 * It describes what the UI should look like.
 * UiGraphBuilder is responsible for turning this definition
 * into the runtime UiNode tree.
 */
export interface UiElement {
  /**
   * Runtime node type that should be created.
   */
  readonly type: UiNodeType;

  /**
   * Properties belonging to this element.
   */
  readonly props: UiProps;

  /**
   * Child elements.
   */
  readonly children: readonly UiElement[];
}
