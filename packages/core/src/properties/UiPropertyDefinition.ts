import type { DirtyFlags } from '../graph/DirtyFlags';
import type { UiEnvironmentKey } from '../environment/UiEnvironmentKey';

/**
 * Metadata describing a single UI property.
 *
 * The runtime uses this definition to know:
 *
 *   - what the property is called
 *   - what value to use when none is specified
 *   - whether the value inherits from the scoped environment
 *   - what changing the value invalidates
 *   - how to compare two values for equality
 *
 * A property may optionally declare an environment key and a
 * resolver that extracts the property value from that environment
 * value. When `environmentKey` is absent, inherited properties look
 * for an environment key whose name matches the property name.
 */
export interface UiPropertyDefinition<T> {
  readonly name: string;
  readonly defaultValue: T;
  readonly inherited: boolean;
  readonly affects: DirtyFlags;
  readonly compare?: (a: T, b: T) => boolean;
  readonly environmentKey?: UiEnvironmentKey<unknown>;
  readonly resolveFromEnvironment?: (value: unknown) => T;
  /**
   * Rejects a value the property cannot hold, returning the message
   * for the error the builder throws. Declared only by properties with
   * a closed set of values, such as `role`; the builder checks it when
   * a plain value is written, so it costs nothing on the graph's own
   * write path. A value arriving through an Observable is checked by
   * whatever reads it, as a bound length is checked at layout.
   */
  readonly validate?: (value: T) => string | undefined;
  /**
   * Narrows `affects` for one particular change, when what changed
   * shows that less is invalid than the property's worst case.
   *
   * `paint` is the reason it exists. A painter may declare an intrinsic
   * size, so a new painter can change layout, and `affects` has to say
   * so; but a new picture with the same declared size (usually none)
   * cannot, and marking layout for it laid the tree out again up to the
   * nearest relayout boundary on every repaint, which for a painted
   * node sized by its parent was the root, every frame of a scroll.
   * Given the old and new values and the flags `affects` gives, it
   * returns the flags this change actually needs.
   */
  readonly narrowEffects?: (previous: T, next: T, flags: DirtyFlags) => DirtyFlags;
}

/**
 * Creates a property definition with the supplied metadata.
 *
 * The default compare function is reference equality (`Object.is`).
 */
export function defineProperty<T>(
  options: Omit<UiPropertyDefinition<T>, 'name'> & { name: string }
): UiPropertyDefinition<T> {
  return {
    name: options.name,
    defaultValue: options.defaultValue,
    inherited: options.inherited,
    affects: options.affects,
    compare: options.compare,
    environmentKey: options.environmentKey,
    resolveFromEnvironment: options.resolveFromEnvironment,
    validate: options.validate,
    narrowEffects: options.narrowEffects
  };
}

/**
 * Compares two property values using the definition's comparison
 * function, falling back to `Object.is` when none is provided.
 */
export function propertyValuesEqual<T>(definition: UiPropertyDefinition<T>, a: T, b: T): boolean {
  if (definition.compare !== undefined) {
    return definition.compare(a, b);
  }
  return Object.is(a, b);
}
