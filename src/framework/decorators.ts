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
 * Declares a property as an injected runtime service.
 *
 * The service must be registered with useService(), or be one of
 * the six a runtime registers itself.
 */
export function Inject<T extends Function>(StoreClass: T): PropertyDecorator {
  return (target, propertyKey) => {
    const constructor = target.constructor as unknown as new () => unknown;
    const metadata = getComponentMetadata(constructor);
    metadata.injects.set(propertyKey as string, StoreClass);
  };
}

/**
 * Declares a property as a channel from across the barrier.
 *
 * The property becomes the channel's replica: `view` keys to read or
 * bind, and `send` to issue a command. It is the class counterpart of
 * `ctx.channel(token)`.
 *
 *   @Channel(Catalog) catalog!: ChannelReplica<CatalogView, CatalogCommands>;
 */
export function Channel(token: { name: string }): PropertyDecorator {
  return (target, propertyKey) => {
    const constructor = target.constructor as unknown as new () => unknown;
    const metadata = getComponentMetadata(constructor);
    metadata.channels.set(propertyKey as string, token);
  };
}
