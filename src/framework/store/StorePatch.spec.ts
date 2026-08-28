import { describe, expect, it } from 'vitest';

import { applyPatches, diffProjection, type Patch } from './StorePatch';
import { structurallyEqual } from './structuralEquals';

function roundTrip(previous: unknown, current: unknown): { patches: Patch[]; result: unknown } {
  const patches = diffProjection('view', previous, current);
  return { patches, result: applyPatches(previous, patches) };
}

/** Every diff must reconstruct the target exactly. */
function expectRoundTrip(previous: unknown, current: unknown): Patch[] {
  const { patches, result } = roundTrip(previous, current);
  expect(result).toEqual(current);
  return patches;
}

describe('diffProjection', () => {
  it('emits nothing when the value is unchanged', () => {
    expect(diffProjection('view', { a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toEqual([]);
  });

  it('patches only the field that changed', () => {
    const patches = expectRoundTrip(
      { counts: { total: 3, completed: 1 }, filter: 'all' },
      { counts: { total: 3, completed: 2 }, filter: 'all' }
    );

    expect(patches).toEqual([{ op: 'set', projection: 'view', path: ['counts', 'completed'], value: 2 }]);
  });

  it('adds and removes object keys', () => {
    const patches = expectRoundTrip({ a: 1, gone: true }, { a: 1, added: 'x' });

    expect(patches).toHaveLength(2);
    expect(patches).toContainEqual({ op: 'set', projection: 'view', path: ['added'], value: 'x' });
    expect(patches).toContainEqual({ op: 'delete', projection: 'view', path: ['gone'] });
  });

  it('appends to an array with a single splice', () => {
    const patches = expectRoundTrip({ items: ['a', 'b'] }, { items: ['a', 'b', 'c'] });

    expect(patches).toEqual([
      { op: 'splice', projection: 'view', path: ['items'], index: 2, deleteCount: 0, items: ['c'] }
    ]);
  });

  it('prepends to an array with a single splice', () => {
    const patches = expectRoundTrip({ items: ['b', 'c'] }, { items: ['a', 'b', 'c'] });

    expect(patches).toEqual([
      { op: 'splice', projection: 'view', path: ['items'], index: 0, deleteCount: 0, items: ['a'] }
    ]);
  });

  it('removes from the middle of an array with a single splice', () => {
    const patches = expectRoundTrip({ items: ['a', 'b', 'c'] }, { items: ['a', 'c'] });

    expect(patches).toEqual([
      { op: 'splice', projection: 'view', path: ['items'], index: 1, deleteCount: 1, items: [] }
    ]);
  });

  it('edits an array element in place without resending the element', () => {
    // The list keeps its length, so the change is addressed at the one
    // field that moved rather than replacing the row.
    const patches = expectRoundTrip(
      {
        todos: [
          { id: 'a', done: false },
          { id: 'b', done: false }
        ]
      },
      {
        todos: [
          { id: 'a', done: false },
          { id: 'b', done: true }
        ]
      }
    );

    expect(patches).toEqual([{ op: 'set', projection: 'view', path: ['todos', 1, 'done'], value: true }]);
  });

  it('round-trips a reordered list', () => {
    expectRoundTrip({ items: ['a', 'b', 'c'] }, { items: ['c', 'b', 'a'] });
  });

  it('round-trips replacing a value with a different type', () => {
    expectRoundTrip({ value: { nested: 1 } }, { value: 'now a string' });
    expectRoundTrip({ value: [1, 2, 3] }, { value: null });
    expectRoundTrip({ value: null }, { value: [1, 2, 3] });
  });

  it('round-trips a whole-root replacement', () => {
    expectRoundTrip({ a: 1 }, 'scalar');
    expectRoundTrip('scalar', { a: 1 });
    expectRoundTrip(undefined, { a: 1, b: [1, { c: 2 }] });
  });

  it('round-trips deeply nested changes', () => {
    expectRoundTrip({ a: { b: { c: { d: [1, 2, { e: 'x' }] } } } }, { a: { b: { c: { d: [1, 2, { e: 'y' }] } } } });
  });

  it('round-trips a realistic sequence of store mutations', () => {
    const steps: unknown[] = [
      { visible: [], counts: { total: 0, completed: 0 } },
      { visible: [{ id: '1', text: 'a', done: false }], counts: { total: 1, completed: 0 } },
      {
        visible: [
          { id: '1', text: 'a', done: false },
          { id: '2', text: 'b', done: false }
        ],
        counts: { total: 2, completed: 0 }
      },
      {
        visible: [
          { id: '1', text: 'a', done: true },
          { id: '2', text: 'b', done: false }
        ],
        counts: { total: 2, completed: 1 }
      },
      { visible: [{ id: '2', text: 'b', done: false }], counts: { total: 1, completed: 0 } },
      { visible: [], counts: { total: 0, completed: 0 } }
    ];

    // A replica only ever sees patches, so replaying the whole sequence
    // through them must land on exactly the authoritative value.
    let replica: unknown = undefined;
    for (let i = 0; i < steps.length; i++) {
      const previous = i === 0 ? undefined : steps[i - 1];
      replica = applyPatches(replica, diffProjection('view', previous, steps[i]));
      expect(replica).toEqual(steps[i]);
    }
  });

  it('shares structure with the previous value where nothing changed', () => {
    const previous = { untouched: { deep: [1, 2, 3] }, counter: 1 };
    const current = { untouched: previous.untouched, counter: 2 };

    const result = applyPatches(previous, diffProjection('view', previous, current)) as typeof previous;

    expect(result).not.toBe(previous);
    // The unchanged branch is reused rather than rebuilt, so bindings
    // watching it are not disturbed.
    expect(result.untouched).toBe(previous.untouched);
  });

  it('does not mutate the value it patches', () => {
    const previous = { items: ['a'], counts: { total: 1 } };
    const snapshot = structuredClone(previous);

    applyPatches(previous, diffProjection('view', previous, { items: ['a', 'b'], counts: { total: 2 } }));

    // Components hold emitted values; patching in place would rewrite
    // data already rendered.
    expect(previous).toEqual(snapshot);
  });

  it('agrees with structural equality on the round-tripped result', () => {
    const previous = { a: [1, { b: 2 }], c: 'x' };
    const current = { a: [1, { b: 3 }], c: 'x' };

    const result = applyPatches(previous, diffProjection('view', previous, current));

    expect(structurallyEqual(result, current)).toBe(true);
  });
});
