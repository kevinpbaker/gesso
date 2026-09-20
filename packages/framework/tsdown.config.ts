import { defineConfig } from 'tsdown';

/**
 * `src/testing.ts` is deliberately not an entry: it imports `vi` from
 * vitest, so bundling it would put a test runner in the published
 * package. It stays reachable from source for this workspace's own
 * suites, and the `gesso-testing` is what a consumer
 * will import instead.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/worker/index.ts', 'src/jsx/jsx-runtime.ts', 'src/jsx/jsx-dev-runtime.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  sourcemap: true,
  clean: true
});
