import { describe, expect, it } from 'vitest';

import { UndoStack } from './UndoStack';

/**
 * Budgets for the undo stack (roadmap X13).
 *
 * The risk §5 of the roadmap names is sugar that hides cost, and the
 * shape it takes here is an undo stack that keeps every intermediate
 * value of a gesture. A drag across a list reports a crossing per row,
 * and a stack that pushed one entry per crossing would hold a hundred
 * closures over a hundred versions of the list by the time the pointer
 * came up. That is a leak with an undo button on it, and coalescing is
 * the whole of what stops it.
 *
 * So these assert counts, in the shape `LayoutEngine.budget.spec.ts`
 * set: how many entries are held, how many of the pushed functions can
 * still run, and how many times a bound cell changes. No timings.
 */

/** A run of `count` crossings of one row, as a real drag reports them. */
function drag(stack: UndoStack, count: number, label = 'Move'): { undone: number[]; redone: number[] } {
  const undone: number[] = [];
  const redone: number[] = [];
  for (let step = 1; step <= count; step++) {
    stack.push({
      label,
      coalesce: 'reorder:track-1',
      undo: () => undone.push(step - 1),
      redo: () => redone.push(step)
    });
  }
  return { undone, redone };
}

describe('UndoStack budgets', () => {
  it('holds one entry for a drag of five hundred crossings', () => {
    const stack = new UndoStack();

    drag(stack, 500);

    expect(stack.size).toBe(1);
    expect(stack.redoSize).toBe(0);
  });

  it('keeps only the first undo and the last redo of a run', () => {
    const stack = new UndoStack();

    const run = drag(stack, 500);
    stack.undo();
    stack.redo();

    // One call each, and the two ends of the run: the 498 pairs
    // between them are not held by anything and could not run if they
    // were.
    expect(run.undone).toEqual([0]);
    expect(run.redone).toEqual([500]);
  });

  it('changes the label cell once over a whole run', () => {
    const stack = new UndoStack();
    const seen: (string | null)[] = [];
    const following = stack.undoLabel.subscribe(label => seen.push(label));

    drag(stack, 500);
    following.unsubscribe();

    // The value on subscribing, and one change. A write per push would
    // be 501, and every menu bound to this would redraw as many times.
    expect(seen).toEqual([null, 'Move']);
  });

  it('never grows past its limit', () => {
    const stack = new UndoStack({ limit: 100 });

    for (let at = 0; at < 1000; at++) {
      stack.push({ label: `change ${at}`, undo: () => undefined, redo: () => undefined });
    }

    expect(stack.size).toBe(100);
    expect(stack.undoLabel.value).toBe('change 999');
  });

  it('runs one function per undo and per redo, whatever the run held', () => {
    const stack = new UndoStack();
    let calls = 0;

    for (let step = 0; step < 200; step++) {
      stack.push({ label: 'Type', coalesce: 'typing', undo: () => calls++, redo: () => calls++ });
    }
    stack.undo();
    stack.redo();
    stack.undo();

    expect(calls).toBe(3);
  });

  it('holds every step of a group, and one entry for it', () => {
    const stack = new UndoStack();
    let calls = 0;

    stack.transact('Tidy up', () => {
      for (let step = 0; step < 20; step++) {
        stack.push({ label: `step ${step}`, undo: () => calls++, redo: () => calls++ });
      }
    });
    // The counterpart of the coalescing budget, and the reason the two
    // are different features: a group means all of it, so all of it is
    // kept and all of it runs.
    expect(stack.size).toBe(1);

    stack.undo();

    expect(calls).toBe(20);
  });
});
