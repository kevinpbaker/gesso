/**
 * `@gesso/framework/testing` — the runtime harness the suites mount with.
 *
 * A second entry for the same reason `@gesso/core/testing` is one: this
 * module imports `vi` from vitest, so it must never be reachable from
 * the package's production entry, and a mount helper is not part of what
 * an application builds against.
 *
 * `@gesso/testing` (`ROADMAP.md` F7) is the library this becomes.
 */
export { mockCanvas, mountRuntime } from './app/RuntimeTestUtils';
export type { MockCanvas, MockContext, MountedRuntime, MountOptions } from './app/RuntimeTestUtils';
