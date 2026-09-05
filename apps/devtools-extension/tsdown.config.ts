import { defineConfig } from 'tsdown';

/**
 * Four scripts and the static files beside them.
 *
 * The content script is a classic script (Chrome injects it with no
 * module wrapper), so it is an IIFE; the other three run as modules.
 * Everything is bundled in, `@gesso/*` and rxjs included: an extension
 * has no `node_modules` to resolve against at runtime.
 */
const shared = {
  platform: 'browser',
  dts: false,
  deps: { alwaysBundle: [/^@gesso\//, 'rxjs'] },
  outDir: 'dist'
} as const;

export default defineConfig([
  {
    ...shared,
    entry: { content: 'src/content.ts' },
    // tsdown names an IIFE `<name>.iife.js` whatever else is asked; the
    // manifest names the same file.
    format: 'iife',
    clean: true,
    // The glob rather than the directory: a directory is copied as
    // itself, and the manifest has to sit beside the scripts.
    copy: [{ from: 'public/*' }]
  },
  {
    ...shared,
    entry: { background: 'src/background.ts', devtools: 'src/devtools.ts', panel: 'src/panel.ts' },
    format: 'esm',
    clean: false
  }
]);
