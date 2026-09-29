import { structurallyEqual } from './structuralEquals';

export type PatchPath = readonly (string | number)[];

/**
 * A change to one projection, as sent from a data worker to a replica.
 *
 * Paths are relative to the projection's root value, so a patch is
 * self-contained: the replica never needs the previous value to apply
 * one, only the value it already holds.
 */
export type Patch =
  | { op: 'set'; projection: string; path: PatchPath; value: unknown }
  | { op: 'delete'; projection: string; path: PatchPath }
  | {
      op: 'splice';
      projection: string;
      path: PatchPath;
      index: number;
      deleteCount: number;
      items: readonly unknown[];
    };

/**
 * Describes how to turn `previous` into `current` for one projection.
 *
 * Returns an empty list when nothing changed, which is the common case
 * and the reason this exists: the point of a projection is that most
 * state changes do not alter it, and the ones that do usually alter a
 * small part.
 */
export function diffProjection(projection: string, previous: unknown, current: unknown): Patch[] {
  const patches: Patch[] = [];
  diff(projection, [], previous, current, patches);
  return patches;
}

function diff(projection: string, path: PatchPath, previous: unknown, current: unknown, out: Patch[]): void {
  if (structurallyEqual(previous, current)) {
    return;
  }

  if (Array.isArray(previous) && Array.isArray(current)) {
    diffArray(projection, path, previous, current, out);
    return;
  }

  if (isPlainObject(previous) && isPlainObject(current)) {
    for (const key of Object.keys(current)) {
      if (Object.prototype.hasOwnProperty.call(previous, key)) {
        diff(projection, [...path, key], previous[key], current[key], out);
      } else {
        out.push({ op: 'set', projection, path: [...path, key], value: current[key] });
      }
    }
    for (const key of Object.keys(previous)) {
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        out.push({ op: 'delete', projection, path: [...path, key] });
      }
    }
    return;
  }

  out.push({ op: 'set', projection, path, value: current });
}

/**
 * Diffs two arrays by trimming the common prefix and suffix.
 *
 * This is not a minimal edit script — a shuffle degrades to replacing
 * the middle wholesale. It is chosen because the operations lists
 * actually undergo (append, prepend, remove one, edit in place) all
 * reduce to a single small patch, and computing a true LCS on every
 * store change would cost more than it saves.
 */
function diffArray(projection: string, path: PatchPath, previous: unknown[], current: unknown[], out: Patch[]): void {
  let start = 0;
  while (start < previous.length && start < current.length && structurallyEqual(previous[start], current[start])) {
    start++;
  }

  let previousEnd = previous.length - 1;
  let currentEnd = current.length - 1;
  while (previousEnd >= start && currentEnd >= start && structurallyEqual(previous[previousEnd], current[currentEnd])) {
    previousEnd--;
    currentEnd--;
  }

  const previousCount = previousEnd - start + 1;
  const currentCount = currentEnd - start + 1;

  if (previousCount === 0 && currentCount === 0) {
    return;
  }

  if (previousCount === currentCount) {
    // Same span on both sides: these are edits in place, so recurse
    // and let nested diffs stay small rather than resending elements.
    for (let offset = 0; offset < previousCount; offset++) {
      const index = start + offset;
      diff(projection, [...path, index], previous[index], current[index], out);
    }
    return;
  }

  out.push({
    op: 'splice',
    projection,
    path,
    index: start,
    deleteCount: previousCount,
    items: current.slice(start, currentEnd + 1)
  });
}

/**
 * Applies patches to a projection value, sharing structure with the
 * original everywhere the patch did not reach.
 *
 * Nothing handed in is mutated: bindings hold onto emitted values, so a
 * replica that edited in place would change data a component already
 * rendered.
 *
 * **Each container on a patched path is copied once per batch, not once
 * per patch.** A batch of N patches into one K-key object used to cost
 * N × K: every patch spread the whole object again to change one key.
 * A snapshot keyed by id is exactly that shape — gessologic published
 * `Record<netId, 0 | 1>` for ten thousand nets, about nine hundred
 * patches a publish, and the render worker's patch phase fell minutes
 * behind a 60 Hz stream it could never catch. So the batch remembers
 * the containers it has copied, and writes into those in place: they
 * are its own, made during this call and seen by nobody yet. Values
 * that arrived inside a patch are never written into, because they are
 * the patch's — a devtools log replays the same patch objects again.
 */
