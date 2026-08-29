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
 * The registered property name closest to `name`, for the error a
 * misspelled prop raises; undefined when nothing is reasonably close.
 * Case differences count as one edit so `Width` suggests `width`.
 */
export function closestPropertyName(name: string, candidates: Iterable<string> = registry.keys()): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  const target = name.toLowerCase();
  for (const candidate of candidates) {
    const distance = editDistance(target, candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  // Allow more edits for longer names; a two-letter prop must be exact.
  return best !== undefined && bestDistance <= Math.max(1, Math.floor(name.length / 3)) ? best : undefined;
}

/** Edits between two strings, an adjacent transposition (`widht`) counting as one. */
function editDistance(a: string, b: string): number {
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push(Array.from({ length: b.length + 1 }, () => 0));
    rows[i][0] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    rows[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = best;
    }
  }
  return rows[a.length][b.length];
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
 * The union of the dirty flags every inherited property affects.
 *
 * This is what an environment change has to mark on the nodes it
 * reaches, and the registry is fixed at module load, so it is computed
 * once rather than on every propagation.
 */
export const inheritedPropertyFlags: DirtyFlags = (() => {
  let flags = DirtyFlags.None;
  for (const definition of registry.values()) {
    if (definition.inherited) {
      flags |= definition.affects;
    }
  }
  // Nothing inherited still has to repaint: a node that resolved a
  // default is drawn with it.
  return flags === DirtyFlags.None ? DirtyFlags.Paint : flags;
})();

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
