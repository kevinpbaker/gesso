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
