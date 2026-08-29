import { defineConfig } from 'vitest/config';

/**
 * `jsxImportSource: "nodal"` in tsconfig makes TSX files import from
 * `nodal/jsx-runtime`; this alias points that at the runtime in the
 * tree. Vitest reads this file too, so specs written in TSX work.
 */
export default defineConfig({
  resolve: {
    alias: {
      'nodal/jsx-runtime': new URL('./src/framework/jsx/jsx-runtime.ts', import.meta.url).pathname,
      'nodal/jsx-dev-runtime': new URL('./src/framework/jsx/jsx-dev-runtime.ts', import.meta.url).pathname
    }
  },
  test: {
    // Sibling git worktrees under .claude/ carry their own copies of the suite.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**']
  }
});
