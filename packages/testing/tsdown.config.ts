import { defineConfig } from 'tsdown';

/**
 * Two entries, and the split between them is the point of the package.
 *
 * `src/index.ts` imports no test runner at all, so `renderTest` works
 * under vitest, under node:test, or in a script. `src/matchers.ts` is
 * the only module that reaches for `expect`, and it is a separate entry
 * so that reaching for it is a decision a consumer makes rather than
 * something the root barrel does behind their back.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/matchers.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  clean: true
});
