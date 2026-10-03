/**
 * Accessibility mirror check.
 *
 * Starts the Vite dev server for each application it covers, opens a
 * route in headless Chrome, and reads **Chrome's own computed
 * accessibility tree** —
 * the tree a screen reader consumes, not the DOM the mirror writes.
 * That distinction is the whole value of this gate: an element with
 * the right attributes can still be ignored by the platform (hidden,
 * empty, presentational), and only the computed tree says so.
 *
 * It then presses a mirrored control the way an assistive technology
 * does — a synthesised `click`, which is what "do default action" on
 * macOS and `Invoke` on Windows produce — and checks the application
 * reacted, so the path back from the mirror is covered too.
 *
 * Chrome is driven over its DevTools protocol from `lib/devtools.ts`,
 * for the reason `check-webgpu-parity.ts` gives. VoiceOver and NVDA
 * cannot be automated from here, and this is deliberately not a claim
 * that they work: it is the strongest evidence a Linux CI machine can
 * produce, and F6b's decision record says exactly what it does and
 * does not cover.
 *
 * It also writes, per route, an **accessibility report**: every node of
 * the computed tree with its role, name, states and value, and a count
 * of the controls, with any control that has no accessible name listed
 * as a failure. The reports live in `apps/playground/accessibility/` and are
 * compared with the committed copy on every run, like the API reports,
 * so a change to what a screen reader would hear shows up as a diff.
 * They are also the script a screen-reader session follows: each row is
 * a thing to reach and a name to expect to hear.
 *
 * **The browser is offline.** Every route runs with name resolution
 * turned off for everything but localhost, so the two applications that
 * read Audius (the playlists example and Segue) fall back to their
 * committed snapshots. That is the only way these reports can be
 * compared byte for byte: a play count on a live shelf moves between
 * one run and the next, and a report that drifts on its own teaches a
 * reader to ignore the diff. What is lost is nothing this gate measures:
 * an accessible name is written by the screen, not by the network.
 *
 *   pnpm check:a11y            # verify; fails on drift and on an unnamed control
 *   pnpm check:a11y:update     # rewrite the reports
 *   CHROME_BIN=/path/to/chrome pnpm check:a11y
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runA11yChecks, type AppUnderTest, type RouteCheck } from './lib/a11y.ts';

const UPDATE = process.argv.includes('--update');
const REPORT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'playground', 'accessibility');

/**
 * The applications this gate covers, and how a route of each becomes a
 * url.
 *
 * Two, and they address a route differently: the playground routes off
 * the fragment, and Segue routes off the path, because its urls are
 * Audius's own and have to survive being pasted somewhere. So the app
 * says how to build the url rather than the check doing it.
 *
 * The ports are this script's own, as every script under `scripts/`
 * takes a pair nothing else uses: a dev server somebody has open, and
 * the screenshot gate running beside this one, must both be able to
 * hold theirs at the same time.
 */
interface AppUnderTest {
  /** The Vite root, from the repository root. */
  readonly root: string;
  readonly port: number;
  /** The part of the url after the origin, from what the check names. */
  url(route: string): string;
}

const APPS = {
  playground: { root: 'apps/playground', port: 5192, url: (route: string) => `/#${route}` }
} as const satisfies Record<string, AppUnderTest>;

type AppName = keyof typeof APPS;

const CHECKS: readonly (RouteCheck & { readonly app: AppName })[] = [
  {
    app: 'playground',
    route: 'example-signin',
    expect: [
      { role: 'button', name: '1' },
      { role: 'button', name: '5' },
      { role: 'button', name: 'Delete' },
      { role: 'button', name: 'Forgot passcode' },
      { role: 'group', name: 'Passcode keypad' },
      // A live region: its text is announced as digits are entered.
      { role: 'status', name: 'Passcode, 0 of 6 digits entered' },
      { role: 'switch', name: 'Remember this device', states: { checked: true } },
      { role: 'StaticText', name: 'Enter your 6-digit passcode' },
      { role: 'StaticText', name: 'Welcome back' }
    ],
    press: {
      role: 'button',
      name: '5',
      after: { role: 'status', name: 'Passcode, 1 of 6 digits entered' }
    },
    // After the press above, not from nothing: an assistive
    // technology's press focuses the node it presses, exactly as a
    // mouse press does, so the next tab stop is the key after '5'.
    focusAfterTab: { role: 'button', name: '6' }
  },
  {
    // The list half of F6b's exit criterion, and the one screen where
    // the focused element is the editing proxy rather than a mirrored
    // one — see `SemanticsMirror.applyFocus`.
    app: 'playground',
    route: 'example-notes',
    expect: [
      { role: 'list', name: 'Notes' },
      { role: 'listitem', name: 'Welcome to Gesso notes' },
      { role: 'listitem', name: 'Groceries' },
      { role: 'button', name: 'New note' },
      // The editable's text is its accessibility value, so a screen
      // reader can read the note and not only find it.
      { role: 'textbox', name: 'Note title', value: 'Welcome to Gesso notes' }
    ],
    press: {
      role: 'listitem',
      name: 'Groceries',
      after: { role: 'textbox', name: 'Note title', value: 'Groceries' }
    }
  },
  {
    // The playlists app: the third route A3 names, with a list, its
    // player controls and the shared-element transitions behind them.
    app: 'playground',
    route: 'example-transitions',
    expect: [
      // A card is a group holding its own controls; opening it is the
      // title's job. As a button, the card hid all four from the tree.
      { role: 'group', name: 'Deep House Vol.1' },
      { role: 'button', name: 'Deep House Vol.1' },
      { role: 'button', name: 'Play' },
      { role: 'button', name: 'Shuffle' },
      { role: 'button', name: 'Save to your library' },
      { role: 'button', name: 'Like this playlist' }
    ]
  }
];

runA11yChecks({
  apps: APPS,
  checks: CHECKS,
  reportDir: REPORT_DIR,
  update: UPDATE,
  updateCommand: 'pnpm check:a11y:update',
  reportNote: [
    'The browser has no name resolution but localhost, so an application that',
    'reads Audius shows its committed snapshot. A report of a live shelf could',
    'not be compared with anything.'
  ].join('\n')
})
  .then(failures => {
    if (failures.length > 0) {
      throw new Error(`Accessibility mirror check failed:\n  ${failures.join('\n  ')}`);
    }
    console.log('Accessibility mirror ok.');
  })
  .catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
