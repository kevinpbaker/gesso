import { getComponentMetadata } from '../metadata';
import { getStoreMetadata } from './StoreMetadata';

/**
 * Declares a reactive state field on a component or store.
 *
 * For components, initialize the field with `state(initialValue)`.
 * For stores, initialize the field with `state(initialValue)`.
 */
export function State(): PropertyDecorator {
  return (target, propertyKey) => {
    const constructor = target.constructor as unknown as new () => unknown;
    // Components and stores share the @State marker.
    getComponentMetadata(constructor).states.add(propertyKey as string);
    getStoreMetadata(constructor).states.add(propertyKey as string);
  };
}

/**
 * Declares a method as a store action.
 *
 * Actions are the only way to mutate remote store state from a
 * component. In local stores, they are also the encouraged entry
 * point for state changes.
 */
export function Action(): MethodDecorator {
  return (target, propertyKey) => {
    const constructor = target.constructor as unknown as new () => unknown;
    getStoreMetadata(constructor).actions.add(propertyKey as string);
  };
}

/**
 * Declares a getter as a store projection.
 *
 * Projections are derived view models that define what the render
 * thread receives from a remote store. In local stores, they are
 * simply computed values accessible through `store.select(...)`.
 */
export function Projection(): MethodDecorator {
  return (target, propertyKey) => {
    const constructor = target.constructor as unknown as new () => unknown;
    getStoreMetadata(constructor).projections.add(propertyKey as string);
  };
}
