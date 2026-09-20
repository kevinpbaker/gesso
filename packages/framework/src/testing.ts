/**
 * `gesso-framework/testing` — the runtime harness the suites mount with.
 *
 * A second entry for the same reason `gesso-core/testing` is one: this
 * module imports `vi` from vitest, so it must never be reachable from
 * the package's production entry, and a mount helper is not part of what
 * an application builds against.
 *
 * `gesso-testing` is the library this became — and this file stays
 * anyway, for one structural reason: `gesso-testing` depends on
 * `gesso-framework`, so the framework's own suite cannot depend on it
 * without a cycle. Everything *above* the framework — the component
 * library, an application — uses `gesso-testing`; the twelve specs in
 * here that drive a real runtime use this.
 */
export { mockCanvas, mountRuntime } from './app/RuntimeTestUtils';
export type { MockCanvas, MockContext, MountedRuntime, MountOptions } from './app/RuntimeTestUtils';
