/**
 * Whether two modifier arguments mean the same thing.
 *
 * A modifier's arguments are compared when its element is rebuilt, and
 * a difference is a reason to update the modifier or, for a kind with no
 * `update`, to detach it and attach a fresh one. Identity was the
 * comparison, and it made `modifiers={[interactive({ hovered: ... })]}`
 * written inline a modifier that re-attached on every render, losing
 * its pointer state and paying its attach cost each time. Nothing warned
 * about it, and hoisting the value to module scope was folklore.
 *
 * So arguments are compared by what they hold: plain objects and arrays
 * recursively, primitives by value, and everything else, functions,
 * Observables, class instances, by identity, because a new callback or
 * a new stream is a genuinely new argument. An inline `interactive(...)`
 * with the same options is now the same modifier, as it reads.
 */
export function sameArgs(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (depth > 8 || typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index++) {
      if (!sameArgs(a[index], b[index], depth + 1)) {
        return false;
      }
    }
    return true;
  }
  if (!isPlain(a) || !isPlain(b)) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false;
    }
    if (!sameArgs((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], depth + 1)) {
      return false;
    }
  }
  return true;
}

function isPlain(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
