import { describe, expect, it } from 'vitest';

import { internalState } from '../InternalState';
import { mutate } from '../mutate';
import { undoable } from './undoable';
import { UndoStack } from './UndoStack';

function toggled(list: readonly string[], id: string): readonly string[] {
  return list.includes(id) ? list.filter(entry => entry !== id) : [...list, id];
}

describe('undoable', () => {
  it('undoes an optimistic change by running the mutation again', async () => {
    const stack = new UndoStack();
    const liked = internalState<readonly string[]>([]);
    const written: (readonly string[])[] = [];
    const like = mutate(liked, toggled, (_id: string, applied) => {
      written.push(applied);
      return Promise.resolve(true);
    });
    const toggle = undoable(stack, like, id => id, { label: id => `Like ${id}` });

    await toggle('a');
    expect(liked.value).toEqual(['a']);
    expect(stack.undoLabel.value).toBe('Like a');

    stack.undo();
    await Promise.resolve();
    await Promise.resolve();

    expect(liked.value).toEqual([]);
    // Three writes: the change, and the undo, and nothing else. The
    // undo is a write and not a local edit, which is the point of
    // composing with the mutation rather than setting the cell.
    expect(written).toEqual([['a'], []]);
  });

  it('records nothing when the commit refuses', async () => {
    const stack = new UndoStack();
    const liked = internalState<readonly string[]>([]);
    const like = mutate(liked, toggled, () => Promise.resolve(false));
    const toggle = undoable(stack, like, id => id, { label: 'Like' });

    expect(await toggle('a')).toBe(false);

    // The cell is back where it was, so there is nothing to undo, and
    // an entry here would offer to unmake something nobody saw.
    expect(liked.value).toEqual([]);
    expect(stack.size).toBe(0);
  });

  it('does not record the undo it runs', async () => {
    const stack = new UndoStack();
    const liked = internalState<readonly string[]>([]);
    const like = mutate(liked, toggled, () => Promise.resolve(true));
    const toggle = undoable(stack, like, id => id, { label: 'Like' });

    await toggle('a');
    stack.undo();
    await Promise.resolve();
    await Promise.resolve();

    expect(stack.size).toBe(0);
    expect(stack.canRedo.value).toBe(true);
  });

  it('coalesces by a key taken from the argument', async () => {
    const stack = new UndoStack();
    const size = internalState(0);
    const grow = mutate(
      size,
      (_current: number, to: number) => to,
      () => Promise.resolve(true)
    );
    const resize = undoable(stack, grow, () => 0, { label: 'Resize', coalesce: () => 'resize' });

    await resize(10);
    await resize(20);
    await resize(30);

    expect(stack.size).toBe(1);
    expect(size.value).toBe(30);
  });
});
