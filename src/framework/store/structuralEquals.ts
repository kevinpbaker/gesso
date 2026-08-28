/**
 * Deep comparison for store read models.
 *
 * Projections and selectors allocate a fresh value on every
 * evaluation, so reference equality reports a change on every
 * unrelated state emission. That invalidates bindings and dirties
 * nodes across the whole tree for state the view never read.
 *
 * Scope is deliberately narrow: primitives, arrays, and plain objects
 * — what a projection is allowed to return. Anything else (class
 * instances, Date, Map, Set, functions) compares by reference, which
 * is conservative: it reports a change, so the UI updates when it did
 * not need to rather than failing to update when it did.
 *
 * The same comparison becomes the equality half of the patch differ
 * in Phase E, so a store behaves identically local or remote.
 */
const MAX_DEPTH = 100;

export function structurallyEqual<T>(a: T, b: T): boolean {
  return compare(a, b, 0);
}

function compare(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (depth > MAX_DEPTH) {
    // Deeper than any sane view model, or cyclic. Report "changed"
    // rather than risk a non-terminating walk.
    return false;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) {
    return false;
  }

  if (aIsArray) {
    const left = a as unknown[];
    const right = b as unknown[];
    if (left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < left.length; i++) {
      if (!compare(left[i], right[i], depth + 1)) {
        return false;
      }
    }
    return true;
  }

  if (!isPlainObject(a) || !isPlainObject(b)) {
    return false;
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) {
      return false;
    }
    if (!compare(left[key], right[key], depth + 1)) {
      return false;
    }
  }
  return true;
}

/**
 * Objects created from an object literal or a null prototype. Class
 * instances are excluded so they keep reference semantics.
 */
function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
