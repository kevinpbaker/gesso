/**
 * The examples the landing page lists.
 *
 * Each is a small complete app on its own route, meant to be read as
 * much as run: the point of an example is the source. `route` is the
 * hash of the page; `source` is the file that holds the UI, shown on
 * the card so a reader knows where to look.
 */
export interface ExampleMeta {
  readonly route: string;
  readonly title: string;
  readonly description: string;
  readonly source: string;
  readonly tags: readonly string[];
}

export const EXAMPLES: readonly ExampleMeta[] = [
  {
    route: 'example-transitions',
    title: 'Playlists, and the transition between them',
    description:
      'A replica of the View Transitions demo everyone has seen — three playlist cards, each expanding into a full ' +
      'screen — built without snapshots, and then made real: the three playlists are Audius playlists, read on an ' +
      'application worker and published over a channel, and pressing Play plays them. Twelve elements are declared ' +
      'shared by name, and each one springs from where the element it replaces was standing: the card background ' +
      'morphs by geometry so its corners square off rather than stretch, and everything else translates and ' +
      'scales, which never touches layout. Click a card and press Back before it lands to see that the morph is ' +
      'interruptible, which a cross-fade of two rasters cannot be. The second playlist plays a video, decoded from ' +
      'an MP4 by WebCodecs in the render worker, and it keeps playing across the navigation because playback is ' +
      'reference-counted by source rather than owned by a node. Sound comes from one audio element on the shell, ' +
      'behind AudioService; the queue lives on the application worker; and the now-playing bar across the bottom ' +
      'stays put through every navigation.',
    source: 'apps/playground/src/examples/TransitionsExampleApp.tsx',
    tags: [
      'shared elements',
      'route transitions',
      'presence',
      'video',
      'WebCodecs',
      'audio',
      'channels',
      'app worker',
      'JSX',
      'render worker'
    ]
  },
  {
    route: 'example-layout',
    title: 'Layout an application can shape',
    description:
      'A masonry wall arranged by a layout the application wrote itself: each tile is measured once at the column ' +
      'width and dropped into the shortest column, and the wall decides its own column count, so it goes from three ' +
      'columns to one as the window narrows without a breakpoint anywhere. Above it, two panels that become one ' +
      'stack when the column they are in runs out of room, decided by that container width rather than by the ' +
      "window's. Below it, rows inset from the edge the reading starts at, which move to the other side when Mirror " +
      'is pressed. And a bar across the bottom that publishes the seventy-two pixels it occupies, so the page keeps ' +
      'clear of it without knowing it is there. Turn on Inspect layout and hover the wall: the masonry explains its ' +
      'own arrangement, which the engine cannot, because the engine did not do it.',
    source: 'apps/playground/src/examples/LayoutExampleApp.tsx',
    tags: ['custom layout', 'container queries', 'insets', 'right to left', 'JSX', 'render worker']
  },
  {
    route: 'example-signin',
    title: 'Sign in with a passcode',
    description:
      'A sign-in screen of the kind a banking or device app shows: a six-digit keypad, dots that fill as you type, ' +
      'a wrong-code state, a lockout with a countdown after three attempts, a remember-this-device switch, and the ' +
      'account screen it unlocks. Written entirely in JSX as functional components over one channel, whose ' +
      'authentication runs on the application worker, rendering in ' +
      'the render worker. The passcode is 246813.',
    source: 'apps/playground/src/examples/SignInExampleApp.tsx',
    tags: ['JSX', 'functional components', 'store', 'theme colors', 'render worker']
  },
  {
    route: 'example-notes',
    title: 'Notes',
    description:
      'A notes app you can type into: a list of notes, a single-line title and a multi-line body. Caret, selection, ' +
      'word and line navigation, undo, copy, cut and paste, and IME composition for CJK input all work, with the text ' +
      'edited in the render worker and only a hidden textarea on the main thread. Copy note uses the clipboard ' +
      'through the ShellService.',
    source: 'apps/playground/src/examples/NotesExampleApp.tsx',
    tags: ['text editing', 'IME', 'clipboard', 'JSX', 'store', 'render worker']
  },
  {
    route: 'example-theme',
    title: 'Theming',
    description:
      'A settings pane wired to the page it restyles: pick a palette, an accent, how square the corners are and how ' +
      'big the text is, and the whole page repaints. Nothing below the root names a color — each one is a palette ' +
      'name, resolved against whatever theme the node inherits — and no node is rebuilt, which the timestamp under ' +
      'the preview is there to prove. The environment is scoped, so every palette chip paints itself in the palette ' +
      'it offers, and one card in the preview runs under a theme of its own.',
    source: 'apps/playground/src/examples/ThemeExampleApp.tsx',
    tags: ['theme', 'environment', 'palette names', 'typography', 'JSX', 'render worker']
  },
  {
    route: 'example-live',
    title: 'Live feed',
    description:
      'An operations board fed by a stream that never stops: three channels with a forty-bar sparkline each, a ' +
      'saturation meter, a rolling event log and a scanner, sampling at up to 60 Hz. Every moving thing is a prop ' +
      'bound to an Observable, so a few thousand property updates a second reach the canvas over a tree that is ' +
      'built exactly once — which the panel on the left proves by counting both. Pause it, change the rate, or ' +
      'inject a spike and watch a threshold crossing repaint forty bars from one push.',
    source: 'apps/playground/src/examples/LiveExampleApp.tsx',
    tags: ['bindings', 'observables', 'no rebuilds', 'streaming data', 'JSX', 'render worker']
  },
  {
    route: 'example-router',
    title: 'Routing',
    description:
      'A mail app in three nested levels — a folder rail, a message list, a message — where every screen is a route ' +
      'and every route is a full path whose params the compiler checks. The layout is mounted once and stays mounted ' +
      'while folders and messages change under it, and walking from one message to the next rebuilds nothing at all: ' +
      'the same screen follows the param. Settings is behind a guard that redirects to a sign-in and replaces the ' +
      'entry rather than pushing it. The address bar follows every navigation and the browser’s own Back and Forward ' +
      'walk them, because the only thing routing puts on the wire is a url.',
    source: 'apps/playground/src/examples/RouterExampleApp.tsx',
    tags: ['routing', 'nested outlets', 'typed params', 'guards', 'history', 'render worker']
  },
  {
    route: 'example-animation',
    title: 'A board that moves',
    description:
      'A sprint board where every movement is animated and nothing re-renders. Cards spring between lanes and ' +
      'shove their neighbours aside, one grows when you open it, and an undo bar slides in — then slides out ' +
      'before it is forgotten. All four ways of asking for motion are side by side: a transition prop, a layout ' +
      'modifier, a spring on a cell, and a tween whose completion drives what happens next. The ticks reading in ' +
      'the bar is the animation phase itself, and it falls back to 0.00 ms whenever the board is still, because ' +
      'an idle app schedules no frames at all.',
    source: 'apps/playground/src/examples/AnimationExampleApp.tsx',
    tags: ['animation', 'transitions', 'springs', 'layout animation', 'reduced motion', 'JSX', 'render worker']
  },
  {
    route: 'example-input',
    title: 'Gestures and shortcuts',
    description:
      'The four gestures an application reaches for and a canvas framework usually leaves you to write yourself. A ' +
      'photo that zooms about the point your fingers are on, or that Ctrl and the wheel zooms, and that lands back ' +
      'exactly where it started after the same number of notches each way. Chips carried between two trays, where ' +
      'the tray that would take one says so, and a list whose rows reorder as the carried row crosses them and ' +
      'which scrolls itself when a row is held at its edge. A palette on Ctrl+K listing every command that is live ' +
      'right now, which is the same question the key handler asks, so it cannot offer one that would not fire. And ' +
      'a right-click, or a finger held on a row, opening a menu the framework raised rather than the page guessed ' +
      'at. Every one of them is a modifier on an element.',
    source: 'apps/playground/src/examples/InputExampleApp.tsx',
    tags: ['drag and drop', 'pinch', 'shortcuts', 'context menu', 'modifiers', 'JSX', 'render worker']
  },
  {
    route: 'example-paint',
    title: 'Painting',
    description:
      'The part of the framework an application reaches by writing a function rather than setting a property. A ' +
      'sparkline, a gauge, three vector paths and a frosted mask, all drawn through one surface that names no ' +
      'renderer: switch between Canvas2D and WebGPU with the button in the header and nothing on the page is ' +
      'written twice, because the calls are recorded once and rasterised once and both backends draw the result. ' +
      'Each painter runs when its inputs change and not once per frame, so a still page draws four images and ' +
      'runs no drawing code at all.',
    source: 'apps/playground/src/examples/PaintApp.tsx',
    tags: ['painting', 'vector paths', 'both renderers', 'clip and blur', 'JSX', 'render worker']
  }
];
