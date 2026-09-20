/**
 * "Still" mode: the playground with nothing
 * moving, so the screenshot gate can cover the routes that never
 * otherwise reach a still frame.
 *
 * It is one flag, read two ways. In the page it is `?still` on the URL.
 * A worker has no page URL, so the routes give every worker they spawn
 * the name `still` when the flag is set, and code in a worker reads its
 * own name. The two readers agree because the routes are the only
 * place workers are made.
 *
 * What it freezes is decided by the code that moves: the tickers do not
 * start, the clocks read one fixed instant, the video stays on its
 * first frame. Nothing in the framework knows about it, and nothing in
 * an example route branches on it except at the point where the motion
 * would have begun.
 */
export const STILL = 'still';

/** A fixed instant for anything that would have read the clock. */
export const STILL_EPOCH = Date.UTC(2026, 8, 1, 12, 0, 0);

export function isStill(): boolean {
  if (typeof document === 'undefined') {
    // A worker: the routes name it.
    return typeof self !== 'undefined' && (self as { name?: string }).name === STILL;
  }
  try {
    return new URLSearchParams(location.search).has(STILL);
  } catch {
    return false;
  }
}

/** The `name` to give a worker, so `isStill` reads the same in it. */
export function workerName(): string | undefined {
  return isStill() ? STILL : undefined;
}

/** `Date.now()`, or the fixed instant when still. */
export function stillNow(): number {
  return isStill() ? STILL_EPOCH : Date.now();
}
