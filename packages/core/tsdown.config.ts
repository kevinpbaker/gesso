import { defineConfig } from 'tsdown';

/**
 * `sourcemap` here and in every other package's config, for one reason
 * that is easy to miss: `@gesso/devtools`'s error overlay decodes the
 * maps of the scripts a stack names, and a package that ships none
 * turns every frame inside it into a bundled line and column. An
 * application author reading a stack should see the file somebody
 * wrote, whichever package it is in. See `decisions/0082`.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/testing.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  sourcemap: true,
  clean: true
});
