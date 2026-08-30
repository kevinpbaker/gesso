/**
 * Accessibility mirror check (ROADMAP.md F6b).
 *
 * Starts the Vite dev server, opens a playground route in headless
 * Chrome, and reads **Chrome's own computed accessibility tree** —
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
 *   pnpm check:a11y
 *   CHROME_BIN=/path/to/chrome pnpm check:a11y
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DevTools, findChrome, openPage, waitFor } from './lib/devtools.ts';

const VITE_PORT = 5189;
const DEVTOOLS_PORT = 9339;
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
  readonly route: string;
  /** Every one of these must appear in the mirror's computed tree. */
  readonly expect: readonly Expectation[];
  /**
   * A press an assistive technology would make, and what the tree must
   * say afterwards.
   */
  readonly press?: { readonly name: string; readonly role: string; readonly after: Expectation };
}

const CHECKS: readonly RouteCheck[] = [
  {
    route: 'example-signin',
    expect: [
      { role: 'button', name: '1' },
      { role: 'button', name: '5' },
      { role: 'button', name: 'Delete' },
      { role: 'button', name: 'Forgot passcode' },
      { role: 'group', name: 'Passcode keypad' },
      { role: 'group', name: 'Passcode, 0 of 6 digits entered' },
      { role: 'switch', name: 'Remember this device', states: { checked: true } },
      { role: 'StaticText', name: 'Enter your 6-digit passcode' },
      { role: 'StaticText', name: 'Welcome back' }
    ],
    press: {
      role: 'button',
      name: '5',
      after: { role: 'group', name: 'Passcode, 1 of 6 digits entered' }
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
  }
];

async function main(): Promise<void> {
  const chrome = findChrome();
  const profiles: string[] = [];
  let vite: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;
  const failures: string[] = [];
  try {
    vite = spawn('npx', ['vite', 'apps/playground', '--port', String(VITE_PORT), '--strictPort'], {
      stdio: 'ignore'
    });
    await waitFor('Vite', async () => ((await fetch(`http://localhost:${VITE_PORT}/`)).ok ? true : undefined), 30_000);

    for (const check of CHECKS) {
      const url = `http://localhost:${VITE_PORT}/#${check.route}`;
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
        profileDir: profile
      }));
      try {
        failures.push(...(await checkRoute(devtools, check)));
      } finally {
        devtools.close();
        devtools = undefined;
        browser.kill();
        browser = undefined;
      }
    }
  } finally {
    devtools?.close();
    browser?.kill();
    vite?.kill();
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
  report(check.route, nodes);
  const failures: string[] = [];
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
