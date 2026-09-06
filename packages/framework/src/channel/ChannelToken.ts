/**
 * The barrier between the application and the view, declared once.
 *
 * A token is a name, a shape and an initial value — and no
 * implementation at all. Both threads import it, which is the point:
 * the module holding it has nothing in it to bundle, so an app's api
 * client and domain logic never reach the render worker the way a
 * shared `Store` class dragged them there.
 *
 * What the framework knows about a channel ends here. It diffs plain
 * data and ships patches; where the observables came from — a single
 * subject, or an api → repository → domain → view-model stack — is the
 * application's business and the framework cannot tell the difference.
 *
 *   export interface CatalogView {
 *     products: ProductRow[];
 *     status: 'loading' | 'ready' | 'error';
 *   }
 *   export interface CatalogCommands {
 *     addToCart(id: string): void;
 *   }
 *   export const Catalog = channel<CatalogView, CatalogCommands>('catalog', {
 *     products: [],
 *     status: 'loading'
 *   });
 */

/**
 * A command a component can send back across the barrier.
 *
 * The arguments are what cross: each is structured-cloned onto the
 * owning thread, so they must be plain data. There may be as many as
 * the command needs, which is why `move(from, to)` is written the way
 * anyone would write it rather than as `move({ from, to })`; a command
 * used to carry one payload and the second argument was dropped on the
 * floor with a warning.
 *
 * Commands return nothing: the effect comes back as a patch, never as
 * a return value, since there is no synchronous answer to be had
 * across a thread.
 */
export type Command = (...args: never[]) => void;

/**
 * The internal view of a command set: a bag of callables by name.
 *
 * Public signatures constrain to `object`, not to this. An application
 * declares its commands as an ordinary interface —
 * `interface CatalogCommands { addToCart(id: string): void }` — and an
 * interface has no index signature, so it does not satisfy a
 * `Record<string, …>` constraint however well it fits in spirit.
 * Constraining to `object` accepts what people actually write; this
 * alias is what the implementation casts to when it looks a command up
 * by name.
 */
export type CommandMap = Record<string, Command>;

/** The declared barrier for one area of an application. */
export interface ChannelToken<View extends object, Commands extends object = Record<string, never>> {
  readonly name: string;
  /**
   * What every view key holds before the first patch arrives.
   *
   * Required rather than optional, so the render thread never observes
   * `undefined` for a declared key. A channel that is genuinely still
   * loading says so in its own shape — a `status` field — rather than
   * leaving the view to infer it from an absence.
   */
  readonly initial: View;
  /** Phantom, carrying the command types to `send`. Never read. */
  readonly commands?: Commands;
}

/**
 * Declares a channel.
 *
 * The name identifies it across the thread boundary and must be
 * stable; unlike a class name it survives minification, which is why
 * it is written out rather than derived.
 */
export function channel<View extends object, Commands extends object = Record<string, never>>(
  name: string,
  initial: View
): ChannelToken<View, Commands> {
  if (name.length === 0) {
    throw new Error('A channel needs a name: it is how the two threads agree on which one this is.');
  }
  return { name, initial };
}

/** A channel written as one object: the view with its values, and the commands. */
export interface ChannelSpec<View extends object, Commands extends object> {
  /**
   * Every view key with the value it holds before the first patch.
   *
   * The type of the channel's view is the type of this object, so the
   * keys and their initial values are written once instead of in an
   * interface and again in a literal that has to agree with it.
   */
  readonly view: View;
  /**
   * The commands, as a type rather than as implementations.
   *
   * Written `{} as { addToCart(id: string, quantity: number): void }`:
   * the handlers live on the thread that owns the data and are passed
   * to `provide`, so what belongs in the token is only their shape.
   */
  readonly commands?: Commands;
}

/**
 * Declares a channel from one object.
 *
 *   export const Catalog = defineChannel('catalog', {
 *     view: {
 *       products: [] as readonly ProductRow[],
 *       status: 'loading' as ShelfStatus
 *     },
 *     commands: {} as {
 *       addToCart(id: string, quantity: number): void;
 *       move(from: number, to: number): void;
 *     }
 *   });
 *
 *   export type CatalogView = ViewOf<typeof Catalog>;
 *
 * The same token `channel()` returns, declared once instead of three
 * times. `channel<View, Commands>(name, initial)` wrote the view as an
 * interface, then as an initial literal that had to agree with it, and
 * a key added to one and forgotten in the other was a type error in a
 * third file. Here the object is the type.
 *
 * A field whose initial value is narrower than the type it holds is
 * given the type it holds: `[]` is `never[]` and `'loading'` is
 * `string` unless it is said, which is what the `as` clauses above are
 * for. `ViewOf` and `CommandsOf` name the resulting types wherever the
 * application used to name its own interface.
 *
 * `channel()` is not deprecated and keeps working exactly as it did.
 * An application with interfaces it wants to keep, because they are
 * shared with something else or because the initial values are built
 * elsewhere, has nothing to migrate.
 */
export function defineChannel<View extends object, Commands extends object = Record<string, never>>(
  name: string,
  spec: ChannelSpec<View, Commands>
): ChannelToken<View, Commands> {
  return channel<View, Commands>(name, spec.view);
}

/** The view type of a channel token, for an application that wants to name it. */
export type ViewOf<T> = T extends ChannelToken<infer View, object> ? View : never;

/** The command type of a channel token. */
export type CommandsOf<T> = T extends ChannelToken<object, infer Commands> ? Commands : never;

/**
 * The keys a channel publishes.
 *
 * Structural in its parameter rather than generic over the token, so
 * it does not have to agree with any particular command type to read
 * what is only ever the initial value's shape.
 */
export function viewKeys(token: { initial: object }): string[] {
  return Object.keys(token.initial);
}
