import type { Component } from './Component';
import type { ComponentElement } from './ComponentElement';
import { getComponentMetadata } from './metadata';

/**
 * Creates a ComponentElement for use as a child of a UiElement.
 *
 * Example:
 *
 *   Column(
 *     createComponent(Counter, { label: 'Count' })
 *   )
 */
export function createComponent<P extends Record<string, unknown>>(
  componentClass: new () => Component,
  props: P = {} as P,
  key?: string | number
): ComponentElement<P> {
  const metadata = getComponentMetadata(componentClass);
  return {
    kind: 'component',
    tag: metadata.tag,
    componentClass,
    props,
    key
  };
}
