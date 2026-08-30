/**
 * `@gesso/core/testing` — the test doubles.
 *
 * A second entry rather than part of the root barrel, because a fake
 * canvas and a fake event target are not part of what an application
 * builds against: putting them in `@gesso/core` would ship them in
 * every consumer's public surface and in the API report, where a change
 * to a test double would read as a change to the framework.
 *
 * This is the seam `@gesso/testing` builds `renderTest()` on: the
 * recording context and the canvas host it mounts over come from here,
 * which is why neither of them may ever import a test runner.
 */
export { InputTestHarness, FakeEventTarget, FakePlatformSurface } from './input/UiInputTestUtils';
export {
  callArgs,
  callNames,
  callsOf,
  FakeCanvasHost,
  RecordingCanvasContext,
  RenderHarness,
  savedDepth
} from './rendering/RenderTestUtils';
export type { RecordedCall } from './rendering/RenderTestUtils';
