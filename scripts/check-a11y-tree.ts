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
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DevTools, findChrome, openPage, waitFor } from './lib/devtools.ts';

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

/**
 * No name resolves but localhost's.
 *
 * A browser-wide flag rather than the DevTools network domain, because
 * the requests to block are made by workers, and a worker is a target
 * of its own that the page's client never sees.
 */
const OFFLINE_FLAGS = ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'];

/**
 * Roles a person operates. A node with one of these and no accessible
 * name is a control a screen reader can only call by its role, which is
 * the one thing the reports refuse to accept.
 */
const CONTROL_ROLES = new Set([
  'button',
  'checkbox',
  'switch',
  'radio',
  'slider',
  'spinbutton',
  'textbox',
  'searchbox',
  'combobox',
  'option',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'treeitem',
  'link'
]);
const DEVTOOLS_PORT = 9342;
const READY_TIMEOUT_MS = 45_000;

interface AxNode {
  nodeId: string;
  ignored?: boolean;
  role?: { value?: string };
  name?: { value?: string };
  childIds?: string[];
  backendDOMNodeId?: number;
  value?: { value?: unknown };
  properties?: { name: string; value: { value?: unknown } }[];
}

/** One line of the expected tree: a role, its accessible name, and any states. */
interface Expectation {
  readonly role: string;
  readonly name: string;
  readonly states?: Readonly<Record<string, unknown>>;
  /** The accessibility tree's value for the node, when it should have one. */
  readonly value?: string;
}

interface RouteCheck {
  /** Which application serves it. */
  readonly app: AppName;
  /** Names the report, `apps/playground/accessibility/<route>.md`, and every message. */
  readonly route: string;
  /**
   * What to hand the application's `url`, when that is not the route's
   * name. Segue's routes are paths and its report names are not, so
   * every Segue check says both.
   */
  readonly path?: string;
  /** Every one of these must appear in the mirror's computed tree. */
  readonly expect: readonly Expectation[];
  /**
   * A press an assistive technology would make, and what the tree must
   * say afterwards.
   */
  readonly press?: { readonly name: string; readonly role: string; readonly after: Expectation };
  /** Where one Tab from the top of the route must leave the platform's focus. */
  readonly focusAfterTab?: Expectation;
}

