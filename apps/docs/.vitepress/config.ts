import { defineConfig } from 'vitepress';

/**
 * The documentation site.
 *
 * Prose is HTML, not canvas. A Gesso page is drawn into a canvas, which
 * means the browser's own find, text selection, and indexing have
 * nothing to read. F2 and F6b give a Gesso *application* its own
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
  /**
   * Three faces, from Google Fonts: `Newsreader` sets the display line,
   * `Instrument Sans` the running text, `JetBrains Mono` the code.
   * `brand/README.md` fixes the mark and five colours and names no
   * typeface, so this is the site's own choice rather than the brand's,
   * and it is deliberately not the grotesque every framework site uses.
   * Each stack falls back to a face with close enough metrics that a
   * page laid out before the webfont arrives does not jump.
   */
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Gesso' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,200;6..72,300;6..72,400&display=swap'
      }
    ]
  ],
  themeConfig: {
    logo: '/gesso-mark.svg',
    /**
     * Search, in the browser, over an index built at build time.
     *
     * `local` rather than a hosted index because the site has no
     * hosting and no crawler behind it yet, and because the whole index
     * is a lazily loaded chunk: nothing is fetched until the reader
     * opens the box. At eighty-nine pages the index is 834 kB, 214 kB
     * over the wire, plus 62 kB for the search box itself. That is the
     * cost of the feature, and only the readers who use it pay it.
     *
     * It indexes the rendered prose, so what a reader can find is what
     * the pages say rather than what the examples do: a `<LiveExample>`
     * is a canvas, and a snippet quoted from `src/examples` is in the
     * page and therefore in the index. Searching for a component, a
     * prop or a phrase from the middle of a guide page returns the page
     * that owns it, which is the standard this was turned on against.
     */
    search: { provider: 'local' },
    nav: [
      { text: 'Guide', link: '/guide/what-is-gesso' },
      { text: 'Layout', link: '/layout/flex' },
      { text: 'Interaction', link: '/interaction/pointer-and-keyboard' },
      { text: 'Appearance', link: '/appearance/themes-and-the-environment' },
      { text: 'Components', link: '/components/' },
      { text: 'Tooling', link: '/tooling/devtools' },
      { text: 'Reference', link: '/reference/api' }
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Why Gesso', link: '/guide/why-gesso' },
          { text: 'What Gesso is', link: '/guide/what-is-gesso' },
          { text: 'Is Gesso for your project?', link: '/guide/is-gesso-for-you' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Your first component', link: '/guide/counter' },
          { text: 'Components run once', link: '/guide/components-run-once' },
          { text: 'Cells and bindings', link: '/guide/cells-and-bindings' },
          { text: 'Lists and conditionals', link: '/guide/lists-and-conditionals' },
          { text: 'Inputs and outputs', link: '/guide/inputs-and-outputs' },
          { text: 'Layout basics', link: '/guide/layout-basics' },
          { text: 'Text', link: '/guide/text' },
          { text: 'Rich text', link: '/guide/rich-text' },
          { text: 'Using components', link: '/guide/using-components' },
          { text: 'Forms', link: '/guide/forms' },
          { text: 'Light and dark', link: '/guide/appearance' },
          { text: 'State and services', link: '/guide/state-and-services' },
          { text: 'Workers', link: '/guide/workers' },
          { text: 'Testing', link: '/guide/testing' }
        ]
      },
      {
        text: 'Layout',
        items: [
          { text: 'Flex in full', link: '/layout/flex' },
          { text: 'Grid', link: '/layout/grid' },
          { text: 'Custom layouts', link: '/layout/custom-layouts' },
          { text: 'Layouts that change', link: '/layout/responsive' },
          { text: 'Insets', link: '/layout/insets' },
          { text: 'Right to left', link: '/layout/right-to-left' },
          { text: 'Overflow and scrolling', link: '/layout/overflow-and-scrolling' },
          { text: 'Sticky positioning', link: '/layout/sticky' },
          { text: 'Positioning and overlays', link: '/layout/positioning-and-overlays' },
          { text: 'Virtualization', link: '/layout/virtualization' },
          { text: 'Asking the engine why', link: '/layout/explain' }
        ]
      },
      {
        text: 'Interaction',
        items: [
          { text: 'Pointer and keyboard', link: '/interaction/pointer-and-keyboard' },
          { text: 'Touch and gestures', link: '/interaction/touch-and-gestures' },
          { text: 'Drag and drop', link: '/interaction/drag-and-drop' },
          { text: 'Shortcuts', link: '/interaction/shortcuts' },
          { text: 'Focus and traps', link: '/interaction/focus-and-traps' },
          { text: 'Text editing and IME', link: '/interaction/text-editing-and-ime' },
          { text: 'Selection', link: '/interaction/selection' },
          { text: 'Find', link: '/interaction/find' },
          { text: 'Modifiers', link: '/interaction/modifiers' },
          { text: 'Writing a modifier', link: '/interaction/writing-a-modifier' }
        ]
      },
      {
        text: 'Appearance',
        items: [
          { text: 'Themes and the environment', link: '/appearance/themes-and-the-environment' },
          { text: 'The type scale', link: '/appearance/typography' },
          { text: 'Fonts', link: '/appearance/fonts' },
          { text: 'Motion', link: '/appearance/motion' },
          { text: 'Enter and exit', link: '/appearance/enter-and-exit' },
          { text: 'Shared elements', link: '/appearance/shared-elements' }
        ]
      },
      {
        text: 'Media',
        items: [
          { text: 'Images and the resolver', link: '/media/images-and-the-resolver' },
          { text: 'Icons', link: '/media/icons' },
          { text: 'Video', link: '/media/video' }
        ]
      },
      {
        text: 'Structure',
        items: [
          { text: 'Routing', link: '/structure/routing' },
          { text: 'Channels and the barrier', link: '/structure/channels-and-the-barrier' },
          { text: 'Shell services', link: '/structure/shell-services' },
          { text: 'Undo and redo', link: '/structure/undo' },
          { text: 'Remembering state', link: '/structure/persistence' },
          { text: 'Errors and the overlay', link: '/structure/errors-and-the-overlay' },
          { text: 'Desktop windows', link: '/structure/desktop-windows' },
          { text: 'Gesso on Electrobun', link: '/structure/gesso-on-electrobun' }
        ]
      },
      {
        text: 'Access',
        items: [
          { text: 'Semantics', link: '/access/semantics' },
          { text: 'The mirror', link: '/access/the-mirror' },
          { text: 'Keyboard operability', link: '/access/keyboard' }
        ]
      },
      {
        text: 'Rendering',
        items: [{ text: 'Canvas2D and WebGPU', link: '/rendering/canvas2d-and-webgpu' }]
      },
      {
        text: 'Tooling',
        items: [
          { text: 'Devtools', link: '/tooling/devtools' },
          { text: 'Inspecting a node', link: '/tooling/inspecting-a-node' },
          { text: 'Frames and phases', link: '/tooling/frames-and-phases' },
          { text: 'The action log', link: '/tooling/the-action-log' },
          { text: 'The devtools panel', link: '/tooling/the-devtools-panel' },
          { text: 'The Vite plugin', link: '/tooling/vite-plugin' },
          { text: 'Hot module replacement', link: '/tooling/hot-module-replacement' },
          { text: 'Reporting errors', link: '/tooling/reporting-errors' },
          { text: 'create-gesso-app', link: '/tooling/create-gesso-app' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Properties', link: '/reference/properties' },
          { text: 'API index', link: '/reference/api' },
          { text: 'The render-worker protocol', link: '/reference/render-worker-protocol' }
        ]
      },
      {
        text: 'Components',
        items: [
          { text: 'Overview', link: '/components/' },
          { text: 'Restyling the controls', link: '/components/restyling' },
          { text: 'Button', link: '/components/button' },
          { text: 'Link', link: '/components/link' },
          { text: 'Chip', link: '/components/chip' },
          { text: 'Badge', link: '/components/badge' },
          { text: 'Alert', link: '/components/alert' },
          { text: 'Checkbox', link: '/components/checkbox' },
          { text: 'Switch', link: '/components/switch' },
          { text: 'RadioGroup', link: '/components/radio-group' },
          { text: 'SegmentedControl', link: '/components/segmented-control' },
          { text: 'TextInput and TextArea', link: '/components/text-input' },
          { text: 'Slider', link: '/components/slider' },
          { text: 'NumberInput', link: '/components/number-input' },
          { text: 'DataTable', link: '/components/data-table' },
          { text: 'Tree', link: '/components/tree' },
          { text: 'LazyList', link: '/components/lazy-list' },
          { text: 'Tabs', link: '/components/tabs' },
          { text: 'Accordion', link: '/components/accordion' },
          { text: 'Card', link: '/components/card' },
          { text: 'Divider', link: '/components/divider' },
          { text: 'Toolbar', link: '/components/toolbar' },
          { text: 'Dialog', link: '/components/dialog' },
          { text: 'Menu', link: '/components/menu' },
          { text: 'Select', link: '/components/select' },
          { text: 'Tooltip', link: '/components/tooltip' },
          { text: 'Toast', link: '/components/toast' },
          { text: 'SplitPane', link: '/components/split-pane' },
          { text: 'FindBar', link: '/components/find-bar' },
          { text: 'Breadcrumb', link: '/components/breadcrumb' },
          { text: 'Pagination', link: '/components/pagination' },
          { text: 'Image', link: '/components/image' },
          { text: 'Avatar', link: '/components/avatar' },
          { text: 'Video', link: '/components/video' },
          { text: 'Icon', link: '/components/icon' },
          { text: 'Spinner', link: '/components/spinner' },
          { text: 'ProgressBar', link: '/components/progress-bar' },
          { text: 'Meter', link: '/components/meter' },
          { text: 'Skeleton', link: '/components/skeleton' }
        ]
      },
      {
        text: 'Recipes',
        items: [
          { text: 'A settings page', link: '/recipes/settings-page' },
          { text: 'A dialog flow', link: '/recipes/dialog-flow' },
          { text: 'An appearance setting', link: '/recipes/appearance-setting' },
          { text: 'Loading, failing, and saving', link: '/recipes/loading-and-saving' },
          { text: 'A table over 100,000 rows', link: '/recipes/large-table' },
          { text: 'A virtualized feed', link: '/recipes/virtualized-feed' }
        ]
      }
    ]
  }
});
