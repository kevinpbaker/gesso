import { defineConfig } from 'vite';

/**
 * An ordinary Vite project. Gesso has no plugin and no build step of
 * its own: the render worker is a `new Worker(new URL(...))` that Vite
 * already knows how to split, and the markup in `App.tsx` is compiled
 * by the `jsx` and `jsxImportSource` lines in `tsconfig.json`, which
 * Vite reads for itself.
 *
 * There is nothing Gesso needs here. The file exists so there is
 * somewhere obvious to put the first thing you do need.
 */
export default defineConfig({});
