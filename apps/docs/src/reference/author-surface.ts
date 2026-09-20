/**
 * The author-facing slice of the public API, curated by hand.
 *
 * `packages/*\/api/*.api.d.ts` is the honest record of what each package
 * exports, but it is the whole surface: 883 names for `gesso-core`
 * alone, most of them internal machinery an application never types.
 * An index a reader can use needs a shorter list, and something has to
 * decide what belongs on it.
 *
 * That list lives here, in the docs, rather than as an `exports` split
 * in the packages, which is the cheaper half of the choice. A file here can be edited by whoever
 * writes a page, costs the packages nothing, and cannot change what is
 * published by accident. If the packages later grow a deliberate
 * author-facing entry point, this file becomes its test rather than its
 * replacement.
 *
 * The seed was mechanical: every name imported from a `gesso-*` package anywhere
 * under `apps/docs`, in a page, an example, or the site's own theme
 * components. That is 151 names. One more was added by hand,
 * `WorkerAppOptions`, because it is the argument `createApp` takes and
 * no page happens to name it. So the index covers what the site
 * actually teaches, and a name the docs never use is not in it.
 *
 * Two things are checked when `pnpm docs:reference` runs, and both fail
 * the build rather than printing a warning:
 *
 *   - every `name` here is exported by the package named in `package`,
 *     according to that package's committed API report
 *   - every `page` here resolves to a markdown file on this site
 *
 * `what` is written by hand and deliberately short. It is not the
 * TSDoc: the source comments explain a decision to someone changing the
 * code, which is a different job from telling a reader what a name is
 * for.
 */

/** The packages that carry an API report. */
export type SurfacePackage = 'core' | 'framework' | 'components' | 'testing' | 'devtools';

/** One name on the index. */
export interface AuthorSurfaceEntry {
  /** The exported name, exactly as it is imported. */
  readonly name: string;
  /** The package that exports it. */
  readonly package: SurfacePackage;
  /** The group it is listed under; must be a title in `AUTHOR_SURFACE_GROUPS`. */
  readonly group: string;
  /** One short line, hand written, saying what it is for. */
  readonly what: string;
  /** The page that teaches it, as a site-absolute link. */
  readonly page?: string;
}

/** A heading on the generated page, in the order the page reads. */
export interface AuthorSurfaceGroup {
  readonly title: string;
  readonly blurb: string;
}

export const AUTHOR_SURFACE_GROUPS: readonly AuthorSurfaceGroup[] = [
  {
    title: 'Starting an app',
    blurb: 'The two ends of the barrier: what the page calls, and what the worker calls back.'
  },
  {
    title: 'Components and state',
    blurb: 'A component runs once. These are the pieces that let it change afterwards.'
  },
  {
    title: 'Elements',
    blurb: 'The element factories. In a `.tsx` file the intrinsics compile to these, so a page rarely names them.'
  },
  {
    title: 'Modifiers',
    blurb: 'Behaviour attached to an element rather than written into it.'
  },
  {
    title: 'Layout values',
    blurb: 'The lengths and track sizes a layout property accepts.'
  },
  {
    title: 'Colour, theme and type',
    blurb: 'The environment values every element inherits, and the tokens that name them.'
  },
  {
    title: 'Motion',
    blurb: 'Enter and exit states, springs, and the service that runs them.'
  },
  {
    title: 'Services',
    blurb: 'Injected with `ctx.inject`. Each one owns a capability the worker cannot reach directly.'
  },
  {
    title: 'Routing',
    blurb: 'Typed routes, and the outlet that renders whichever one matched.'
  },
  {
    title: 'Channels and the barrier',
    blurb: 'The typed message path between the shell thread and the render worker.'
  },
  {
    title: 'The node graph',
    blurb: 'What an element becomes once it is mounted. Reached from a test or a devtool, not from a component.'
  },
  {
    title: 'Semantics',
    blurb: 'The accessibility record a node publishes, and the shapes it is patched with.'
  },
  {
    title: 'Input, selection and find',
    blurb: 'Pointer events, and the text ranges selection and find leave behind on a node.'
  },
  {
    title: 'Media',
    blurb: 'Images, video and icons, all of which resolve on the shell thread and arrive as bitmaps.'
  },
  {
    title: 'Components',
    blurb: 'Everything `gesso-components` exports that a page documents, with the option types they take.'
  },
  {
    title: 'Testing',
    blurb: 'Rendering a tree in node and querying it through the semantics it publishes.'
  },
  {
    title: 'Devtools',
    blurb: 'Panels mounted on the shell thread, beside the canvas rather than inside it.'
  }
] as const;

