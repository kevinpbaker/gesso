import type { Observable } from 'rxjs';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiProps } from './UiProps';

/**
 * Opaque marker for component definitions.
 *
 * The runtime does not know how to mount components; it only
 * recognizes this shape so factory functions can accept components
 * as children. The framework layer resolves ComponentLikeElements
 * into plain UiElements before passing them to UiGraphBuilder.
 */
export interface ComponentLikeElement {
  readonly kind: 'component';
  readonly tag: string;
  /** The class or function to mount; compared by identity across reconciles. */
  readonly component: Function;
  readonly props: Record<string, unknown>;
  readonly key?: string | number;
}

/**
 * A child definition may be a static element, a component definition,
 * or an observable stream of either (or of lists of them). Observable
 * children are reconciled dynamically by the framework without
 * re-rendering the parent component; components inside them are
 * mounted by the framework's resolver as the builder reaches them.
 */
export type UiChild = UiElement | ComponentLikeElement | Observable<UiChild | readonly UiChild[]>;

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
   * Child elements, observable streams of elements, or component
   * definitions.
   */
  readonly children: readonly UiChild[];
}

/**
 * Returns true when the value is a component definition.
 */
export function isComponentLikeElement(value: unknown): value is ComponentLikeElement {
  return typeof value === 'object' && value !== null && (value as Partial<ComponentLikeElement>).kind === 'component';
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
    !isComponentLikeElement(value) &&
    typeof (value as Partial<Observable<unknown>>).subscribe === 'function'
  );
}

/**
 * Returns true when the value is a UiChild (element, observable, or
 * component definition).
 */
export function isUiChild(value: unknown): value is UiChild {
  return isUiElement(value) || isObservable(value) || isComponentLikeElement(value);
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