const CHECKS: readonly RouteCheck[] = [
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

async function main(): Promise<void> {
  const chrome = findChrome();
  const profiles: string[] = [];
  const servers: ChildProcess[] = [];
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;
  const failures: string[] = [];
  try {
    // One server per application, started up front and left running for
    // the whole pass: Vite's first request for a route compiles the
    // application, and starting it again per route would pay for that
    // once per report.
    for (const name of new Set(CHECKS.map(check => check.app))) {
      const app = APPS[name];
      servers.push(spawn('npx', ['vite', app.root, '--port', String(app.port), '--strictPort'], { stdio: 'ignore' }));
      await waitFor(
        `Vite to serve ${name}`,
        async () => ((await fetch(`http://localhost:${app.port}/`)).ok ? true : undefined),
        30_000
      );
    }

    for (const check of CHECKS) {
      const app = APPS[check.app];
      const url = `http://localhost:${app.port}${app.url(check.path ?? check.route)}`;
      // A profile per route: two browsers sharing one directory race
      // on teardown, and the notes example writes to OPFS, which is
      // inside the profile — a shared one would carry a route's data
      // into the next run.
      const profile = mkdtempSync(join(tmpdir(), 'gesso-a11y-'));
      profiles.push(profile);
      ({ browser, devtools } = await openPage(chrome, {
        url,
        devtoolsPort: DEVTOOLS_PORT,
        windowSize: [1400, 900],
        profileDir: profile,
        flags: OFFLINE_FLAGS
      }));
      try {
        failures.push(...(await checkRoute(devtools, check)));
      } finally {
        await stop(devtools, browser);
        devtools = undefined;
        browser = undefined;
      }
    }
  } finally {
    await stop(devtools, browser);
    for (const server of servers) {
      server.kill();
    }
    for (const profile of profiles) {
      // Chrome writes as it exits, so a removal racing its teardown
      // fails with ENOTEMPTY on a directory that is about to be empty.
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }

  if (failures.length > 0) {
    throw new Error(`Accessibility mirror check failed:\n  ${failures.join('\n  ')}`);
  }
}

/**
 * Ends a browser and waits for the debugging port to come free.
 *
 * Every route opens its own Chrome on the same port, so the next one
 * cannot start until this one has let go of it, and killing the process
 * Node spawned does not do that: Chrome re-executes itself as it
 * starts, so by the time a route is finished that process has usually
 * exited already and the browser still holding the port is a grandchild
 * that outlived it. Asking the browser to close over the protocol is
 * what actually ends it, and the kill is only there for a browser that
 * never answered. Before this, one route failing left a headless Chrome
 * on the machine that failed every later run with nothing but a timeout
 * to say why.
 */
async function stop(devtools: DevTools | undefined, browser: ChildProcess | undefined): Promise<void> {
  devtools?.close();
  try {
    // The browser endpoint, not the page's: `Browser.close` is a
    // browser-level command and a page's session does not answer it.
    const version = (await (await fetch(`http://localhost:${DEVTOOLS_PORT}/json/version`)).json()) as {
      webSocketDebuggerUrl: string;
    };
    const client = await DevTools.connect(version.webSocketDebuggerUrl);
    await client.send('Browser.close', {}, 5_000).catch(() => undefined);
    client.close();
  } catch {
    // No endpoint to ask: the kill below is all there is.
  }
  browser?.kill();
  await waitFor(
    'the debugging port to come free',
    async () => {
      try {
        await fetch(`http://localhost:${DEVTOOLS_PORT}/json/version`);
        return undefined;
      } catch {
        return true;
      }
    },
    10_000
  ).catch(() => undefined);
}

async function checkRoute(devtools: DevTools, check: RouteCheck): Promise<string[]> {
  await devtools.send('Accessibility.enable');
  // The mirror is filled by the render worker's first frame, so the
  // wait is for content rather than for load.
  await waitFor(
    `the ${check.route} route to mirror its semantics`,
    async () => {
      const count = await devtools.evaluate<number>(`document.querySelectorAll('[data-gesso-semantics] *').length`);
      return count > 0 ? count : undefined;
    },
    READY_TIMEOUT_MS
  );

  // The expectations are the wait condition, not something checked
  // once: a route whose data arrives from a worker (the notes example
  // reads OPFS) mirrors an empty screen first and fills it a moment
  // later, and a gate that looked once would be testing the loading
  // state.
  let nodes = await mirrorTree(devtools);
  const settledTree = await waitFor(
    `the ${check.route} route to mirror everything expected of it`,
    async () => {
      nodes = await mirrorTree(devtools);
      return check.expect.every(expectation => missing(nodes, expectation) === undefined) ? true : undefined;
    },
    READY_TIMEOUT_MS
  ).catch(() => false);
  // The expectations say what must be present; they cannot say what has
  // stopped arriving. A route whose last arrival nobody thought to
  // expect gets captured mid-flight, and the gate then fails at random
  // against a report that was generated on a luckier run. So after the
  // expectations are met the tree is sampled again, and it is believed
  // only once two samples agree.
  nodes = await stillTree(devtools, nodes);
  report(check.route, nodes);
  const failures: string[] = [];
  const tabOrder = await tabThrough(devtools, nodes);
  failures.push(...reportFile(check, nodes, tabOrder));
  if (!settledTree) {
    for (const expectation of check.expect) {
      const failure = missing(nodes, expectation);
      if (failure !== undefined) {
        failures.push(`${check.route}: ${failure}`);
      }
    }
  }

  const press = check.press;
  if (press !== undefined) {
    // Exactly what an assistive technology's "press" produces: a click
    // on the mirrored element, with no pointer anywhere near the canvas.
    const clicked = await devtools.evaluate<boolean>(
      `(() => {
         const wanted = ${JSON.stringify(press.name)};
         for (const el of document.querySelectorAll('[data-gesso-semantics] [role=${JSON.stringify(press.role)}]')) {
           if ((el.getAttribute('aria-label') ?? el.textContent) === wanted) { el.click(); return true; }
         }
         return false;
       })()`
    );
    if (!clicked) {
      failures.push(`${check.route}: no mirrored ${press.role} named ${press.name} to press`);
    } else {
      const settled = await waitFor(
        `the ${check.route} route to react to a press on ${press.name}`,
        async () => {
          nodes = await mirrorTree(devtools);
          return missing(nodes, press.after) === undefined ? true : undefined;
        },
        10_000
      ).catch(() => false);
      if (!settled) {
        failures.push(
          `${check.route}: pressing the mirrored ${press.role} '${press.name}' did not reach the application ` +
            `(expected ${describe(press.after)} afterwards)`
        );
      }
    }
  }

  const tab = check.focusAfterTab;
  if (tab !== undefined) {
    // A real key, delivered to the page: the shell forwards it to the
    // render worker, the focus manager moves the app's focus, and the
    // mirror moves the platform's to match.
    await devtools.evaluate<void>(`document.querySelector('canvas').focus()`);
    await devtools.pressKey('Tab', 'Tab', 9);
    const focused = await waitFor(
      `Tab to focus the ${describe(tab)}`,
      async () => {
        nodes = await mirrorTree(devtools);
        const node = nodes.find(entry =>
          (entry.properties ?? []).some(property => property.name === 'focused' && property.value.value === true)
        );
        if (node === undefined) {
          return undefined;
        }
        return node.role?.value === tab.role && (node.name?.value ?? '') === tab.name ? true : undefined;
      },
      10_000
    ).catch(() => false);
    if (!focused) {
      const named = nodes
        .filter(entry => (entry.properties ?? []).some(property => property.name === 'focused'))
        .map(entry => `${entry.role?.value} '${entry.name?.value ?? ''}'`);
      failures.push(
        `${check.route}: Tab did not leave the ${describe(tab)} focused in the accessibility tree ` +
          `(focused: ${named.length === 0 ? 'nothing in the mirror' : named.join(', ')})`
      );
    }
  }
  return failures;
}

/**
 * How long the tree must go unchanged before it is believed, and how
 * many times to ask.
 *
 * Two hundred milliseconds is longer than a frame and longer than the
 * mirror takes to describe a change, and eight tries is a second and a
 * half, which is longer than anything in these routes takes to settle
 * once its data has arrived. A route that never settles is reported as
 * it last looked rather than hanging the gate: the mismatch that
 * follows is a truer complaint than a timeout.
 */
const STILL_MS = 200;
const STILL_TRIES = 8;

/** What a report would say, cheaply, so two trees can be compared. */
function asHeard(nodes: readonly AxNode[]): string {
  return nodes.map(node => `${node.role?.value ?? ''}\u0000${node.name?.value ?? ''}`).join('\u0001');
}

/** The tree, once it has stopped changing. */
async function stillTree(devtools: DevTools, seen: readonly AxNode[]): Promise<AxNode[]> {
  let nodes = [...seen];
  let last = asHeard(nodes);
  for (let tries = 0; tries < STILL_TRIES; tries += 1) {
    await new Promise(resolve => setTimeout(resolve, STILL_MS));
    nodes = await mirrorTree(devtools);
    const now = asHeard(nodes);
    if (now === last) {
      return nodes;
    }
    last = now;
  }
  return nodes;
}

/** Chrome's computed accessibility nodes for the mirror's subtree. */
async function mirrorTree(devtools: DevTools): Promise<AxNode[]> {
  const { root } = (await devtools.send('DOM.getDocument', { depth: 1 })) as { root: { nodeId: number } };
  const { nodeId } = (await devtools.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '[data-gesso-semantics]'
  })) as { nodeId: number };
  if (nodeId === 0) {
    throw new Error('The page has no accessibility mirror: no [data-gesso-semantics] element.');
  }
  const { node } = (await devtools.send('DOM.describeNode', { nodeId })) as { node: { backendNodeId: number } };
  const { nodes } = (await devtools.send('Accessibility.getFullAXTree')) as { nodes: AxNode[] };
  const byId = new Map(nodes.map(entry => [entry.nodeId, entry]));
  const container = nodes.find(entry => entry.backendDOMNodeId === node.backendNodeId);
  if (container === undefined) {
    // The container itself is `generic` and may be pruned; its
    // descendants are still in the tree, so this is a real failure
    // only when nothing under it survived either.
    return nodes.filter(entry => entry.ignored !== true);
  }
  const collected: AxNode[] = [];
  const walk = (entry: AxNode): void => {
    if (entry.ignored !== true) {
      collected.push(entry);
    }
    for (const childId of entry.childIds ?? []) {
      const child = byId.get(childId);
      if (child !== undefined) {
        walk(child);
      }
    }
  };
  walk(container);
  return collected;
}

