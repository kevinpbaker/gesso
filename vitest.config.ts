import { defineConfig } from 'vitest/config';

/**
 * The workspace's test config.
 *
 * There is one suite across all four packages rather than a project per
 * package: every spec runs in the same node environment against the same
 * canvas doubles, and `@gesso/core` resolves through the workspace link
 * to TypeScript source, so nothing here needs a build or an alias.
 *
 * The playground's own Vite config is `apps/playground/vite.config.ts`.
 */
export default defineConfig({
  test: {
    // Sibling git worktrees under .claude/ carry their own copies of the suite.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**']
  }
});
