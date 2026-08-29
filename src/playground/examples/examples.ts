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
  }
];
