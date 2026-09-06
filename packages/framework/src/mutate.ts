import { equalityOf, type Equality } from './derive';
import type { ReadableCell } from './Input';
import { internalState, type InternalState } from './InternalState';

export interface MutateOptions<T> {
  /**
   * How the rollback decides the cell still holds what was applied;
   * `structural` by default, because an optimistic change nearly
   * always builds a new list or a new record rather than passing one
   * through, so identity would never match and nothing would ever roll
   * back.
   */
  readonly equal?: Equality<T>;
  /** What to call the in-flight count in a warning; optional. */
  readonly label?: string;
}

/** A change that is made locally at once and confirmed afterwards. */
export interface Mutation<A> {
  /**
   * How many writes are in the air, for a saving indicator.
   *
   * A count rather than a flag, because two presses in quick
   * succession are two writes and a flag cleared by the first would
   * say the second had finished.
   */
  readonly pending: ReadableCell<number>;
  /**
   * Applies the change, commits it, and puts it back if the commit
   * refuses. Answers whether it stuck.
   */
  run(argument: A): Promise<boolean>;
}

/**
 * An optimistic change to a cell, with a rollback that does not fight
 * the person.
 *
 *   private readonly favourites = internalState<readonly string[]>([]);
 *   private readonly like = mutate(this.favourites, toggled, id => api.favourite(id));
 *
 *   toggle(id: string): void {
 *     void this.like.run(id);
 *   }
 *
 * Three things happen and the order is the whole point. `apply` runs
 * first and writes the cell, so the screen changes on the press rather
 * than a round trip later. `commit` then does the real write. If it
 * rejects, or resolves `false`, the cell goes back to what it held
 * before.
 *
 * **The rollback is guarded.** It happens only while the cell still
 * holds exactly what `apply` wrote. Without that, a slow rejection
 * would fight a fast second press and the cell would end up saying the
 * opposite of the last thing anyone did, which is the guard every
 * optimistic screen writes by hand and half of them get wrong.
 *
 * The cell is named first, and not because the roadmap wrote
 * `mutate(apply, commit)`: the cell is what makes the guard possible.
 * A mutation handed only two functions can undo its own change but
 * cannot tell whether undoing it is still the right thing to do.
 *
 * A helper and not a data layer: nothing in the framework requires
 * one, and an application that would rather write the four lines out
 * is writing the same four lines this does.
 */
export function mutate<T, A = void>(
  cell: InternalState<T>,
  apply: (current: T, argument: A) => T,
  commit: (argument: A, applied: T) => Promise<unknown>,
  options: MutateOptions<T> = {}
): Mutation<A> {
  const equal = equalityOf<T>(options.equal ?? 'structural');
  const inFlight = internalState(0, options.label);

  const revert = (before: T, applied: T): void => {
    if (!equal(cell.value, applied)) {
      // Changed again since, by whoever is using the screen. Their
      // change is newer than this answer and wins.
      return;
    }
    cell.value = before;
  };

  return {
    pending: inFlight,
    async run(argument: A): Promise<boolean> {
      const before = cell.value;
      const applied = apply(before, argument);
      cell.value = applied;
      inFlight.value = inFlight.value + 1;
      try {
        // `false` and a rejection mean the same thing: the write did
        // not happen. Anything else, `undefined` included, is a
        // commit that went through.
        if ((await commit(argument, applied)) === false) {
          revert(before, applied);
          return false;
        }
        return true;
      } catch {
        revert(before, applied);
        return false;
      } finally {
        inFlight.value = Math.max(0, inFlight.value - 1);
      }
    }
  };
}
