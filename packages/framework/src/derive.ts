import { combineLatest, distinctUntilChanged, map, type Observable } from 'rxjs';

import { structurallyEqual } from './channel/structuralEquals';

/** How `derive` decides that a new value is not a change. */
export type Equality<T> = 'reference' | 'structural' | ((a: T, b: T) => boolean);

export interface DeriveOptions<T> {
  /**
   * `reference` (the default) is `Object.is`; `structural` compares
   * plain data by content, so a projection that builds a fresh object
   * of the same shape does not re-bind everything reading it; a
   * function is your own rule.
   */
  readonly equal?: Equality<T>;
}

type Values<S extends readonly Observable<unknown>[]> = {
  [K in keyof S]: S[K] extends Observable<infer V> ? V : never;
};

/**
 * One value from several, kept equal to `project` of the latest of each
 * source, and emitted only when it changes.
 *
 * This is `combineLatest(...).pipe(map(...), distinctUntilChanged())`,
 * which is what nearly every derived binding in a component body wants
 * and what nearly every one had to write out. Sources are cells or any
 * Observables; the result is what a prop takes.
 *
 *   const playing = derive([queue.view.playlistId, audio.state], (id, state) =>
 *     id === card.id && state.status === 'playing'
 *   );
 */
export function derive<S extends readonly Observable<unknown>[], T>(
  sources: readonly [...S],
  project: (...values: Values<S>) => T,
  options: DeriveOptions<T> = {}
): Observable<T> {
  const equal = equalityOf(options.equal ?? 'reference');
  return combineLatest(sources as unknown as Observable<unknown>[]).pipe(
    map(values => project(...(values as Values<S>))),
    distinctUntilChanged(equal)
  );
}

/** The comparison an `Equality` names. Shared with `computed`. */
export function equalityOf<T>(equal: Equality<T>): (a: T, b: T) => boolean {
  if (equal === 'reference') {
    return Object.is;
  }
  if (equal === 'structural') {
    return (a, b) => structurallyEqual(a, b);
  }
  return equal;
}
