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
 * Creates an environment key.
 */
export function createEnvironmentKey<T>(options: {
  name: string;
  defaultValue: T;
  compare?: (a: T, b: T) => boolean;
}): UiEnvironmentKey<T> {
  return {
    name: options.name,
    defaultValue: options.defaultValue,
    compare: options.compare
  };
}
