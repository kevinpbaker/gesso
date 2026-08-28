import type { UiChild } from '../ui/composition/UiElement';
import type { Component } from './Component';

/**
 * Declarative representation of a component instance in the tree.
 *
 * ComponentElements are resolved by ComponentRenderer into plain
 * UiElement trees before being passed to UiGraphBuilder.
 */
export interface ComponentElement<P = Record<string, unknown>> {
  readonly kind: 'component';
  readonly tag: string;
  readonly componentClass: new () => Component;
  readonly props: P;
  readonly key?: string | number;
}

export function isComponentElement(value: unknown): value is ComponentElement {
  return typeof value === 'object' && value !== null && (value as Partial<ComponentElement>).kind === 'component';
}

/**
 * Anything the framework accepts as a child: a runtime element, an
 * observable stream of elements, or a component definition.
 */
export type FrameworkChild = UiChild | ComponentElement;
