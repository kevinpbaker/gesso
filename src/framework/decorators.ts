import { getComponentMetadata } from './metadata';

/**
 * Declares a class as a Nodal component.
 *
 * The tag is used for debugging and identity; it does not create
 * a DOM element.
 */
export function Define(tag: string): ClassDecorator {
  return target => {
    const metadata = getComponentMetadata(target as unknown as new () => unknown);
    metadata.tag = tag;
  };
}

/**
 * Declares a property as a component input.
 *
 * Input values are supplied by the parent through createComponent().
 */
export function Input(): PropertyDecorator {
  return (target, propertyKey) => {
    const constructor = target.constructor as unknown as new () => unknown;
    const metadata = getComponentMetadata(constructor);
    metadata.inputs.add(propertyKey as string);
  };
}

/**
 * Declares a property as reactive component state.
 *
 * The property should be initialized with `state(initialValue)`.
 */
export function State(): PropertyDecorator {
  return (target, propertyKey) => {
    const constructor = target.constructor as unknown as new () => unknown;
    const metadata = getComponentMetadata(constructor);
    metadata.states.add(propertyKey as string);
  };
}
