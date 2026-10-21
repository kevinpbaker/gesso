/**
 * "Still" mode for the documentation site: every live example holding a
 * frame, so a screenshot gate can photograph the pages.
 *
 * It is the playground's flag (`apps/playground/src/shell/still.ts`),
 * read the same two ways. In the page it is `?still` on the
 * documentation page's own url. A worker has no page url, so the two
 * components that mount an example, `LiveExample.vue` and
 * `ThreadDemo.vue`, give every worker they spawn the name `still` when
 * the flag is set, and code in a worker reads its own name. The two
 * readers agree because those components are the only places on this
 * site where a worker is made.
 *
 * What it freezes is decided by the example that moves: the ticker does
 * not start, a video is left holding its first frame. Nothing in the
 * framework knows about it, and an example branches on it only at the
 * point where the motion would have begun, so the code a page quotes is
 * still the code that runs.
 *
 * Two examples cannot be frozen from their own source, because their
 * motion belongs to a component rather than to the example: `spinner`,
 * and the indeterminate bar on `progressbar`. Both turn under reduced
 * motion by design, so a still of either is a
 * picture of something the library will not do.
 */
export const STILL = 'still';

/** A fixed instant for anything that would have read the clock. */
export const STILL_EPOCH = Date.UTC(2026, 8, 1, 12, 0, 0);

export function isStill(): boolean {
  if (typeof document === 'undefined') {
    // A worker: whoever spawned it names it.
    return ownName().includes(STILL);
  }
  try {
    return new URLSearchParams(location.search).has(STILL);
  } catch {
    return false;
  }
}

/**
 * The `name` to give a worker, so `isStill` reads the same in it.
 *
 * A live example's worker is also told which example to run, which
 * travels the same way and for the same reason: the name is the only
 * thing a page can hand a worker before it starts. The two are words
 * of the one name, the example first.
 */
export function workerName(example?: string): string | undefined {
  const words = [example, isStill() ? STILL : undefined].filter(word => word !== undefined);
  return words.length > 0 ? words.join(' ') : undefined;
}

/** In a live example's worker, the example `workerName` named. */
export function exampleOf(): string | undefined {
  const [first] = ownName();
  return first === undefined || first === STILL ? undefined : first;
}

/** A worker's own name, as the words `workerName` joined. */
function ownName(): string[] {
  const name = typeof self !== 'undefined' ? (self as { name?: string }).name : undefined;
  return name ? name.split(' ') : [];
}

/**
 * `Date.now()`, or the fixed instant when still.
 *
 * No example on this site shows a clock today, so nothing calls this
 * yet. It is here because the moment one does, the frozen reading has
 * to be the same one the playground's examples use, and that is a
 * decision better made once than rediscovered.
 */
export function stillNow(): number {
  return isStill() ? STILL_EPOCH : Date.now();
}
