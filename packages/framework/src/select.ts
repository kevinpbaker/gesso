import type { Observable } from 'rxjs';

import { computed, type ComputedCell } from './computed';
import type { Equality } from './derive';

export interface SelectOptions<T> {
  /**
   * How a projected value is judged unchanged; `structural` by default,
   * because a projection nearly always builds a value rather than
   * passing one through, and a rebuilt equal one is not a change.
   */
  readonly equal?: Equality<T>;
  /** What to call the cell in a warning. */
  readonly label?: string;
}

/**
 * One field of a cell, or one projection of it, as a cell.
 *
 *   const title = select(inputs.track, 'title');
 *   const names = select(inputs.track, entry => entry?.tags ?? []);
 *
 * Reading four fields of one input costs four of these rather than four
 * `pipe(map(...), distinctUntilChanged(...))`, which is what the two
 * applications wrote by hand often enough to invent their own `field()`
 * and `text()` helpers for it.
 *
 * The source may be any Observable, not only a cell: `select` is a
 * `computed` over one source, and reads it the way a computed reads
 * anything. The comparison is structural by default, since the reason
 * for nearly every hand-written comparator is exactly this: a
 * projection that rebuilds an equal array or object each time should
 * not re-bind everything reading it.
 *
 * There is no `inputs.track.title` proxy. A cell is an Observable, so
 * its own members (`value`, `pipe`, `subscribe`, `source`) would shadow
 * the fields of anything projected through it, and a data type that
 * happens to have a field called `value` would read as the cell's
 * current value instead. `select` names the field explicitly and cannot
 * collide.
 */
export function select<T extends object, K extends keyof T>(
  source: Observable<T>,
  key: K,
  options?: SelectOptions<T[K]>
): ComputedCell<T[K]>;
export function select<T, R>(
  source: Observable<T>,
  project: (value: T) => R,
  options?: SelectOptions<R>
): ComputedCell<R>;
export function select(
  source: Observable<unknown>,
  keyOrProject: PropertyKey | ((value: unknown) => unknown),
  options: SelectOptions<unknown> = {}
): ComputedCell<unknown> {
  const project =
    typeof keyOrProject === 'function'
      ? keyOrProject
      : // A stream that has not spoken yet has no value to read a field
        // off, and neither has a source that is legitimately null. Both
        // answer `undefined` rather than throwing on the first frame.
        (value: unknown) =>
          value === null || value === undefined ? undefined : (value as Record<PropertyKey, unknown>)[keyOrProject];
  return computed(read => project(read(source)), {
    equal: options.equal ?? 'structural',
    ...(options.label === undefined ? {} : { label: options.label })
  });
}
