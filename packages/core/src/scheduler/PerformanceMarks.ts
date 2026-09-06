/**
 * Gesso's work, in the browser's own profiler
 * (`EXCELLENCE_ROADMAP.md` X15).
 *
 * A performance recording of a Gesso application shows one long task
 * per frame and nothing inside it, because everything the framework
 * does happens under callbacks the browser cannot name. `performance
 * .measure` is the one way to put a name on a span that the DevTools
 * Performance panel, `PerformanceObserver` and a real-user monitor all
 * already read, so this is what the framework emits rather than a
 * timeline of its own.
 *
 * **It is off until something asks.** A production application that
 * never turns it on takes one boolean read per span and nothing else:
 * no clock reading, no string, no entry retained. That is the whole
 * reason the switch is a module-level flag rather than an option on
 * the scheduler — a span has to be able to ask "is anyone recording"
 * before it pays for the timestamp that would answer.
 *
 * It can be turned on in production, which is the point. Either call
 * `setPerformanceMarks(true)`, or set `globalThis.__GESSO_PERF__` to
 * true before the framework's first import: a page can then be
 * profiled as it shipped, with no development build and no devtools
 * attached.
 */

/** Every measure this module emits starts with this, so a filter finds them all. */
export const MARK_PREFIX = 'gesso';

/**
 * Read once, at module scope: a page that wants marks in a production
 * build sets the flag before the framework loads, and pays nothing for
 * the check afterwards.
 */
let recording = readInitialFlag();

/** Whether `performance.measure` exists at all; a worker without it must not throw. */
const supported =
  typeof performance !== 'undefined' &&
  typeof performance.measure === 'function' &&
  typeof performance.now === 'function';

function readInitialFlag(): boolean {
  return (globalThis as { __GESSO_PERF__?: unknown }).__GESSO_PERF__ === true;
}

/**
 * Turns the marks on or off.
 *
 * A devtools panel calls this; so may an application that wants a
 * profile of one interaction and nothing else.
 */
export function setPerformanceMarks(enabled: boolean): void {
  recording = enabled;
}

/**
 * Whether spans are being recorded.
 *
 * Call it before doing any work a span needs, including reading the
 * clock. This is the check that keeps the cost at zero when nobody is
 * listening.
 */
export function performanceMarksEnabled(): boolean {
  return recording && supported;
}

/**
 * A span between two `performance.now()` readings the caller already
 * took, named `gesso <what>`.
 *
 * Times are passed in rather than taken here because the caller is
 * timing the work anyway: the scheduler's frame span and the frame's
 * own duration must be the same two readings, or a profile and a
 * `FrameMetrics` would disagree about the same frame.
 *
 * `detail` rides along for the panels that show it (Chrome puts it on
 * the entry's tooltip) and costs nothing when marks are off, because
 * this is not called then.
 */
export function measureSpan(what: string, start: number, end: number, detail?: unknown): void {
  if (!recording || !supported) {
    return;
  }
  try {
    performance.measure(`${MARK_PREFIX} ${what}`, { start, end, ...(detail === undefined ? {} : { detail }) });
  } catch {
    // A measure can throw on a start time the browser has dropped from
    // its buffer. Instrumentation must never be the thing that breaks
    // the frame it is describing.
  }
}

/**
 * A point in time, named `gesso <what>`.
 *
 * For things with no duration: a command crossing the barrier, a patch
 * batch arriving. They land in the same track as the spans, so a
 * command and the frame that answered it are read off one timeline.
 */
export function markInstant(what: string, detail?: unknown): void {
  if (!recording || !supported || typeof performance.mark !== 'function') {
    return;
  }
  try {
    performance.mark(`${MARK_PREFIX} ${what}`, detail === undefined ? undefined : { detail });
  } catch {
    // As above: never throw out of instrumentation.
  }
}

/** `performance.now()`, or the epoch clock where there is no `performance`. */
export function markNow(): number {
  return supported ? performance.now() : Date.now();
}
