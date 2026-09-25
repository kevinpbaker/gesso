import type { FrameworkChild } from '../ComponentElement';
import type { ComponentType } from '../FunctionComponent';
import { GessoAppBuilder } from './GessoAppBuilder';

/**
 * Creates a Gesso application that runs on the calling thread.
 *
 *   createSyncApp(AppRoot).useChannel(Catalog, { source }).mountSync('#app');
 *
 * For tests, headless rendering, and environments without
 * `OffscreenCanvas`. Channels resolve in-process, so the same contract
 * runs with no ports.
 *
 * **It is a separate function from `createApp` for a reason that shows
 * up on the wire.** A single-thread application has to have the layout
 * engine, both renderers and the hit-tester on the thread it is
 * mounted from, and reaches them by importing them. A worker
 * application must not: its shell creates a canvas, forwards input and
 * holds neither. While one `createApp` served both, the reference to
 * this builder was in every shell's module graph whether or not it was
 * ever called, and a bundler cannot know that `createApp(options)` and
 * `createApp(root)` take different halves of the package — so every
 * worker application shipped the whole engine to the thread whose
 * entire point is not to run it. Measured on gessosheet's shell: 662.9
 * kB raw, 169.3 kB gzipped, against 196.6 kB and 49.5 kB for the same
 * shell reaching the worker configuration directly.
 *
 * Two names cost one line in a single-thread application and take 120
 * kB off the main thread of every other kind. `check-bundle-size.ts`
 * is what keeps it that way.
 */
export function createSyncApp(root: FrameworkChild | ComponentType): GessoAppBuilder {
  return new GessoAppBuilder(root);
}
