import { defineConfig } from 'vitest/config';

/**
 * `jsxImportSource: "gesso"` in tsconfig makes TSX files import from
 * `gesso/jsx-runtime`; this alias points that at the runtime in the
 * tree. Vitest reads this file too, so specs written in TSX work.
 */
export default defineConfig({
  resolve: {
    alias: {
      'gesso/jsx-runtime': new URL('./src/framework/jsx/jsx-runtime.ts', import.meta.url).pathname,
      'gesso/jsx-dev-runtime': new URL('./src/framework/jsx/jsx-dev-runtime.ts', import.meta.url).pathname
    }
  },
  test: {
    // Sibling git worktrees under .claude/ carry their own copies of the suite.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**']
  }
});
