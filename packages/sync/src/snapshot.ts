import { findUnplainPath, internalState, type ReadableCell } from 'gesso-framework/worker';
import type * as Y from 'yjs';

/** A cell of plain data that follows a shared type, until it is disposed. */
export interface Snapshot<T> extends ReadableCell<T> {
  /** Stops following the type. The cell keeps its last value. */
  dispose(): void;
}

export interface SnapshotOptions {
  /**
   * Checks every value for something that cannot cross the barrier.
   * On by default. The data came from other people's edits, so a value
   * that was plain at the first emission can stop being plain later, which
   * is why this is not a check of the first value only, as `provide`
   * makes.
   */
  readonly check?: boolean;
  /** What to call the snapshot in an error. */
  readonly label?: string;
}

/**
 * Projects a shared type to plain data, as a cell a channel can serve.
 *
 *   rows: snapshot(doc.getArray<Y.Map<unknown>>('tasks'), tasks => tasks.toJSON() as TaskRow[])
 *
 * The Yjs types never cross the barrier; this is where they become
 * arrays and records. It projects again once per transaction that
 * touches the type, however many changes that transaction made, and the
 * channel's differ turns the new value into small patches. Without a
 * projection, the type's own `toJSON()` is the value.
 *
 * The projection reads the whole type, so a large type that changes
 * often costs a pass over all of it per change. Granularity is the
 * knob here as on any channel: one snapshot per thing that changes for
 * its own reasons, not one per document.
 *
 * A value that is not plain data (a `Uint8Array` someone put in a map,
 * say) ends the cell with an error naming the path, which `provide`
 * reports as a channel error. A rich value is a design mistake, not
 * data to route around.
 */
// A shared type of any event type: `Y.Array<string>` is not a `Y.AbstractType<unknown>`,
// because the event handlers are invariant in the event type.
// oxlint-disable-next-line no-explicit-any
export function snapshot<S extends Y.AbstractType<any>, T = ReturnType<S['toJSON']>>(
  type: S,
  project?: (type: S) => T,
  options: SnapshotOptions = {}
): Snapshot<T> {
  const read = (): T => (project === undefined ? (type.toJSON() as T) : project(type));
  const check = options.check ?? true;
  const label = options.label ?? 'snapshot';
  const cell = internalState<T>(read(), label);
  let stopped = false;

  const verify = (value: T): boolean => {
    if (!check) {
      return true;
    }
    const path = findUnplainPath(value);
    if (path === null) {
      return true;
    }
    stopped = true;
    type.unobserveDeep(follow);
    cell.error(
      new Error(
        `${label}: the value at "${path === '' ? '(root)' : path}" is not plain data and cannot cross to the view. ` +
          'Project it to arrays, plain objects and primitives.'
      )
    );
    return false;
  };

  const follow = (): void => {
    if (stopped) {
      return;
    }
    const value = read();
    if (verify(value)) {
      cell.next(value);
    }
  };

  verify(cell.getValue());
  if (!stopped) {
    type.observeDeep(follow);
  }

  return Object.assign(cell as ReadableCell<T>, {
    dispose(): void {
      if (!stopped) {
        stopped = true;
        type.unobserveDeep(follow);
      }
    }
  });
}
