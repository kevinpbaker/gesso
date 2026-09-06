import { describe, expect, it } from 'vitest';

import { UndoStack } from './UndoStack';

/**
 * A world of one number, so an entry's undo and redo are absolute
 * moves and the spec reads as what a person would see.
 */
function counter(): { at: () => number; move: (to: number) => void } {
  let value = 0;
  return { at: () => value, move: to => (value = to) };
}

describe('UndoStack', () => {
  it('undoes and redoes one change', () => {
    const stack = new UndoStack();
    const world = counter();

    world.move(1);
    stack.push({ label: 'Move to 1', undo: () => world.move(0), redo: () => world.move(1) });

    expect(stack.canUndo.value).toBe(true);
    expect(stack.undoLabel.value).toBe('Move to 1');
    expect(stack.undo()).toBe(true);
    expect(world.at()).toBe(0);
    expect(stack.canUndo.value).toBe(false);
    expect(stack.redoLabel.value).toBe('Move to 1');
    expect(stack.redo()).toBe(true);
    expect(world.at()).toBe(1);
  });

  it('answers false with nothing to undo or redo', () => {
    const stack = new UndoStack();

    expect(stack.undo()).toBe(false);
    expect(stack.redo()).toBe(false);
    expect(stack.undoLabel.value).toBeNull();
  });

  it('drops the redo branch when a new change is made', () => {
    const stack = new UndoStack();
    const world = counter();

    stack.push({ label: 'one', undo: () => world.move(0), redo: () => world.move(1) });
    stack.undo();
    expect(stack.canRedo.value).toBe(true);

    stack.push({ label: 'two', undo: () => world.move(0), redo: () => world.move(2) });

    expect(stack.canRedo.value).toBe(false);
    expect(stack.redoSize).toBe(0);
  });

  it('coalesces a run into the first undo and the last redo', () => {
    const stack = new UndoStack();
    const world = counter();

    for (let to = 1; to <= 4; to++) {
      const from = to - 1;
      world.move(to);
      stack.push({
        label: `Move to ${to}`,
        coalesce: 'drag',
        undo: () => world.move(from),
        redo: () => world.move(to)
      });
    }

    expect(stack.size).toBe(1);
    expect(stack.undoLabel.value).toBe('Move to 4');
    stack.undo();
    // Back to where the run began, not one step of it.
    expect(world.at()).toBe(0);
    stack.redo();
    expect(world.at()).toBe(4);
  });

  it('starts a new entry after endRun, so two gestures are two undos', () => {
    const stack = new UndoStack();
    const world = counter();

    world.move(1);
    stack.push({ label: 'first', coalesce: 'drag', undo: () => world.move(0), redo: () => world.move(1) });
    stack.endRun();
    world.move(2);
    stack.push({ label: 'second', coalesce: 'drag', undo: () => world.move(1), redo: () => world.move(2) });

    expect(stack.size).toBe(2);
    stack.undo();
    expect(world.at()).toBe(1);
    stack.undo();
    expect(world.at()).toBe(0);
  });

  it('does not coalesce across an undo', () => {
    const stack = new UndoStack();
    const world = counter();

    stack.push({ label: 'first', coalesce: 'drag', undo: () => world.move(0), redo: () => world.move(1) });
    stack.undo();
    stack.push({ label: 'second', coalesce: 'drag', undo: () => world.move(0), redo: () => world.move(5) });

    expect(stack.size).toBe(1);
    expect(stack.undoLabel.value).toBe('second');
  });

  it('groups what a transaction pushes into one entry', () => {
    const stack = new UndoStack();
    const done: string[] = [];

    stack.transact('Tidy up', () => {
      stack.push({ label: 'a', undo: () => done.push('undo a'), redo: () => done.push('redo a') });
      stack.push({ label: 'b', undo: () => done.push('undo b'), redo: () => done.push('redo b') });
    });

    expect(stack.size).toBe(1);
    expect(stack.undoLabel.value).toBe('Tidy up');
    stack.undo();
    // Reverse order: the last thing done is the first thing undone.
    expect(done).toEqual(['undo b', 'undo a']);
    stack.redo();
    expect(done).toEqual(['undo b', 'undo a', 'redo a', 'redo b']);
  });

  it('records nothing for a transaction that pushed nothing', () => {
    const stack = new UndoStack();

    stack.transact('Nothing happened', () => undefined);

    expect(stack.size).toBe(0);
  });

  it('ignores a push made while an undo is running', () => {
    const stack = new UndoStack();
    const world = counter();

    stack.push({
      label: 'one',
      undo: () => {
        world.move(0);
        // An application whose edit path records itself; without the
        // guard this is an entry that can never be got past.
        stack.push({ label: 'recorded by the undo', undo: () => undefined, redo: () => undefined });
      },
      redo: () => world.move(1)
    });
    stack.undo();

    expect(stack.size).toBe(0);
    expect(stack.canRedo.value).toBe(true);
  });

  it('keeps only the last `limit` entries', () => {
    const stack = new UndoStack({ limit: 3 });

    for (let at = 0; at < 10; at++) {
      stack.push({ label: `change ${at}`, undo: () => undefined, redo: () => undefined });
    }

    expect(stack.size).toBe(3);
    expect(stack.undoLabel.value).toBe('change 9');
  });

  it('forgets both directions when cleared', () => {
    const stack = new UndoStack();

    stack.push({ label: 'one', undo: () => undefined, redo: () => undefined });
    stack.undo();
    stack.push({ label: 'two', undo: () => undefined, redo: () => undefined });
    stack.clear();

    expect(stack.size).toBe(0);
    expect(stack.redoSize).toBe(0);
    expect(stack.canUndo.value).toBe(false);
    expect(stack.canRedo.value).toBe(false);
  });

  it('publishes the labels as cells a menu can follow', () => {
    const stack = new UndoStack();
    const seen: (string | null)[] = [];
    const following = stack.undoLabel.subscribe(label => seen.push(label));

    stack.push({ label: 'Move Sunset', undo: () => undefined, redo: () => undefined });
    stack.undo();
    following.unsubscribe();

    expect(seen).toEqual([null, 'Move Sunset', null]);
  });
});
