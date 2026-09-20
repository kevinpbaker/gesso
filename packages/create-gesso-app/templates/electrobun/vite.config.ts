import { resolve } from 'node:path';
import { defineConfig } from 'vite';

import { electrobunViteAliases } from './.hutch/devkit/api/config/electrobun-vite';

/**
 * The window's assets: an ordinary Vite build with one alias list.
 *
 * The aliases are for Electrobun and not for Gesso. `electrobun/view`
 * is projected into `.hutch/devkit` by `hutch electrobun prepare`
 * rather than installed, so Vite has to be told where it went; the
 * Gesso packages are ordinary dependencies and need nothing. This file
 * therefore cannot be loaded before the first prepare, which is why
 * every script in `hutch.config.ts` runs prepare first.
 *
 * `root` is the view, so `src/main` is never built here: the main
 * process is Electrobun's to bundle, out of `electrobun.config.ts`.
 * The render worker needs no configuration at all, because
 * `new Worker(new URL(...))` is an expression Vite already splits into
 * its own chunk.
 */
export default defineConfig({
  resolve: {
    // Spread rather than passed through, so an alias of your own has
    // somewhere obvious to go.
    alias: [...electrobunViteAliases(resolve(__dirname, '.hutch/devkit'))]
  },
  esbuild: { jsx: 'automatic', jsxImportSource: 'gesso-framework' },
  root: 'src/view',
  build: { outDir: '../../dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true }
});
