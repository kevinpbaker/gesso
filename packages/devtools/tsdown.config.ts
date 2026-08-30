import { defineConfig } from 'tsdown';

/**
 * One entry. Unlike `@gesso/testing`, nothing here reaches for a test
 * runner, so there is no second surface to keep out of the first.
 *
 * `platform: 'neutral'` for the same reason the other packages use it:
 * the DOM types this package needs come from the `lib`, not from a
 * platform preset that would pull node globals in with them.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  clean: true
});
