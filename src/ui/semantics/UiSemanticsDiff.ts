import type { UiSemanticsMap, UiSemanticsRecord } from './UiSemanticsTree';

/**
 * What changed in the semantics tree between two frames.
 *
 * `add` and `update` carry the whole record rather than a delta: the
 * records are small, the consumer is a DOM mirror that sets attributes
 * from them, and a whole record cannot be applied out of order into
 * something half-updated. `remove` carries only the id, since a
 * removed subtree's records are each removed in their own patch.
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
