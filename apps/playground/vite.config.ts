import { gesso } from '@gesso/vite-plugin';
import { defineConfig } from 'vite';

/**
 * The playground's dev server and build.
 *
 * No aliases: `@gesso/core`, `@gesso/framework` and `@gesso/components`
 * resolve through the workspace links, and `jsxImportSource` in
 * `tsconfig.base.json` points at `@gesso/framework`, whose `exports` map
 * carries `./jsx-runtime`.
 *
 * The plugin is here for the two halves that suit a page hosting many
 * applications, and without the third. Each route names its own worker
 * because it chooses among several, so the plugin finds a
 * `renderWorker` already written and leaves the construction alone;
 * what it adds is the `import.meta.hot.accept` wiring for the render
 * worker entries, and the warning when a save is about to reload the
 * page instead. That warning was written for exactly this application:
 * The caveat was found here, in `FrameworkPlayground.ts`,
 * which the single-thread route imports on the main thread as well.
 *
 * `overlay: false` because the overlay covers the element the app was
 * mounted into, and it finds that element by looking for the page's
 * canvas. A page with one application has one canvas; the playground
 * has a pane, a comparison route with two, and a nav around them, so
 * the guess would be wrong as often as right. The routes that want an
 * overlay mount one themselves.
 */
export default defineConfig({
  plugins: [gesso({ overlay: false })],
  server: { port: 5173 }
});
