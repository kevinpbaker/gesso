import type { Mutation } from '../mutate';
import type { UndoStack } from './UndoStack';

export interface UndoableOptions<A> {
  /** What the entry is called, from the argument that made it. */
  readonly label: string | ((argument: A) => string);
  /** The coalescing key, from the argument; see `UndoTransaction.coalesce`. */
  readonly coalesce?: string | ((argument: A) => string);
}

/**
 * Puts a `mutate` on an undo stack, by way of its own inverse.
 *
 *   private readonly liked = internalState<readonly string[]>([]);
 *   private readonly like = mutate(this.liked, toggled, id => api.favourite(id));
 *   readonly toggleLike = undoable(undo, this.like, id => id, { label: () => 'Like' });
 *
 * The whole of it is that undoing an optimistic change is another
 * optimistic change. Nothing here writes the cell behind the
 * mutation's back, which is the thing that would go wrong if an undo
 * stack held values rather than operations: it would restore a value
 * the server has not been told about, and the next rollback would
 * fight it.
 *
 * `invert` answers the argument that undoes this one. For a toggle
 * that is the same argument again, which is why the example above
 * looks like it does nothing.
 *
 * **A refused write is not on the stack.** `mutate` already puts the
 * cell back when a commit rejects or resolves `false`, so the change
 * did not happen and there is nothing to undo; pushing it would give a
 * person an undo that undoes something they never saw.
 *
 * The undo and the redo call `mutation.run` rather than this wrapper,
 * so running them records nothing and the stack's reentrancy guard
 * never has to fire.
 */
export function undoable<A>(
  stack: UndoStack,
  mutation: Mutation<A>,
  invert: (argument: A) => A,
  options: UndoableOptions<A>
): (argument: A) => Promise<boolean> {
  const { label, coalesce } = options;
  return async (argument: A): Promise<boolean> => {
    if (!(await mutation.run(argument))) {
      return false;
    }
    stack.push({
      label: typeof label === 'function' ? label(argument) : label,
      undo: () => void mutation.run(invert(argument)),
      redo: () => void mutation.run(argument),
      ...(coalesce === undefined ? {} : { coalesce: typeof coalesce === 'function' ? coalesce(argument) : coalesce })
    });
    return true;
  };
}
