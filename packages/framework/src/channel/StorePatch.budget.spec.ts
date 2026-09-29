import { describe, expect, it } from 'vitest';

import { applyPatch, applyPatches, diffProjection, type Patch } from './StorePatch';

/**
 * Budgets for applying a batch of patches.
 *
 * The risk is a batch that costs its length times the size of what it
 * patches. A replica used to copy every container on a patch's path
 * once per patch, so a thousand patches into one wide value copied it a
 * thousand times. gessologic's Phase 0 found it by publishing
 * `Record<netId, 0 | 1>` for ten thousand nets at 60 Hz: the render
 * worker's patch phase fell minutes behind and never recovered.
 *
 * These assert counts, in the shape `LayoutEngine.budget.spec.ts` set.
 * The count is of array copies, because an array's copy is observable
 * and an object's is not: `slice()` builds its result through the
 * species constructor, so every copy of a `Counted` array — and every
 * copy of that copy — is a `Counted` array whose construction is
 * counted. A spread of a plain object calls nothing. Objects and arrays
 * go through the same ownership check, so the object specs below are
 * about correctness and this one number stands for both.
 */
class Counted<T> extends Array<T> {
  static made = 0;

  constructor(...args: number[]) {
    super(...(args as [number]));
    Counted.made++;
  }
}

/** An array of `size` zeroes whose copies are counted from now. */
function wide(size: number): Counted<number> {
  const array = new Counted<number>(size).fill(0) as Counted<number>;
  Counted.made = 0;
  return array;
}

function flips(count: number, prefix: readonly (string | number)[] = []): Patch[] {
  return Array.from({ length: count }, (_, n) => ({
    op: 'set' as const,
    projection: 'signals',
    path: [...prefix, n * 7],
    value: 1
  }));
}

describe('applyPatches budgets', () => {
  it('copies a 10,000-entry value once for a batch of 1,000 patches into it', () => {
    const nets = wide(10_000);

    const next = applyPatches(nets, flips(1_000)) as number[];

    // One copy, where it used to be one per patch: a thousand copies of
    // ten thousand entries, ten million writes for one publish.
    expect(Counted.made).toBe(1);
    expect(next[7]).toBe(1);
    expect(next[6_993]).toBe(1);
    expect(next).toHaveLength(10_000);
    expect(nets[7]).toBe(0);
  });

  it('adds no copies for the sets in a batch that also deletes and splices', () => {
    // The shape a snapshot view has: a small root, one wide value in it,
    // patched by sets, a delete and a splice in one batch. A delete and
    // a splice make arrays of their own by design — `splice` returns the
    // removed entries, a splice patch concatenates slices — so the
    // budget is what those make without the sets, and the 900 sets must
    // add nothing to it.
    const around = (sets: Patch[]): Patch[] => [
      { op: 'set', projection: 'signals', path: ['tick'], value: 1 },
      { op: 'set', projection: 'signals', path: ['nets', 1], value: 1 },
      ...sets,
      { op: 'delete', projection: 'signals', path: ['nets', 9_999] },
      { op: 'splice', projection: 'signals', path: ['nets'], index: 0, deleteCount: 1, items: [5] }
    ];
    applyPatches({ tick: 0, nets: wide(10_000) }, around([]));
    const budget = Counted.made;

    const nets = wide(10_000);
    const next = applyPatches({ tick: 0, nets }, around(flips(900, ['nets']))) as { tick: number; nets: number[] };

    expect(Counted.made).toBe(budget);
    expect(next.tick).toBe(1);
    expect(next.nets).toHaveLength(9_999);
    expect(next.nets[0]).toBe(5);
    expect(next.nets[7]).toBe(1);
    expect(nets[7]).toBe(0);
  });
});

describe('applyPatches writing into its own copies', () => {
  it('copies again in the next batch rather than writing into the last one', () => {
    // The first batch's result has been emitted by now and a component
    // may be holding it, so the second batch must copy it, not edit it.
    const first = applyPatches({ a: 1, list: [1, 2] }, [
      { op: 'set', projection: 'view', path: ['a'], value: 2 },
      { op: 'set', projection: 'view', path: ['list', 0], value: 9 }
    ]) as { a: number; list: number[] };
    const snapshot = structuredClone(first);

    const second = applyPatches(first, [
      { op: 'set', projection: 'view', path: ['a'], value: 3 },
      { op: 'set', projection: 'view', path: ['list', 1], value: 8 }
    ]);

    expect(second).not.toBe(first);
    expect(first).toEqual(snapshot);
  });

  it('agrees with applying the same patches one at a time', () => {
    const previous = { a: { list: [1, 2, 3], keep: { x: 1 } }, b: 'x', gone: true };
    const current = { a: { list: [0, 1, 2, 3, 4], keep: { x: 1 } }, b: 'y', added: { deep: [1] } };
    const patches = diffProjection('view', previous, current);

    const batched = applyPatches(previous, patches);
    let stepped: unknown = previous;
    for (const patch of patches) {
      stepped = applyPatch(stepped, patch);
    }

    expect(batched).toEqual(current);
    expect(batched).toEqual(stepped);
    // What the batch did not reach is still shared, not copied.
    expect((batched as typeof current).a.keep).toBe(previous.a.keep);
  });

  it('never writes into a value that arrived inside a patch', () => {
    // A devtools log replays the same patch objects, so a value a patch
    // carried is the patch's, even after the batch has placed it.
    const carried = { x: 1 };
    const patches: Patch[] = [
      { op: 'set', projection: 'view', path: ['a'], value: carried },
      { op: 'set', projection: 'view', path: ['a', 'y'], value: 2 }
    ];

    const next = applyPatches({}, patches) as { a: { x: number; y: number } };

    expect(next.a).toEqual({ x: 1, y: 2 });
    expect(carried).toEqual({ x: 1 });
  });
});
