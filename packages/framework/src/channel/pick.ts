import { distinctUntilChanged, map, type Observable } from 'rxjs';

/**
 * One key of a view model, as its own Observable, emitting only when
 * that key's value changes.
 *
 * `provide` and `serveChannels` want one Observable per view key, so
 * the differ can patch each key on its own, while a view model is most
 * naturally one Observable of one object. This is the seam between the
 * two, and every application worker was about to write it.
 */
export function pick<T, K extends keyof T>(source: Observable<T>, key: K): Observable<T[K]> {
  return source.pipe(
    map(value => value[key]),
    distinctUntilChanged()
  );
}

/**
 * Every key of a view model as its own Observable: the `view` a channel
 * source wants, from the one Observable a view model has.
 *
 *   serveChannels([{ token: Queue, source: { view: pickKeys(queue.view, QUEUE_KEYS), commands } }])
 */
export function pickKeys<T extends object, K extends keyof T>(
  source: Observable<T>,
  keys: readonly K[]
): { readonly [P in K]: Observable<T[P]> } {
  const out: Partial<{ [P in K]: Observable<T[P]> }> = {};
  for (const key of keys) {
    out[key] = pick(source, key);
  }
  return out as { readonly [P in K]: Observable<T[P]> };
}
