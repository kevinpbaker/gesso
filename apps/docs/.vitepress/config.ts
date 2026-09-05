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
          { text: 'Inputs and outputs', link: '/guide/inputs-and-outputs' },
          { text: 'Layout basics', link: '/guide/layout-basics' },
          { text: 'Text', link: '/guide/text' },
          { text: 'Using components', link: '/guide/using-components' },
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
          { text: 'Focus and traps', link: '/interaction/focus-and-traps' },
          { text: 'Text editing and IME', link: '/interaction/text-editing-and-ime' },
          { text: 'Selection', link: '/interaction/selection' },
          { text: 'Find', link: '/interaction/find' },
          { text: 'Modifiers', link: '/interaction/modifiers' }
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
          { text: 'Errors and the overlay', link: '/structure/errors-and-the-overlay' }
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
          { text: 'Hot module replacement', link: '/tooling/hot-module-replacement' },
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
          { text: 'Checkbox', link: '/components/checkbox' },
          { text: 'Switch', link: '/components/switch' },
          { text: 'RadioGroup', link: '/components/radio-group' },
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
          { text: 'Image', link: '/components/image' },
          { text: 'Video', link: '/components/video' },
          { text: 'Icon', link: '/components/icon' },
          { text: 'Spinner', link: '/components/spinner' },
          { text: 'ProgressBar', link: '/components/progress-bar' }
        ]
      },
      {
        text: 'Recipes',
        items: [
          { text: 'A settings page', link: '/recipes/settings-page' },
          { text: 'A dialog flow', link: '/recipes/dialog-flow' },
          { text: 'An appearance setting', link: '/recipes/appearance-setting' },
          { text: 'A table over 100,000 rows', link: '/recipes/large-table' },
          { text: 'A virtualized feed', link: '/recipes/virtualized-feed' }
        ]
      }
    ]
  }
});