export const AUTHOR_SURFACE: readonly AuthorSurfaceEntry[] = [
  // Starting an app
  {
    name: 'createApp',
    package: 'framework',
    group: 'Starting an app',
    what: 'Starts a render worker against a canvas, from the shell thread.',
    page: '/guide/workers'
  },
  {
    name: 'renderRoot',
    package: 'framework',
    group: 'Starting an app',
    what: 'Mounts a tree inside the render worker. The last line of every worker entry file.',
    page: '/guide/workers'
  },
  {
    name: 'WorkerApp',
    package: 'framework',
    group: 'Starting an app',
    what: 'What `createApp` returns: mount it on an element, dispose it when the page leaves.',
    page: '/guide/workers'
  },
  {
    name: 'WorkerAppOptions',
    package: 'framework',
    group: 'Starting an app',
    what: 'Everything the shell side is configured with: the worker, the renderer, the callbacks.',
    page: '/guide/workers'
  },
  {
    name: 'WorkerHandle',
    package: 'framework',
    group: 'Starting an app',
    what: 'A worker a channel can open a port on, so several channels can share one.',
    page: '/structure/channels-and-the-barrier'
  },
  {
    name: 'ShellRequest',
    package: 'framework',
    group: 'Starting an app',
    what: 'A request the worker sends across the barrier for the shell to carry out.',
    page: '/structure/shell-services'
  },

  // Components and state
  {
    name: 'createComponent',
    package: 'framework',
    group: 'Components and state',
    what: 'Instantiates a component with its props. What JSX compiles to for a component tag.',
    page: '/guide/components-run-once'
  },
  {
    name: 'ComponentContext',
    package: 'framework',
    group: 'Components and state',
    what: 'The second argument to a component: injection, lifetime, and the node it is mounted on.',
    page: '/guide/components-run-once'
  },
  {
    name: 'Inputs',
    package: 'framework',
    group: 'Components and state',
    what: 'Wraps a props type so every prop arrives as a cell rather than a value.',
    page: '/guide/components-run-once'
  },
  {
    name: 'input',
    package: 'framework',
    group: 'Components and state',
    what: 'Creates a single input cell, mostly for a test that drives a component by hand.',
    page: '/guide/cells-and-bindings'
  },
  {
    name: 'internalState',
    package: 'framework',
    group: 'Components and state',
    what: 'State a component owns. Read it, write it, bind it into the tree.',
    page: '/guide/cells-and-bindings'
  },
  {
    name: 'InternalState',
    package: 'framework',
    group: 'Components and state',
    what: 'The type `internalState` returns: a BehaviorSubject with a current value.',
    page: '/guide/cells-and-bindings'
  },
  {
    name: 'computed',
    package: 'framework',
    group: 'Components and state',
    what: 'A cell that is a function of what it reads. The one derivation to reach for.',
    page: '/guide/cells-and-bindings'
  },
  {
    name: 'select',
    package: 'framework',
    group: 'Components and state',
    what: 'One field, or one projection, of a cell, as a cell. Structural by default.',
    page: '/guide/lists-and-conditionals'
  },
  {
    name: 'Each',
    package: 'framework',
    group: 'Components and state',
    what: 'A keyed list: `<Each of={rows} by="id">{row => ...}</Each>`.',
    page: '/guide/lists-and-conditionals'
  },
  {
    name: 'Show',
    package: 'framework',
    group: 'Components and state',
    what: 'One child while a condition holds, with a stable key and no node of its own.',
    page: '/guide/lists-and-conditionals'
  },
  {
    name: 'resource',
    package: 'framework',
    group: 'Components and state',
    what: 'A keyed request with a status, a value, an error and a retry. A stale answer cannot win.',
    page: '/recipes/loading-and-saving'
  },
  {
    name: 'mutate',
    package: 'framework',
    group: 'Components and state',
    what: 'An optimistic change to a cell, with a rollback that does not clobber a newer one.',
    page: '/recipes/loading-and-saving'
  },
  {
    name: 'debounced',
    package: 'framework',
    group: 'Components and state',
    what: 'A cell that follows its source once it has stopped moving.',
    page: '/recipes/loading-and-saving'
  },
  {
    name: 'throttled',
    package: 'framework',
    group: 'Components and state',
    what: 'A cell that follows its source at most once every so often, leading and trailing.',
    page: '/recipes/loading-and-saving'
  },
  {
    name: 'UiChild',
    package: 'core',
    group: 'Components and state',
    what: 'Anything that can be a child: an element, a component, or an Observable of either.',
    page: '/guide/cells-and-bindings'
  },
  {
    name: 'Presence',
    package: 'framework',
    group: 'Components and state',
    what: 'Keeps a child mounted while it plays its exit, then removes it.',
    page: '/appearance/enter-and-exit'
  },

  // Elements
  {
    name: 'Box',
    package: 'core',
    group: 'Elements',
    what: 'A rectangle with properties and children. The `<box>` intrinsic.',
    page: '/guide/layout-basics'
  },
  {
    name: 'Row',
    package: 'core',
    group: 'Elements',
    what: 'A box laid out along the x axis. The `<row>` intrinsic.',
    page: '/guide/layout-basics'
  },
  {
    name: 'Column',
    package: 'core',
    group: 'Elements',
    what: 'A box laid out along the y axis. The `<column>` intrinsic.',
    page: '/guide/layout-basics'
  },
  {
    name: 'Text',
    package: 'core',
    group: 'Elements',
    what: 'A run of text, measured and broken into lines. The `<text>` intrinsic.',
    page: '/guide/text'
  },
  {
    name: 'Button',
    package: 'core',
    group: 'Elements',
    what: 'A box that is focusable and hit-testable by default. The `<button>` intrinsic.',
    page: '/interaction/pointer-and-keyboard'
  },
  {
    name: 'LazyColumn',
    package: 'core',
    group: 'Elements',
    what: 'A column that builds only the rows inside the window it is asked for.',
    page: '/layout/virtualization'
  },

  // Modifiers
  {
    name: 'UiModifier',
    package: 'core',
    group: 'Modifiers',
    what: 'A behaviour attached to an element, keyed so it survives a rebind.',
    page: '/interaction/modifiers'
  },
  {
    name: 'defineModifier',
    package: 'core',
    group: 'Modifiers',
    what: 'Declares a modifier kind, with the attach and detach it runs.',
    page: '/interaction/modifiers'
  },
  {
    name: 'interactive',
    package: 'core',
    group: 'Modifiers',
    what: 'Hover, press and disabled visual states, plus the cursor that goes with them.',
    page: '/interaction/modifiers'
  },
  {
    name: 'bundle',
    package: 'core',
    group: 'Modifiers',
    what: 'A set of modifiers named once and attached as one, built at module level.',
    page: '/interaction/modifiers'
  },
  {
    name: 'focusRing',
    package: 'core',
    group: 'Modifiers',
    what: 'Paints a ring while the element holds focus.',
    page: '/interaction/focus-and-traps'
  },
  {
    name: 'autoFocus',
    package: 'core',
    group: 'Modifiers',
    what: 'Takes focus once, when the element mounts.',
    page: '/interaction/focus-and-traps'
  },
  {
    name: 'draggable',
    package: 'core',
    group: 'Modifiers',
    what: 'Turns pointer drags on the element into an offset stream.',
    page: '/interaction/touch-and-gestures'
  },
  {
    name: 'DragOffset',
    package: 'core',
    group: 'Modifiers',
    what: 'What `draggable` reports: the offset from where the drag began.',
    page: '/interaction/touch-and-gestures'
  },
  {
    name: 'measure',
    package: 'core',
    group: 'Modifiers',
    what: 'Pushes the laid-out box of the element into a Subject after every layout.',
    page: '/layout/explain'
  },
  {
    name: 'LayoutBox',
    package: 'core',
    group: 'Modifiers',
    what: 'The box `measure` reports: position and size in coordinates of the layout root.',
    page: '/layout/explain'
  },
  {
    name: 'scrollPosition',
    package: 'core',
    group: 'Modifiers',
    what: 'Reads and writes the offset of a scroll container without a relayout.',
    page: '/layout/overflow-and-scrolling'
  },
  {
    name: 'animateLayout',
    package: 'core',
    group: 'Modifiers',
    what: 'Animates the element from its previous box to its new one after a layout change.',
    page: '/appearance/motion'
  },
  {
    name: 'sharedElement',
    package: 'core',
    group: 'Modifiers',
    what: 'Matches an element across two trees by name, so it moves rather than swaps.',
    page: '/appearance/shared-elements'
  },
  {
    name: 'videoSource',
    package: 'core',
    group: 'Modifiers',
    what: 'Binds a video source to the element and hands back its playback state.',
    page: '/media/video'
  },
  {
    name: 'tooltip',
    package: 'components',
    group: 'Modifiers',
    what: 'Attaches a tooltip to any element, positioned by the overlay service.',
    page: '/components/tooltip'
  },

  // Layout values
  {
    name: 'auto',
    package: 'core',
    group: 'Layout values',
    what: 'Size from content. The default for a track and for a box that sets no size.',
    page: '/guide/layout-basics'
  },
  {
    name: 'percent',
    package: 'core',
    group: 'Layout values',
    what: 'A length relative to the containing block, as `percent(100)`.',
    page: '/guide/layout-basics'
  },
  {
    name: 'fr',
    package: 'core',
    group: 'Layout values',
    what: 'A grid track that takes a share of the space left over.',
    page: '/layout/grid'
  },
  {
    name: 'minmax',
    package: 'core',
    group: 'Layout values',
    what: 'A grid track with a floor and a ceiling.',
    page: '/layout/grid'
  },
  {
    name: 'repeat',
    package: 'core',
    group: 'Layout values',
    what: 'Repeats a run of track sizes a fixed number of times.',
    page: '/layout/grid'
  },
  {
    name: 'UiAlignment',
    package: 'core',
    group: 'Layout values',
    what: 'What the `x`, `y`, `selfX` and `selfY` alignment properties accept.',
    page: '/layout/flex'
  },
  {
    name: 'UiFlexWrap',
    package: 'core',
    group: 'Layout values',
    what: 'What `flexWrap` accepts: `nowrap`, `wrap`, `wrap-reverse`.',
    page: '/layout/flex'
  },
  {
    name: 'ObjectFit',
    package: 'core',
    group: 'Layout values',
    what: 'How an image or video fills its box: `fill`, `cover`, `contain`, `none`.',
    page: '/media/images-and-the-resolver'
  },

  // Colour, theme and type
  {
    name: 'UiTheme',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'A palette and a type scale, provided once and inherited by everything below.',
    page: '/appearance/themes-and-the-environment'
  },
  {
    name: 'lightTheme',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'The light theme that ships with the framework.',
    page: '/guide/appearance'
  },
  {
    name: 'defaultSpacing',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'The spacing scale a theme carries: eight steps, from `none` to `huge`.',
    page: '/appearance/themes-and-the-environment'
  },
  {
    name: 'withDensity',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'The same theme at another density. Scales the spacing scale and nothing else.',
    page: '/appearance/themes-and-the-environment'
  },
  {
    name: 'withContrast',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'The same theme with every foreground raised to a 7:1 ratio against its ground.',
    page: '/appearance/themes-and-the-environment'
  },
  {
    name: 'defineThemeExtension',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'A token group of your own on a theme, typed, with no change to `UiTheme`.',
    page: '/appearance/themes-and-the-environment'
  },
  {
    name: 'withThemeExtension',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'The same theme carrying one extension’s tokens.',
    page: '/appearance/themes-and-the-environment'
  },
  {
    name: 'themeExtension',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'Reads a token group back off a theme, completing on its names.',
    page: '/appearance/themes-and-the-environment'
  },
  {
    name: 'darkTheme',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'The dark theme that ships with the framework.',
    page: '/guide/appearance'
  },
  {
    name: 'lightColors',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'The light palette on its own, for a theme that keeps the colours and changes the type.',
    page: '/appearance/themes-and-the-environment'
  },
  {
    name: 'UiColors',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'The token set a palette has to fill: `surface`, `text`, `accent`, and the rest.',
    page: '/appearance/themes-and-the-environment'
  },
  {
    name: 'UiColor',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'A resolved colour: red, green, blue, alpha.',
    page: '/appearance/themes-and-the-environment'
  },
  {
    name: 'parseColor',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'Parses a CSS colour string into a `UiColor`.',
    page: '/appearance/themes-and-the-environment'
  },
  {
    name: 'UiTypography',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'The type scale in a theme: body, heading, caption and their siblings.',
    page: '/appearance/typography'
  },
  {
    name: 'UiTextStyle',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'One step of the scale: family, size, weight, line height, spacing, alignment.',
    page: '/appearance/typography'
  },
  {
    name: 'UiFontWeight',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'What `fontWeight` accepts: a number, a numeric string, or a CSS keyword.',
    page: '/appearance/typography'
  },
  {
    name: 'UiEnvironmentKeys',
    package: 'core',
    group: 'Colour, theme and type',
    what: 'The keys a scoped environment value can be provided under.',
    page: '/appearance/themes-and-the-environment'
  },
  {
    name: 'ColorScheme',
    package: 'framework',
    group: 'Colour, theme and type',
    what: 'The appearance signal the shell reports: `light` or `dark`.',
    page: '/guide/appearance'
  },

  // Motion
  {
    name: 'fade',
    package: 'core',
    group: 'Motion',
    what: 'An enter or exit state that animates opacity.',
    page: '/appearance/enter-and-exit'
  },
  {
    name: 'scaleFrom',
    package: 'core',
    group: 'Motion',
    what: 'An enter or exit state that animates scale.',
    page: '/appearance/enter-and-exit'
  },
  {
    name: 'slideUp',
    package: 'core',
    group: 'Motion',
    what: 'An enter or exit state that animates a vertical offset.',
    page: '/appearance/enter-and-exit'
  },
  {
    name: 'spring',
    package: 'core',
    group: 'Motion',
    what: 'A spring transition, by token or by stiffness and damping.',
    page: '/appearance/motion'
  },
  {
    name: 'AnimationService',
    package: 'framework',
    group: 'Motion',
    what: 'Runs the animations on the frame clock, and honours reduced motion.',
    page: '/appearance/motion'
  },

  // Services
  {
    name: 'ServiceRegistry',
    package: 'framework',
    group: 'Services',
    what: 'What `ctx.inject` looks in. One instance per app, populated at start.',
    page: '/guide/state-and-services'
  },
  {
    name: 'ShellService',
    package: 'framework',
    group: 'Services',
    what: 'What the worker knows of the page: viewport size, appearance, and requests it can send.',
    page: '/structure/shell-services'
  },
  {
    name: 'OverlayService',
    package: 'framework',
    group: 'Services',
    what: 'Mounts a layer above the app: dialogs, menus, tooltips and toasts.',
    page: '/layout/positioning-and-overlays'
  },
  {
    name: 'useOverlay',
    package: 'components',
    group: 'Services',
    what: 'The hook the shipped components use to open and close an overlay.',
    page: '/layout/positioning-and-overlays'
  },
  {
    name: 'FocusService',
    package: 'framework',
    group: 'Services',
    what: 'Owns focus: where it is, where tab sends it, and which trap holds it.',
    page: '/interaction/focus-and-traps'
  },
  {
    name: 'FindService',
    package: 'framework',
    group: 'Services',
    what: 'Searches the text in the tree, because browser find cannot see a canvas.',
    page: '/interaction/find'
  },
  {
    name: 'MediaService',
    package: 'framework',
    group: 'Services',
    what: 'Asks the shell to decode an image or open a video, and hands back the result.',
    page: '/media/images-and-the-resolver'
  },
  {
    name: 'RouterService',
    package: 'framework',
    group: 'Services',
    what: 'The current route, and the navigation the app performs on it.',
    page: '/structure/routing'
  },

  // Routing
  {
    name: 'route',
    package: 'framework',
    group: 'Routing',
    what: 'Declares one route, with its path parameters typed from the path string.',
    page: '/structure/routing'
  },
  {
    name: 'RouteDefinition',
    package: 'framework',
    group: 'Routing',
    what: 'What `route` returns, and what a router is configured with.',
    page: '/structure/routing'
  },
  {
    name: 'to',
    package: 'framework',
    group: 'Routing',
    what: 'Builds a target for a route, refusing a missing or misspelt parameter.',
    page: '/structure/routing'
  },
  {
    name: 'RouterOutlet',
    package: 'framework',
    group: 'Routing',
    what: 'Renders whichever route matched, and swaps the tree when it changes.',
    page: '/structure/routing'
  },
  {
    name: 'OutletProps',
    package: 'framework',
    group: 'Routing',
    what: 'What an outlet takes, including the transition between routes.',
    page: '/structure/routing'
  },
  {
    name: 'createShellHistory',
    package: 'framework',
    group: 'Routing',
    what: 'Binds the router to browser history, on the shell thread.',
    page: '/structure/routing'
  },

  // Channels and the barrier
  {
    name: 'channel',
    package: 'framework',
    group: 'Channels and the barrier',
    what: 'Declares a typed channel: a view the worker reads, and commands it sends.',
    page: '/structure/channels-and-the-barrier'
  },
  {
    name: 'defineChannel',
    package: 'framework',
    group: 'Channels and the barrier',
    what: 'The same token from one object, so the view keys and their initial values are written once.',
    page: '/recipes/loading-and-saving'
  },
  {
    name: 'ViewOf',
    package: 'framework',
    group: 'Channels and the barrier',
    what: 'The view type of a token declared with `defineChannel`.',
    page: '/recipes/loading-and-saving'
  },
  {
    name: 'provide',
    package: 'framework',
    group: 'Channels and the barrier',
    what: 'Serves a channel from the shell thread, over a port.',
    page: '/structure/channels-and-the-barrier'
  },
  {
    name: 'ChannelSource',
    package: 'framework',
    group: 'Channels and the barrier',
    what: 'What a provider implements: the current view, and a handler per command.',
    page: '/structure/channels-and-the-barrier'
  },
  {
    name: 'ChannelPort',
    package: 'framework',
    group: 'Channels and the barrier',
    what: 'The message port a channel runs over. A `MessagePort` satisfies it.',
    page: '/structure/channels-and-the-barrier'
  },
  {
    name: 'createChannelRegistry',
    package: 'framework',
    group: 'Channels and the barrier',
    what: 'Collects several channels behind one port, and reports which one failed.',
    page: '/structure/channels-and-the-barrier'
  },
  {
    name: 'serveChannels',
    package: 'framework',
    group: 'Channels and the barrier',
    what: 'Starts serving a set of channels from the shell, and returns the teardown.',
    page: '/structure/channels-and-the-barrier'
  },
  {
    name: 'Patch',
    package: 'framework',
    group: 'Channels and the barrier',
    what: 'One change to a projected view, as it crosses the barrier.',
    page: '/structure/channels-and-the-barrier'
  },
  {
    name: 'diffProjection',
    package: 'framework',
    group: 'Channels and the barrier',
    what: 'Turns an old and a new view into the patches between them.',
    page: '/structure/channels-and-the-barrier'
  },
  {
    name: 'isChannelHostMessage',
    package: 'framework',
    group: 'Channels and the barrier',
    what: 'Narrows a `message` event to something the host sent.',
    page: '/structure/channels-and-the-barrier'
  },
  {
    name: 'isChannelClientMessage',
    package: 'framework',
    group: 'Channels and the barrier',
    what: 'Narrows a `message` event to something the client sent.',
    page: '/structure/channels-and-the-barrier'
  },

  // The node graph
  {
    name: 'UiNode',
    package: 'core',
    group: 'The node graph',
    what: 'A mounted element: its properties, its layout record, and its children.',
    page: '/tooling/inspecting-a-node'
  },
  {
    name: 'UiNodeType',
    package: 'core',
    group: 'The node graph',
    what: 'Which kind of element a node is.',
    page: '/tooling/inspecting-a-node'
  },
  {
    name: 'resolvePropertyByName',
    package: 'core',
    group: 'The node graph',
    what: 'Reads one resolved property off a node, inheritance and defaults applied.',
    page: '/tooling/inspecting-a-node'
  },
  {
    name: 'createPaintState',
    package: 'core',
    group: 'The node graph',
    what: 'Allocates the scratch record `resolvePaintState` fills.',
    page: '/tooling/inspecting-a-node'
  },
  {
    name: 'resolvePaintState',
    package: 'core',
    group: 'The node graph',
    what: 'Resolves everything the painter needs for one node, into that record.',
    page: '/tooling/inspecting-a-node'
  },
  {
    name: 'UiVisualState',
    package: 'core',
    group: 'The node graph',
    what: 'Hover, press, focus, disabled: what `interactive` sets and paint reads.',
    page: '/interaction/modifiers'
  },
  {
    name: 'UiVisualStateSet',
    package: 'core',
    group: 'The node graph',
    what: 'The set of visual states a node currently holds.',
    page: '/interaction/modifiers'
  },

  // Semantics
  {
    name: 'UiSemanticsRecord',
    package: 'core',
    group: 'Semantics',
    what: 'What one node publishes to the accessibility mirror.',
    page: '/access/semantics'
  },
  {
    name: 'UiSemanticsUpdate',
    package: 'core',
    group: 'Semantics',
    what: 'A batch of semantics changes crossing to the shell in one message.',
    page: '/access/the-mirror'
  },
  {
    name: 'UiSemanticsPatch',
    package: 'core',
    group: 'Semantics',
    what: 'The change to one record inside that batch.',
    page: '/access/the-mirror'
  },
  {
    name: 'UiSemanticState',
    package: 'core',
    group: 'Semantics',
    what: 'What the `states` property accepts: `checked`, `expanded`, `busy`, and the rest.',
    page: '/access/semantics'
  },

  // Input, selection and find
  {
    name: 'UiPointerEvent',
    package: 'core',
    group: 'Input, selection and find',
    what: 'A pointer event as it reaches a node, in coordinates local to the node.',
    page: '/interaction/pointer-and-keyboard'
  },
  {
    name: 'UiPointerDevice',
    package: 'core',
    group: 'Input, selection and find',
    what: 'What kind of pointer it was, and what it can do.',
    page: '/interaction/touch-and-gestures'
  },
  {
    name: 'noKeyModifiers',
    package: 'core',
    group: 'Input, selection and find',
    what: 'An empty modifier set, for a test or a synthesised key event.',
    page: '/interaction/pointer-and-keyboard'
  },
  {
    name: 'selectableTextNodes',
    package: 'core',
    group: 'Input, selection and find',
    what: 'The text nodes under a root, in the order a selection walks them.',
    page: '/interaction/selection'
  },
  {
    name: 'selectionRangeOf',
    package: 'core',
    group: 'Input, selection and find',
    what: 'The selected range on a node, if any of it is selected.',
    page: '/interaction/selection'
  },
  {
    name: 'matchRangesOf',
    package: 'core',
    group: 'Input, selection and find',
    what: 'The ranges find has highlighted on a node.',
    page: '/interaction/find'
  },

  // Media
  {
    name: 'UiImage',
    package: 'core',
    group: 'Media',
    what: 'What the `image` property holds: a decoded `ImageBitmap`.',
    page: '/media/images-and-the-resolver'
  },
  {
    name: 'ImageResolver',
    package: 'core',
    group: 'Media',
    what: 'The contract an application implements to turn a source into a bitmap.',
    page: '/media/images-and-the-resolver'
  },
  {
    name: 'DefaultImageResolver',
    package: 'core',
    group: 'Media',
    what: 'The resolver that ships: fetch, decode, cache, and share in-flight requests.',
    page: '/media/images-and-the-resolver'
  },
  {
    name: 'UiVideoSurface',
    package: 'core',
    group: 'Media',
    what: 'A frame source the painter can draw, backed by a video on the shell thread.',
    page: '/media/video'
  },
  {
    name: 'isVideoSurface',
    package: 'core',
    group: 'Media',
    what: 'Narrows a value to a video surface.',
    page: '/media/video'
  },
  {
    name: 'VideoPlayback',
    package: 'core',
    group: 'Media',
    what: 'The playback state a video reports back: time, duration, paused, ended.',
    page: '/media/video'
  },
  {
    name: 'VideoResolver',
    package: 'core',
    group: 'Media',
    what: 'The contract for opening a video source and driving it.',
    page: '/media/video'
  },
  {
    name: 'IconRasterizer',
    package: 'core',
    group: 'Media',
    what: 'Turns icon path data into a bitmap at the size and scale it will be drawn.',
    page: '/media/icons'
  },
  {
    name: 'IconCanvas',
    package: 'core',
    group: 'Media',
    what: 'The drawing surface a rasterizer needs, so it can run in a worker.',
    page: '/media/icons'
  },
  {
    name: 'IconContext',
    package: 'core',
    group: 'Media',
    what: 'The 2D context of that surface, narrowed to what rasterizing uses.',
    page: '/media/icons'
  },

  // Components
  {
    name: 'Accordion',
    package: 'components',
    group: 'Components',
    what: 'Sections that expand one at a time, or several.',
    page: '/components/accordion'
  },
  {
    name: 'AccordionSection',
    package: 'components',
    group: 'Components',
    what: 'One section: its id, its header, its content.',
    page: '/components/accordion'
  },
  {
    name: 'Avatar',
    package: 'components',
    group: 'Components',
    what: 'A face, falling back to initials and then to a glyph.',
    page: '/components/avatar'
  },
  {
    name: 'Badge',
    package: 'components',
    group: 'Components',
    what: 'A count or a short marker on something else, silent unless it is named.',
    page: '/components/badge'
  },
  {
    name: 'Card',
    package: 'components',
    group: 'Components',
    what: 'A surface with padding, a radius and an elevation.',
    page: '/components/card'
  },
  {
    name: 'Checkbox',
    package: 'components',
    group: 'Components',
    what: 'A tri-state box: checked, unchecked, mixed.',
    page: '/components/checkbox'
  },
  {
    name: 'Chip',
    package: 'components',
    group: 'Components',
    what: 'A pill that is on or off, for a row of filters; a toggle button that reports pressed.',
    page: '/components/chip'
  },
  {
    name: 'DataTable',
    package: 'components',
    group: 'Components',
    what: 'A sortable table over a row array, virtualized down the column.',
    page: '/components/data-table'
  },
  {
    name: 'DataColumn',
    package: 'components',
    group: 'Components',
    what: 'One column: its header, its width, and how it reads a row.',
    page: '/components/data-table'
  },
  {
    name: 'DataTableSort',
    package: 'components',
    group: 'Components',
    what: 'Which column the table is sorted by, and in which direction.',
    page: '/components/data-table'
  },
  {
    name: 'Dialog',
    package: 'components',
    group: 'Components',
    what: 'A modal surface in the overlay layer, with focus held inside it.',
    page: '/components/dialog'
  },
  {
    name: 'Divider',
    package: 'components',
    group: 'Components',
    what: 'A rule between things, horizontal or vertical.',
    page: '/components/divider'
  },
  {
    name: 'FindBar',
    package: 'components',
    group: 'Components',
    what: 'The search bar over `FindService`, with match count and stepping.',
    page: '/components/find-bar'
  },
  {
    name: 'Icon',
    package: 'components',
    group: 'Components',
    what: 'One icon from the registry, rasterized at the size it is drawn.',
    page: '/components/icon'
  },
  {
    name: 'Image',
    package: 'components',
    group: 'Components',
    what: 'An image with a fit, a placeholder, and an error state.',
    page: '/components/image'
  },
  {
    name: 'LazyList',
    package: 'components',
    group: 'Components',
    what: 'A virtualized list that builds only the rows in the window.',
    page: '/components/lazy-list'
  },
  {
    name: 'Link',
    package: 'components',
    group: 'Components',
    what: 'Words that go somewhere, announced as a link rather than a button.',
    page: '/components/link'
  },
  {
    name: 'Menu',
    package: 'components',
    group: 'Components',
    what: 'A menu in the overlay layer, with roving focus and type-ahead.',
    page: '/components/menu'
  },
  {
    name: 'MenuItem',
    package: 'components',
    group: 'Components',
    what: 'One item: its label, its shortcut, whether it is enabled.',
    page: '/components/menu'
  },
  {
    name: 'NumberInput',
    package: 'components',
    group: 'Components',
    what: 'A numeric field with steppers, a range, and keyboard stepping.',
    page: '/components/number-input'
  },
  {
    name: 'ProgressBar',
    package: 'components',
    group: 'Components',
    what: 'Determinate or indeterminate progress.',
    page: '/components/progress-bar'
  },
  {
    name: 'RadioGroup',
    package: 'components',
    group: 'Components',
    what: 'One choice from several, with arrow keys moving the selection.',
    page: '/components/radio-group'
  },
  {
    name: 'RadioOption',
    package: 'components',
    group: 'Components',
    what: 'One option: its value, its label, whether it is enabled.',
    page: '/components/radio-group'
  },
  {
    name: 'Select',
    package: 'components',
    group: 'Components',
    what: 'A listbox in the overlay layer, opened from a closed control.',
    page: '/components/select'
  },
  {
    name: 'SelectOption',
    package: 'components',
    group: 'Components',
    what: 'One option in that list.',
    page: '/components/select'
  },
  {
    name: 'Skeleton',
    package: 'components',
    group: 'Components',
    what: 'A stand-in holding the box of content that has not arrived, shimmering if asked.',
    page: '/components/skeleton'
  },
  {
    name: 'SkeletonText',
    package: 'components',
    group: 'Components',
    what: 'A run of stand-in lines, the last one short, for a paragraph still loading.',
    page: '/components/skeleton'
  },
  {
    name: 'Slider',
    package: 'components',
    group: 'Components',
    what: 'A value in a range, dragged or stepped.',
    page: '/components/slider'
  },
  {
    name: 'Spinner',
    package: 'components',
    group: 'Components',
    what: 'A busy indicator, driven by the frame clock.',
    page: '/components/spinner'
  },
  {
    name: 'SplitPane',
    package: 'components',
    group: 'Components',
    what: 'Two panes and a draggable divider between them.',
    page: '/components/split-pane'
  },
  {
    name: 'Switch',
    package: 'components',
    group: 'Components',
    what: 'An on or off control, with the thumb animated between.',
    page: '/components/switch'
  },
  {
    name: 'Tabs',
    package: 'components',
    group: 'Components',
    what: 'A tab strip and its panel, with arrow keys moving between tabs.',
    page: '/components/tabs'
  },
  {
    name: 'TabDefinition',
    package: 'components',
    group: 'Components',
    what: 'One tab: its id, its label, its panel.',
    page: '/components/tabs'
  },
  {
    name: 'TextInput',
    package: 'components',
    group: 'Components',
    what: 'A single-line field with selection, an IME path, and a caret.',
    page: '/components/text-input'
  },
  {
    name: 'TextArea',
    package: 'components',
    group: 'Components',
    what: 'The same field over several lines.',
    page: '/components/text-input'
  },
  {
    name: 'Toast',
    package: 'components',
    group: 'Components',
    what: 'A transient message in the overlay layer, announced to the mirror.',
    page: '/components/toast'
  },
  {
    name: 'Toolbar',
    package: 'components',
    group: 'Components',
    what: 'A row of controls with one tab stop and roving focus inside.',
    page: '/components/toolbar'
  },
  {
    name: 'Tooltip',
    package: 'components',
    group: 'Components',
    what: 'The tooltip surface itself, for a layout that places its own.',
    page: '/components/tooltip'
  },
  {
    name: 'Tree',
    package: 'components',
    group: 'Components',
    what: 'A disclosure tree with levels, expansion and typed selection.',
    page: '/components/tree'
  },
  {
    name: 'TreeNode',
    package: 'components',
    group: 'Components',
    what: 'One node: its id, its label, its children.',
    page: '/components/tree'
  },
  {
    name: 'Video',
    package: 'components',
    group: 'Components',
    what: 'A video surface with controls, drawn into the canvas like anything else.',
    page: '/components/video'
  },

  // Testing
  {
    name: 'renderTest',
    package: 'testing',
    group: 'Testing',
    what: 'Renders a tree in node, with a canvas double, and returns queries over it.',
    page: '/guide/testing'
  },
  {
    name: 'Rendered',
    package: 'testing',
    group: 'Testing',
    what: 'What `renderTest` returns: the queries, the root, and the frame control.',
    page: '/guide/testing'
  },

  // Devtools
  {
    name: 'createActionLog',
    package: 'devtools',
    group: 'Devtools',
    what: 'Records what the app did, frame by frame, for the panel to show.',
    page: '/tooling/the-action-log'
  },
  {
    name: 'mountActionLogPanel',
    package: 'devtools',
    group: 'Devtools',
    what: 'Mounts that log as a panel beside the canvas.',
    page: '/tooling/the-action-log'
  },
  {
    name: 'mountNodeInspector',
    package: 'devtools',
    group: 'Devtools',
    what: 'Mounts the inspector: pick a node, read its resolved properties.',
    page: '/tooling/inspecting-a-node'
  },
  {
    name: 'mountFrameProfiler',
    package: 'devtools',
    group: 'Devtools',
    what: 'Mounts the frame timeline, phase by phase.',
    page: '/tooling/frames-and-phases'
  },
  {
    name: 'mountErrorOverlay',
    package: 'devtools',
    group: 'Devtools',
    what: 'Shows an error from the worker over the canvas, with its stack.',
    page: '/structure/errors-and-the-overlay'
  },
  {
    name: 'connectDevtools',
    package: 'devtools',
    group: 'Devtools',
    what: 'Registers the app with the page so the devtools panel, or the Chrome extension, finds it.',
    page: '/tooling/the-devtools-panel'
  },
  {
    name: 'mountDevtoolsPanel',
    package: 'devtools',
    group: 'Devtools',
    what: 'Mounts the panel itself, over a port, anywhere in a page.',
    page: '/tooling/the-devtools-panel'
  }
] as const;
