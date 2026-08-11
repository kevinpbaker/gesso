import type { UiNode } from '../graph/UiNode';
import type { UiEnvironmentKey } from '../environment/UiEnvironmentKey';
import { findPropertyDefinition } from './UiPropertyRegistry';
import type { UiPropertyDefinition } from './UiPropertyDefinition';

/**
 * Resolves a property value for a node.
 *
 * Resolution order:
 *
 *   1. The value explicitly specified on the node.
 *   2. The value inherited from the node's scoped environment.
 *   3. The property definition's default value.
 *
 * The resolver does not allocate and is safe to call from hot paths
 * such as layout and paint.
 */
export function resolveProperty<T>(node: UiNode, definition: UiPropertyDefinition<T>): T {
  const specified = node.properties.get(definition.name);
  if (specified !== undefined) {
    return specified as T;
  }

  if (definition.inherited && node.environment !== null) {
    const environmentKey = definition.environmentKey;
    if (environmentKey !== undefined) {
      const envValue = node.environment.get(environmentKey);
      if (definition.resolveFromEnvironment !== undefined) {
        return definition.resolveFromEnvironment(envValue);
      }
      return envValue as T;
    }

    const fallback = node.environment.get(createFallbackKey(definition));
    if (fallback !== undefined) {
      return fallback as T;
    }
  }

  return definition.defaultValue;
}

/**
 * Resolves a property by name.
 *
 * Returns undefined when no definition exists; callers that know
 * the property exists should use resolveProperty() with the
 * definition for stronger typing.
 */
export function resolvePropertyByName<T>(node: UiNode, name: string): T | undefined {
  const definition = findPropertyDefinition<T>(name);
  if (definition === undefined) {
    return undefined;
  }
  return resolveProperty(node, definition);
}

/**
 * Resolves a numeric property, returning undefined when the value
 * is missing or not a finite number.
 */
export function resolveNumber(node: UiNode, name: string): number | undefined {
  const value = resolvePropertyByName<unknown>(node, name);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

/**
 * Resolves a string property, returning undefined when the value is
 * missing or not a non-empty string.
 */
export function resolveString(node: UiNode, name: string): string | undefined {
  const value = resolvePropertyByName<unknown>(node, name);
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return undefined;
}

/**
 * Resolves a boolean property, returning undefined when the value
 * is missing or not a boolean.
 */
export function resolveBoolean(node: UiNode, name: string): boolean | undefined {
  const value = resolvePropertyByName<unknown>(node, name);
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

/**
 * Lazily creates a fallback environment key that matches the
 * property name. The key is cached so repeated resolutions of the
 * same property do not allocate.
 */
const fallbackKeys = new Map<string, UiEnvironmentKey<unknown>>();

function createFallbackKey<T>(definition: UiPropertyDefinition<T>): UiEnvironmentKey<unknown> {
  let key = fallbackKeys.get(definition.name);
  if (key === undefined) {
    key = {
      name: definition.name,
      defaultValue: definition.defaultValue as unknown,
      compare: definition.compare as ((a: unknown, b: unknown) => boolean) | undefined
    };
    fallbackKeys.set(definition.name, key);
  }
  return key;
}