function missing(nodes: readonly AxNode[], expectation: Expectation): string | undefined {
  const matches = nodes.filter(
    node => node.role?.value === expectation.role && (node.name?.value ?? '') === expectation.name
  );
  if (matches.length === 0) {
    return `no ${describe(expectation)} in the computed accessibility tree`;
  }
  if (expectation.value !== undefined && !matches.some(node => valueOf(node) === expectation.value)) {
    return (
      `${describe(expectation)} is there, but its value is ` +
      matches.map(node => `'${valueOf(node) ?? ''}'`).join(', ') +
      ` rather than '${expectation.value}'`
    );
  }
  for (const [property, value] of Object.entries(expectation.states ?? {})) {
    // Loose, because Chrome reports a tristate as the string 'true'
    // and a boolean as `true`, and this gate is about whether the
    // state reached the platform at all.
    const found = matches.some(node =>
      (node.properties ?? []).some(entry => entry.name === property && String(entry.value.value) === String(value))
    );
    if (!found) {
      return `${describe(expectation)} is there, but not ${property}=${String(value)}`;
    }
  }
  return undefined;
}

function valueOf(node: AxNode): string | undefined {
  return typeof node.value?.value === 'string' ? node.value.value : undefined;
}

function describe(expectation: Expectation): string {
  return `${expectation.role} named '${expectation.name}'`;
}

