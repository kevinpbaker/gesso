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
    route: 'example-signin',
    title: 'Sign in with a passcode',
    description:
      'A sign-in screen of the kind a banking or device app shows: a six-digit keypad, dots that fill as you type, ' +
      'a wrong-code state, a lockout with a countdown after three attempts, a remember-this-device switch, and the ' +
      'account screen it unlocks. Written entirely in JSX as functional components over one store, rendering in ' +
      'the render worker. The passcode is 246813.',
    source: 'src/playground/examples/SignInExampleApp.tsx',
    tags: ['JSX', 'functional components', 'store', 'theme colors', 'render worker']
  },
  {
    route: 'example-notes',
    title: 'Notes',
    description:
      'A notes app you can type into: a list of notes, a single-line title and a multi-line body. Caret, selection, ' +
      'word and line navigation, undo, copy, cut and paste, and IME composition for CJK input all work, with the text ' +
      'edited in the render worker and only a hidden textarea on the main thread. Copy note uses the clipboard ' +
      'through the ShellStore.',
    source: 'src/playground/examples/NotesExampleApp.tsx',
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
    source: 'src/playground/examples/ThemeExampleApp.tsx',
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
    source: 'src/playground/examples/LiveExampleApp.tsx',
    tags: ['bindings', 'observables', 'no rebuilds', 'streaming data', 'JSX', 'render worker']
  },
  {
    route: 'example-animation',
    title: 'A board that moves',
    description:
      'A sprint board where every movement is animated and nothing re-renders. Cards spring between lanes and ' +
      'shove their neighbours aside, a card grows when you open it, pressing one springs it under your finger, ' +
      'and an undo bar slides in and — the harder half — slides out before it is forgotten. The four ways to ask ' +
      'for motion are all here: a `transition` prop on an element, an `animateLayout` modifier, a spring on a ' +
      'cell, and a tween whose completion drives what happens next. The picker changes how the board moves; the ' +
      '`ticks` reading in the bar is the animation phase itself, and it falls back to 0.00 ms whenever the board ' +
      'is still, because an idle app schedules no frames at all. Reduced motion is honoured rather than ignored.',
    source: 'src/playground/examples/AnimationExampleApp.tsx',
    tags: ['animation', 'transitions', 'springs', 'layout animation', 'reduced motion', 'JSX', 'render worker']
  }
];
