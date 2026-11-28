import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * An ordinary React app's config. The Gesso render worker is a module
 * like any other: `new Worker(new URL(...))` in `App.tsx` is what makes
 * Vite bundle it, and `worker.format: 'es'` lets it import.
 *
 * The React plugin is kept off the worker. It adds React Refresh to
 * every `.tsx` it transforms, and Refresh reads `window`, which a worker
 * does not have: the worker fails to start and the panel stays empty.
 * The worker's JSX is Gesso's, named by the pragma at its top.
 */
export default defineConfig({
  plugins: [react({ exclude: /\.worker\.tsx?$/ })],
  worker: { format: 'es' }
});