/**
 * Writes or verifies the route's report, and returns the controls that
 * have no name, which fail the gate whether or not the report matched.
 */
function reportFile(check: RouteCheck, nodes: readonly AxNode[], tabOrder: readonly string[]): string[] {
  const route = check.route;
  const unnamed = nodes.filter(node => CONTROL_ROLES.has(node.role?.value ?? '') && (node.name?.value ?? '') === '');
  const controls = nodes.filter(node => CONTROL_ROLES.has(node.role?.value ?? ''));
  const unreachable = controls.map(describeNode).filter(name => !tabOrder.includes(name));
  const content = renderReport(APPS[check.app].url(check.path ?? route), nodes, unnamed, tabOrder, unreachable);
  const path = join(REPORT_DIR, `${route}.md`);
  const failures = unnamed.map(node => `${route}: a ${node.role?.value} with no accessible name`);
  for (const name of unreachable) {
    failures.push(`${route}: Tab never reaches the ${name}`);
  }
  const unnamedStop = tabOrder.find(entry => entry.startsWith(UNNAMED_STOP));
  if (unnamedStop !== undefined) {
    failures.push(`${route}: Tab lands on ${unnamedStop}; a screen reader hears nothing there`);
  }
  if (UPDATE) {
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(path, content);
    console.log(`  wrote ${path}`);
    return failures;
  }
  if (!existsSync(path)) {
    failures.push(`${route}: no report at ${path}. Run \`pnpm check:a11y:update\` and commit it.`);
  } else if (readFileSync(path, 'utf8') !== content) {
    failures.push(
      `${route}: what a screen reader would hear has changed; the report at ${path} no longer matches. ` +
        `Review the diff after \`pnpm check:a11y:update\` and commit it if the change is intended.`
    );
  }
  return failures;
}