export function applyPatches(root: unknown, patches: readonly Patch[]): unknown {
  const owned = new Set<object>();
  let next = root;
  for (const patch of patches) {
    next = applyOne(next, patch, owned);
  }
  return next;
}

export function applyPatch(root: unknown, patch: Patch): unknown {
  return applyOne(root, patch, new Set());
}

/** The containers this batch copied, and may therefore write into. */
type Owned = Set<object>;

function applyOne(root: unknown, patch: Patch, owned: Owned): unknown {
  switch (patch.op) {
    case 'set':
      return setIn(root, patch.path, 0, patch.value, owned);
    case 'delete':
      if (patch.path.length === 0) {
        return undefined;
      }
      return deleteIn(root, patch.path, 0, owned);
    case 'splice':
      return updateIn(root, patch.path, 0, owned, node => {
        // Concatenation rather than `splice(..., ...items)`: spreading
        // the items passes each as an argument, and a batch of two
        // hundred thousand overflows the call stack.
        const array = Array.isArray(node) ? node : [];
        const spliced = array.slice(0, patch.index).concat(patch.items, array.slice(patch.index + patch.deleteCount));
        owned.add(spliced);
        return spliced;
      });
  }
}

function setIn(node: unknown, path: PatchPath, index: number, value: unknown, owned: Owned): unknown {
  if (index === path.length) {
    return value;
  }
  const key = path[index];
  const copy = cloneContainer(node, key, owned);
  setKey(copy, key, setIn(readKey(node, key), path, index + 1, value, owned));
  return copy;
}

function deleteIn(node: unknown, path: PatchPath, index: number, owned: Owned): unknown {
  const key = path[index];
  const copy = cloneContainer(node, key, owned);
  if (index === path.length - 1) {
    if (Array.isArray(copy)) {
      copy.splice(Number(key), 1);
    } else {
      delete (copy as Record<string, unknown>)[String(key)];
    }
    return copy;
  }
  setKey(copy, key, deleteIn(readKey(node, key), path, index + 1, owned));
  return copy;
}

function updateIn(
  node: unknown,
  path: PatchPath,
  index: number,
  owned: Owned,
  update: (node: unknown) => unknown
): unknown {
  if (index === path.length) {
    return update(node);
  }
  const key = path[index];
  const copy = cloneContainer(node, key, owned);
  setKey(copy, key, updateIn(readKey(node, key), path, index + 1, owned, update));
  return copy;
}

/**
 * The container to write `key` into: `node` itself when this batch
 * already copied it, and a fresh copy, remembered, when it did not.
 */
function cloneContainer(node: unknown, key: string | number, owned: Owned): unknown[] | Record<string, unknown> {
  if (typeof node === 'object' && node !== null && owned.has(node)) {
    return node as unknown[] | Record<string, unknown>;
  }
  let copy: unknown[] | Record<string, unknown>;
  if (Array.isArray(node)) {
    copy = node.slice();
  } else if (isPlainObject(node)) {
    copy = { ...node };
  } else {
    // The path runs past the end of what the replica holds, which
    // happens when a patch fills in a branch that did not exist yet.
    copy = typeof key === 'number' ? [] : {};
  }
  owned.add(copy);
  return copy;
}

function readKey(node: unknown, key: string | number): unknown {
  if (node === null || node === undefined) {
    return undefined;
  }
  return (node as Record<string | number, unknown>)[key];
}

function setKey(container: unknown[] | Record<string, unknown>, key: string | number, value: unknown): void {
  (container as Record<string | number, unknown>)[key] = value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
