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
 * At most one argument, because the argument is what crosses: it is
 * structured-cloned onto the owning thread. Commands return nothing —
 * the effect comes back as a patch, never as a return value, since
 * there is no synchronous answer to be had across a thread.
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
