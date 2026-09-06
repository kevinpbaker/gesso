import { defineConfig } from 'tsdown';

/**
 * One entry, and `vite` stays external: this package runs inside a
 * bundler rather than beside one, so the `Plugin` type it implements
 * has to be the host's own or a config would fail to typecheck against
 * it.
 *
 * `sourcemap` for the same reason every other package here sets it: a
 * stack frame inside a published package should name the line somebody
 * wrote. It matters least here and is set anyway, because the answer to
 * "which packages ship maps" should be "all of them".
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  external: ['vite'],
  sourcemap: true,
  clean: true
});
