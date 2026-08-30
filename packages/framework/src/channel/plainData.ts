/**
 * Checks that a value can cross the barrier.
 *
 * `structurallyEqual` understands primitives, arrays and plain
 * objects, and falls back to reference equality for everything else —
 * which for a freshly built value reports "changed" every single time.
 * A view key holding a `Date`, a `Map` or a domain object therefore
 * re-emits on every unrelated update and dirties the subtree bound to
 * it, forever, while looking perfectly correct.
 *
 * That failure is invisible in a test and shows up as a vague slowness
 * much later, so `provide` checks each key's first emission and throws
 * naming the path. The view-model layer is where rich objects become
 * flat data; this is what makes that a rule rather than a convention.
 *
 * The check runs once per key, on the first value only. It is a
 * development guard against a design mistake, not a validator on the
 * hot path.
 */

const MAX_DEPTH = 100;

/**
 * Returns the path to the first value that cannot cross, or null when
 * the whole tree is plain data.
 */
export function findUnplainPath(value: unknown, path: readonly (string | number)[] = []): string | null {
  if (path.length > MAX_DEPTH) {
    return format(path);
  }
  if (value === null) {
    return null;
  }
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean' || type === 'undefined') {
    return null;
  }
  if (type === 'function' || type === 'symbol' || type === 'bigint') {
    return format(path);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const found = findUnplainPath(value[index], [...path, index]);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  const prototype = Object.getPrototypeOf(value as object);
  if (prototype !== Object.prototype && prototype !== null) {
    return format(path);
  }
  for (const [key, member] of Object.entries(value as Record<string, unknown>)) {
    const found = findUnplainPath(member, [...path, key]);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/**
 * Throws when `value` cannot cross the barrier, naming the channel,
 * the key and the path within it.
 */
export function requirePlainData(channelName: string, key: string, value: unknown): void {
  const path = findUnplainPath(value);
  if (path === null) {
    return;
  }
  const where = path === '' ? `'${key}'` : `'${key}'${path}`;
  throw new Error(
    `Channel '${channelName}' published ${where}, which is not plain data. ` +
      `Only primitives, arrays and plain objects cross the barrier: a Date, Map, Set, ` +
      `class instance or function compares by reference, so it would report a change on ` +
      `every update and rebuild the subtree bound to it. Flatten it in the view model.`
  );
}

function format(path: readonly (string | number)[]): string {
  return path.map(step => (typeof step === 'number' ? `[${step}]` : `.${step}`)).join('');
}
