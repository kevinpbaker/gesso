import type { Observable } from 'rxjs';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiProps } from './UiProps';

/**
 * A child definition may be a static element or an observable stream
 * of elements. Observable children are reconciled dynamically by the
 * framework without re-rendering the parent component.
 */
export type UiChild = UiElement | Observable<UiElement | UiElement[]>;

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
   * Child elements or observable streams of elements.
   */
  readonly children: readonly UiChild[];
}

/**
 * Returns true when the value is an RxJS Observable.
 *
 * Uses structural detection so Observable subclasses and instances
 * from different bundles are recognized.
 */
export function isObservable(value: unknown): value is Observable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<Observable<unknown>>).subscribe === 'function'
  );
}

/**
 * Returns true when the value is a UiChild (element or observable).
 */
export function isUiChild(value: unknown): value is UiChild {
  return isUiElement(value) || isObservable(value);
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
