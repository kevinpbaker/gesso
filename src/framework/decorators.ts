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
 * Declares a property as an injected store.
 *
 * The store must be registered with createApp().useStore().
 */
export function Inject<T extends Function>(StoreClass: T): PropertyDecorator {
  return (target, propertyKey) => {
    const constructor = target.constructor as unknown as new () => unknown;
    const metadata = getComponentMetadata(constructor);
    metadata.injects.set(propertyKey as string, StoreClass);
  };
}
