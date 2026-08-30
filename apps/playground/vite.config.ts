import { defineConfig } from 'vite';

/**
 * The playground's dev server and build.
 *
 * No aliases: `@gesso/core`, `@gesso/framework` and `@gesso/components`
 * resolve through the workspace links, and `jsxImportSource` in
 * `tsconfig.base.json` points at `@gesso/framework`, whose `exports` map
 * carries `./jsx-runtime`.
 */
export default defineConfig({
  server: { port: 5173 }
});
