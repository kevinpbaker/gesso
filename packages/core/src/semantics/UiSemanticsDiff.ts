import type { UiSemanticsMap, UiSemanticsRecord } from './UiSemanticsTree';

/**
 * What changed in the semantics tree between two frames.
 *
 * `add` and `update` carry the whole record rather than a delta: the
 * records are small, the consumer is a DOM mirror that sets attributes
 * from them, and a whole record cannot be applied out of order into
 * something half-updated. `remove` carries only the id, since a
 * removed subtree's records are each removed in their own patch.
 *
 * A record whose index moved only because a sibling came or went is
 * not sent (see `dropIndexShifts`). A consumer that applies removals,
 * then adds and updates in order, placing each at its index, keeps its
 * children in order without them.
 */
export type UiSemanticsPatch =
  | { readonly op: 'add'; readonly node: UiSemanticsRecord }
  | { readonly op: 'update'; readonly node: UiSemanticsRecord }
  | { readonly op: 'remove'; readonly id: string };

/**
 * Diffs two semantics maps.
 *
 * Removals come first so a consumer never holds two records claiming
 * the same parent and index; adds and updates follow in document
 * order, which is the order `buildSemanticsTree` produced them in, so
 * a mirror can append as it reads.
 */
export function diffSemantics(previous: UiSemanticsMap, next: UiSemanticsMap): UiSemanticsPatch[] {
  const patches: UiSemanticsPatch[] = [];
  for (const id of previous.keys()) {
    if (!next.has(id)) {
      patches.push({ op: 'remove', id });
    }
  }
  for (const [id, record] of next) {
    const before = previous.get(id);
    if (before === undefined) {
      patches.push({ op: 'add', node: record });
      continue;
    }
    if (!recordsEqual(before, record)) {
      patches.push({ op: 'update', node: record });
    }
  }
  return patches;
}

/**
 * Drops the updates that only renumber a record whose siblings kept
 * their order.
 *
 * A record carries its index among its siblings, so inserting one near
 * the top of a list changes the index of every record after it, and
 * each of those used to go out as an update: 4,266 patches for one
 * paragraph inserted in a 5,000-line document, every one of them
 * crossing to the main thread and rewriting a mirror element. They say
 * nothing a mirror needs. It applies removals, then adds in document
 * order at their indices, so the elements that stayed are already in
 * the right order around the ones that came and went. Only when the
 * siblings that stayed changed their order among themselves (a move)
 * do the new indices matter, and then every update is kept.
 *
 * The records keep their new indices; this only thins the patches.
 */
export function dropIndexShifts(
  previous: UiSemanticsMap,
  next: UiSemanticsMap,
  patches: readonly UiSemanticsPatch[]
): UiSemanticsPatch[] {
  const parents = new Set<string | null>();
  for (const patch of patches) {
    if (patch.op === 'update' && onlyIndexMoved(previous.get(patch.node.id), patch.node)) {
      parents.add(patch.node.parent);
    }
  }
  if (parents.size === 0) {
    return [...patches];
  }
  // For each of those parents, its children that were there before and
  // still are, in their new order: their old indices must still rise.
  const lastOld = new Map<string | null, number>();
  const reordered = new Set<string | null>();
  for (const record of next.values()) {
    if (!parents.has(record.parent) || reordered.has(record.parent)) {
      continue;
    }
    const before = previous.get(record.id);
    if (before === undefined || before.parent !== record.parent) {
      continue;
    }
    if (before.index < (lastOld.get(record.parent) ?? -1)) {
      reordered.add(record.parent);
    }
    lastOld.set(record.parent, before.index);
  }
  return patches.filter(
    patch =>
      patch.op !== 'update' ||
      reordered.has(patch.node.parent) ||
      !onlyIndexMoved(previous.get(patch.node.id), patch.node)
  );
}

/** Whether two records differ in their index and in nothing else. */
function onlyIndexMoved(before: UiSemanticsRecord | undefined, after: UiSemanticsRecord): boolean {
  if (before === undefined || before.parent !== after.parent || before.index === after.index) {
    return false;
  }
  return recordsEqual({ ...before, index: after.index }, after);
}

/** Structural equality over the record's flat, pruned members. */
export function recordsEqual(a: UiSemanticsRecord, b: UiSemanticsRecord): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    const left = (a as unknown as Record<string, unknown>)[key];
    const right = (b as unknown as Record<string, unknown>)[key];
    if (key === 'states') {
      const leftStates = left as readonly string[];
      const rightStates = right as readonly string[] | undefined;
      if (
        rightStates === undefined ||
        leftStates.length !== rightStates.length ||
        leftStates.some((state, index) => state !== rightStates[index])
      ) {
        return false;
      }
      continue;
    }
    if (!Object.is(left, right)) {
      return false;
    }
  }
  return true;
}
