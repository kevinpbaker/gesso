import { defineConfig } from 'vitepress';

/**
 * The documentation site.
 *
 * Prose is HTML, not canvas. A Gesso page is drawn into a canvas, which
 * means the browser's own find, text selection, and indexing have
 * nothing to read — F2 and F6b give a Gesso *application* its own
 * answers to those, but a docs site should not need them. So the site
 * is ordinary markdown, and Gesso appears in it the way it appears in
 * anybody's application: as a canvas with a render worker behind it,
 * mounted by `<LiveExample>`.
 *
 * VitePress rather than the alternatives because it is Vite, and this
 * repository already is: the workspace links resolve with no aliases,
 * `jsxImportSource` comes from `tsconfig.base.json`, and a live
 * example's worker is bundled by the same `new Worker(new URL(...))`
 * path the playground's routes use.
 */
export default defineConfig({
  title: 'Gesso',
  description: 'A canvas UI framework that keeps the whole interface off the main thread.',
  cleanUrls: true,
  themeConfig: {
    nav: [{ text: 'Guide', link: '/guide/counter' }],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Your first component', link: '/guide/counter' },
          { text: 'Light and dark', link: '/guide/appearance' }
        ]
      }
    ]
  }
});
