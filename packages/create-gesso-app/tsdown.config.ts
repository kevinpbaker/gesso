import { defineConfig } from 'tsdown';

/**
 * The CLI is compiled, unlike everything else in `scripts/`, for one
 * reason: it is the first thing a stranger runs, and `node` only strips
 * types from a `.ts` file on 24 and later. Shipping the source as the
 * `bin` would mean `npm create gesso-app` failing with a syntax error
 * on Node 20 and 22, which is a first impression this project cannot
 * afford. The shebang comes through from the source file.
 *
 * `templates/` is not bundled. It is data the CLI copies, listed in
 * `files`, and resolved relative to the package root, which is one
 * level up from `dist/` exactly as it was from `bin/`.
 */
export default defineConfig({
  entry: ['bin/create-gesso-app.ts'],
  format: 'esm',
  platform: 'node',
  dts: false,
  sourcemap: true,
  clean: true
});
