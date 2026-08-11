import { DirtyFlags } from '../graph/DirtyFlags';
import { UiProperties } from './UiProperty';
import type { UiPropertyDefinition } from './UiPropertyDefinition';

/**
 * Lookup table from property name to its definition.
 */
const registry = new Map<string, UiPropertyDefinition<unknown>>();

for (const definition of Object.values(UiProperties)) {
  registry.set(definition.name, definition as UiPropertyDefinition<unknown>);
}

/**
 * Returns the property definition for the supplied name, or
 * undefined when no definition exists.
 */
export function findPropertyDefinition<T>(name: string): UiPropertyDefinition<T> | undefined {
  return registry.get(name) as UiPropertyDefinition<T> | undefined;
}

/**
 * Returns all registered property names.
 */
export function getPropertyNames(): string[] {
  return Array.from(registry.keys());
}

/**
 * Returns the dirty flags caused by changing the named property.
 *
 * Unknown properties are treated as generic property changes so
 * they are never silently ignored.
 */
export function propertyEffects(name: string): DirtyFlags {
  const definition = findPropertyDefinition<unknown>(name);
  if (definition !== undefined) {
    return definition.affects;
  }
  return DirtyFlags.Properties;
}

/**
 * Returns true when the named property is declared as inherited.
 */
export function propertyIsInherited(name: string): boolean {
  const definition = findPropertyDefinition<unknown>(name);
  return definition?.inherited ?? false;
}

/**
 * The names of all declared inherited properties.
 */
export function inheritedPropertyNames(): string[] {
  const names: string[] = [];
  for (const definition of registry.values()) {
    if (definition.inherited) {
      names.push(definition.name);
    }
  }
  return names;
}

/**
 * Compares two values for the named property using the definition's
 * comparison function, falling back to Object.is.
 */
export function propertyValuesEqualByName<T>(name: string, a: T, b: T): boolean {
  const definition = findPropertyDefinition<T>(name);
  if (definition !== undefined && definition.compare !== undefined) {
    return definition.compare(a, b);
  }
  return Object.is(a, b);
}
