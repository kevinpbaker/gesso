import { UiNodeType } from '../graph/UiNodeType';
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

/**
 * Returns true when the value structurally matches a UiElement.
 *
 * Used to distinguish a UiElement from a plain UiProps record at runtime.
 */
export function isUiElement(value: unknown): value is UiElement {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<UiElement>;
  return (
    (Object.values(UiNodeType) as unknown[]).includes(candidate.type) &&
    typeof candidate.props === 'object' &&
    candidate.props !== null &&
    !Array.isArray(candidate.props) &&
    Array.isArray(candidate.children)
  );
}
