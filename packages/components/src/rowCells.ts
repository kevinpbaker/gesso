import { Observable } from 'rxjs';

import { fanOut, type FanKey } from 'gesso-framework';
import type { UiSemanticState } from 'gesso-core';

/**
 * A row's `states`, shared rather than built per emission.
 *
 * One array for every selected row and one for every other, so a row
 * that did not change hands the graph the same object and its equality
 * test ends the write there. Nothing downstream mutates a node's
 * `states`: the semantics record copies them to normalise the order.
 */
export const SELECTED_STATES: readonly UiSemanticState[] = ['selected'];
export const NO_STATES: readonly UiSemanticState[] = [];

/**
 * One value per row, out of one source, telling only the rows it changed.
 *
 * A list's selection is one value and every visible row reads its own
 * slice of it: "am I the chosen one". Spelled as a pipe per row, an
 * arrow key runs every row's pipes and writes every row's properties to
 * move a highlight between two of them. This is `fanOut` with the
 * `changed` hint a selection can always give, the old key and the new
 * one, so a move costs those two rows whatever is on screen.
 *
 * **The registry lets a row go when its bindings do.** A lazy list has
 * no hook for a row leaving the window, but the graph unsubscribes a
 * departing row's bound properties, so each row's cell is counted by
 * its subscribers and released at the last. A row scrolled back in is
 * asked for again, which is one map entry and one read.
 */
export function rowCells<S, V>(
  source: Observable<S>,
  read: (snapshot: S, key: FanKey) => V,
  options: {
    readonly initial: V;
    readonly changed: (next: S, previous: S | undefined) => Iterable<FanKey> | undefined;
    readonly label: string;
  }
): (key: FanKey) => Observable<V> {
  const cells = fanOut<S, V>(source, (snapshot, key) => read(snapshot, key), options);
  const followers = new Map<FanKey, number>();
  return key =>
    new Observable<V>(subscriber => {
      followers.set(key, (followers.get(key) ?? 0) + 1);
      const subscription = cells.for(key).subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        const left = (followers.get(key) ?? 1) - 1;
        if (left > 0) {
          followers.set(key, left);
          return;
        }
        followers.delete(key);
        cells.release(key);
      };
    });
}

/** The keys a move from one value to another touched, for `rowCells`' `changed`. */
export function movedBetween(next: FanKey | null, previous: FanKey | null | undefined): FanKey[] | undefined {
  if (previous === undefined) {
    return undefined;
  }
  return [previous, next].filter((key): key is FanKey => key !== null);
}
