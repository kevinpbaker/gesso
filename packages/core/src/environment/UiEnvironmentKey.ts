/**
 * A typed key for a value in the scoped UI environment.
 *
 * Environment keys are similar to Jetpack Compose's
 * CompositionLocal keys: they are static identifiers that carry
 * type information and a default value. A provider node can
 * override the value; descendants resolve the nearest override.
 */
export interface UiEnvironmentKey<T> {
  readonly name: string;
  readonly defaultValue: T;
  readonly compare?: (a: T, b: T) => boolean;
}

/**
 * Every key ever created, by name.
 *
 * Comparing two environments means going from the name an environment
 * stores back to the key that knows how to compare its values. That
 * lookup runs once per provided key per node across a propagated
 * subtree, so it has to be O(1) and allocation-free; scanning the
 * built-in key table would also miss keys declared elsewhere.
 */
const keysByName = new Map<string, UiEnvironmentKey<unknown>>();

/**
 * Creates an environment key.
 *
 * Re-declaring a name replaces the registered key rather than
 * failing, so that a module re-executed by dev-server hot reload
 * leaves the registry pointing at the keys currently in use.
 */
export function createEnvironmentKey<T>(options: {
  name: string;
  defaultValue: T;
  compare?: (a: T, b: T) => boolean;
}): UiEnvironmentKey<T> {
  const key: UiEnvironmentKey<T> = {
    name: options.name,
    defaultValue: options.defaultValue,
    compare: options.compare
  };
  keysByName.set(options.name, key as UiEnvironmentKey<unknown>);
  return key;
}

/**
 * The key declared under a name, or undefined when the name was never
 * declared as a key.
 */
export function findEnvironmentKey(name: string): UiEnvironmentKey<unknown> | undefined {
  return keysByName.get(name);
}

/**
 * A value a node provides for a key of your own, to everything under
 * it: `provide={[provided(Session, session)]}`.
 *
 * The keys Gesso declares are provided by props of their own (`theme`,
 * `pointer`, `contentColor`); this is how a key made with
 * `createEnvironmentKey` is. A component under the node reads it with
 * `ctx.environment(key)`. What the environment holds is compared by
 * the key's `compare`, else by identity, so a value that changes often
 * is better provided as a source (a cell) than as each new value: the
 * source is set once and never compares unequal again.
 */
export interface UiProvision<T = unknown> {
  readonly key: UiEnvironmentKey<T>;
  readonly value: T;
}

/**
 * A value for `key`, for a node's `provide`. Typed against the key
 * here and erased in the result, so one list holds keys of any type.
 */
export function provided<T>(key: UiEnvironmentKey<T>, value: T): UiProvision {
  return { key: key as UiEnvironmentKey<unknown>, value };
}