/** The report: one row per node of the computed tree, in tree order, and a count of controls. */
function renderReport(
  title: string,
  nodes: readonly AxNode[],
  unnamed: readonly AxNode[],
  tabOrder: readonly string[],
  unreachable: readonly string[]
): string {
  const controls = nodes.filter(node => CONTROL_ROLES.has(node.role?.value ?? ''));
  // InlineTextBox rows repeat their StaticText parent word for word;
  // a screen reader speaks the text once, so the report lists it once.
  const rows = nodes
    .filter(node => !['generic', 'none', 'InlineTextBox'].includes(node.role?.value ?? ''))
    .map(node => {
      const role = node.role?.value ?? '?';
      const name = node.name?.value ?? '';
      const states = (node.properties ?? [])
        .filter(property => !['focusable', 'editable', 'settable', 'multiline', 'readonly'].includes(property.name))
        .map(property => `${property.name}=${String(property.value.value)}`)
        .join(', ');
      const value = valueOf(node) ?? '';
      return `| ${cell(role)} | ${cell(name)} | ${cell(states)} | ${cell(value)} |`;
    });
  return [
    `# Accessibility report: \`${title}\``,
    '',
    'Generated by `pnpm check:a11y:update` from the accessibility tree Chrome',
    'computes for the semantics mirror, in tree order. Each row is a thing a',
    'screen reader can reach and the name it will speak. Regenerate after a',
    'change to the route and review the diff.',
    '',
    'The browser has no name resolution but localhost, so an application that',
    'reads Audius shows its committed snapshot. A report of a live shelf could',
    'not be compared with anything.',
    '',
    '| Role | Name | States | Value |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '## Controls',
    '',
    `${controls.length} controls (${[...CONTROL_ROLES].filter(role => controls.some(node => node.role?.value === role)).join(', ')}), ` +
      (unnamed.length === 0
        ? 'every one of them named.'
        : `**${unnamed.length} with no accessible name**: ${unnamed.map(node => node.role?.value).join(', ')}.`),
    '',
    '## Tab order',
    '',
    'What the Tab key reaches from the top of the route, in order, as the',
    'accessibility tree reports focus after each press.',
    '',
    ...tabOrder.map((name, index) => `${index + 1}. ${name}`),
    '',
    unreachable.length === 0
      ? 'Every control above is in this list.'
      : `**Not reached by Tab**: ${unreachable.join(', ')}.`,
    ''
  ].join('\n');
}

/** A node as the report names it: role and accessible name. */
function describeNode(node: AxNode): string {
  return `${node.role?.value ?? '?'} '${spoken(node.name?.value ?? '')}'`;
}

/**
 * A name as it is heard rather than as it is written.
 *
 * Chrome collapses the whitespace of a computed accessible name and a
 * screen reader speaks it that way, but the mirror's `aria-label` keeps
 * the string the application wrote. A track whose title ends in a space
 * is therefore two different names depending on which side it is read
 * from, and the tab walk reported a control it had just visited as one
 * Tab never reached. Both sides go through here.
 */
