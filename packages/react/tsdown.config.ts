import { defineConfig } from 'tsdown';

/**
 * One entry. React and the framework stay imports: the page that uses
 * this already has one React, and two would break every hook.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  sourcemap: true,
  clean: true,
  deps: { neverBundle: ['react', 'rxjs', /^gesso-framework/] }
});
