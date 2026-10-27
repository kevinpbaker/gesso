/**
 * Errors a piece of work has said are its own, so the thread's error
 * handling leaves them to it.
 *
 * `renderFrame` draws a tree an agent wrote, in the thread that draws
 * the person's screen. When that tree throws from a subscription, the
 * error is uncaught in the thread, and the handlers that report the
 * thread's failures would put it over the person's screen: an agent's
 * draft, failing, in front of somebody using the application. The
 * frame cannot get ahead of those handlers, because on a global object
 * listeners run in the order they were added, capture or not. So the
 * handlers ask instead: each checks `isClaimedError` and leaves alone
 * what a frame claimed, and the frame reports it to the agent.
 *
 * The claims live under a `Symbol.for` key on the global object rather
 * than in this module, so `gesso-devtools`' overlay can honour them
 * without importing the framework.
 */

type Claim = (error: unknown) => boolean;

const KEY = Symbol.for('gesso.claimedErrors');

function claims(): Set<Claim> {
  const scope = globalThis as { [KEY]?: Set<Claim> };
  return (scope[KEY] ??= new Set());
}

/** Claims the errors `test` accepts until the returned function is called. */
export function claimErrors(test: Claim): () => void {
  claims().add(test);
  return () => claims().delete(test);
}

/** Whether some work in progress has claimed this error as its own. */
export function isClaimedError(error: unknown): boolean {
  for (const test of claims()) {
    if (test(error)) {
      return true;
    }
  }
  return false;
}