function spoken(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/**
 * Presses Tab from the top of the route until focus stops moving or
 * returns to a node already visited, and returns the nodes it reached.
 *
 * Focus is read from `document.activeElement` rather than from the
 * accessibility tree's `focused` flag, because a text box's focus lives
 * on the editing proxy, a textarea outside the mirror that carries the
 * field's role and name (`SemanticsMirror.applyFocus`); the tree would
 * report nothing focused and the pass would stop at the first field.
 * The wait per press is for focus to move, not a fixed delay: the shell
 * forwards the key, the render worker moves focus, and the mirror or
 * the proxy takes the platform's.
 */
async function tabThrough(devtools: DevTools, before: readonly AxNode[]): Promise<string[]> {
  const controls = before.filter(node => CONTROL_ROLES.has(node.role?.value ?? '')).length;
  await devtools.evaluate<void>(`document.querySelector('canvas').focus()`);
  const visited: string[] = [];
  let previous = await activeElement(devtools);
  let unnamedStops = 0;
  for (let press = 0; press < controls * 2 + 16; press++) {
    await devtools.pressKey('Tab', 'Tab', 9);
    const focused = await settledFocus(devtools, previous);
    if (focused === null) {
      break; // nothing moved: the order is exhausted
    }
    if (focused === UNNAMED_STOP) {
      // The app focused a node that has no semantics record, so the
      // mirror put DOM focus back on the canvas: a Tab stop a screen
      // reader hears nothing at. Recorded once each, and a failure.
      unnamedStops++;
      previous = focused;
      if (unnamedStops > controls + 4) {
        break;
      }
      continue;
    }
    visited.push(focused);
    previous = focused;
    if (visited.length >= controls + 3) {
      break; // enough presses to have wrapped, whatever the order
    }
  }
  const order = withoutWrap(visited);
  if (unnamedStops > 0) {
    order.push(`${UNNAMED_STOP} (${unnamedStops} stops)`);
  }
  return order;
}

/**
 * The walk up to the point it started repeating. A repeated name alone
 * is not a wrap, because two controls may share one (every playlist
 * card has a Save button); a wrap is the sequence starting over, so the
 * cut is where the first two stops recur in order.
 */
function withoutWrap(stops: readonly string[]): string[] {
  for (let k = 1; k < stops.length; k++) {
    if (stops[k] === stops[0] && (k + 1 >= stops.length || stops[k + 1] === stops[1])) {
      return stops.slice(0, k);
    }
  }
  return [...stops];
}

const UNNAMED_STOP = 'a focusable node with no semantics';

/**
 * Where focus comes to rest after a key: a value different from
 * `previous` that then holds for three consecutive reads. Focus leaving
 * the editing proxy passes through the canvas for an instant before the
 * mirror focuses the next control, and a single read would take that
 * instant for a stop of its own. Null when nothing moved in time.
 *
 * A reading of nothing at all is never a stop. The mirror rebuilds its
 * elements as the frame that moved focus is described, and between the
 * old element going and the new one taking focus the document has none:
 * a walk that accepted that took it for the end of the order and
 * stopped, on a page whose next press was a perfectly ordinary button.
 */
async function settledFocus(devtools: DevTools, previous: string): Promise<string | null> {
  const deadline = Date.now() + 1_500;
  let candidate: string | null = null;
  let held = 0;
  while (Date.now() < deadline) {
    const active = await activeElement(devtools);
    if (active === '') {
      candidate = null;
      held = 0;
    } else if (active !== previous && active === candidate) {
      held++;
      if (held >= 3) {
        return active;
      }
    } else {
      candidate = active === previous ? null : active;
      held = candidate === null ? 0 : 1;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return null;
}

/** The focused element as the report names nodes: role and name; the canvas means the app focused something unmirrored. */
async function activeElement(devtools: DevTools): Promise<string> {
  return devtools.evaluate<string>(
    `(() => {
       const el = document.activeElement;
       if (!el || el === document.body) return '';
       if (el.tagName === 'CANVAS') return ${JSON.stringify(UNNAMED_STOP)};
       const role = el.getAttribute('role');
       if (role === null) return '';
       const name = el.getAttribute('aria-label') ?? el.textContent ?? '';
       return role + " '" + name.replace(/\\s+/g, ' ').trim() + "'";
     })()`
  );
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function report(route: string, nodes: readonly AxNode[]): void {
  const lines = nodes
    .filter(node => (node.name?.value ?? '') !== '' || node.role?.value !== 'generic')
    .map(node => `    ${node.role?.value ?? '?'}${node.name?.value ? ` '${node.name.value}'` : ''}`);
  console.log(`  #${route}: ${nodes.length} nodes in the mirror's computed tree`);
  if (process.env.A11Y_VERBOSE !== undefined) {
    console.log(lines.join('\n'));
  }
}

main()
  .then(() => console.log('Accessibility mirror ok.'))
  .catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
