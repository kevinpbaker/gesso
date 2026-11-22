/**
 * The playground in Firefox and Safari: does Gesso work outside Chrome?
 *
 * Every other browser check in `scripts/` runs in Chrome, several of
 * them by design (the layout and text fixtures are Chrome's answers).
 * This one asks the question those cannot: does the framework run in
 * the other two engines people use? Not "does it match Chrome": the
 * route screenshots' baselines are Chrome on Linux and mean nothing
 * here. What it asserts, in each browser:
 *
 *   - **routes**: every playground view mounts and paints a frame that
 *     is not blank, with no error overlay and no uncaught error, from
 *     the page (an error trap injected into `index.html`) or, in
 *     Firefox, from any realm the BiDi log sees, workers included.
 *   - **accessibility**: for the routes with a committed accessibility
 *     report, the browser's own accessibility engine computes the role
 *     and name of every control the report lists, and the Tab key walks
 *     the controls in the committed order. The order is the app's, so
 *     it has to be the same in every browser.
 *   - **input**: a real pointer click on a keypad key reaches the app
 *     (the passcode's live region counts it), and real key presses in
 *     a text field reach it through the editing proxy.
 *   - **parity**: the compare route's Canvas2D and WebGPU panes agree,
 *     within the thresholds `parity:webgpu` uses.
 *   - **probes**: the pages under `scripts/` that were written to
 *     report on themselves: `rest` arguments across a real Worker, a
 *     touch drag on a surface that overflows both ways, and a real clip
 *     decoded with the platform's WebCodecs.
 *
 * What it cannot reach: VoiceOver, IME composition (WebDriver has no
 * composition events), and an iPhone's own GPU and memory. CONTRIBUTING
 * lists how those are checked by hand.
 *
 *   node scripts/check-browsers.ts --browser firefox
 *   node scripts/check-browsers.ts --browser safari
 *   node scripts/check-browsers.ts --browser ios --device "iPhone 17"
 *   node scripts/check-browsers.ts --browser firefox --headed --only routes,input --route example-notes
 *   node scripts/check-browsers.ts --browser firefox --only routes --shots /tmp/shots   # what each route drew
 *
 * Safari has to be allowed to be automated once per machine; the error
 * says how, and so does `lib/webdriver.ts`.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { allViews } from '../apps/playground/src/shell/routes.ts';
import { CONTROL_ROLES } from './lib/a11y.ts';
import {
  click,
  KEYS,
  openBrowser,
  park,
  touchDrag,
  typeKeys,
  type BrowserName,
  type BrowserPage
} from './lib/browsers.ts';
import { waitFor } from './lib/devtools.ts';
import { decodePng, paintedFraction } from './lib/png.ts';

const SECTIONS = ['routes', 'accessibility', 'input', 'parity', 'probes'] as const;
type Section = (typeof SECTIONS)[number];

const { values } = parseArgs({
  options: {
    browser: { type: 'string' },
    headed: { type: 'boolean', default: false },
    only: { type: 'string' },
    route: { type: 'string' },
    device: { type: 'string' },
    shots: { type: 'string' }
  }
});
const BROWSER = values.browser as BrowserName | undefined;
if (BROWSER !== 'firefox' && BROWSER !== 'safari' && BROWSER !== 'ios') {
  console.error(
    'Usage: node scripts/check-browsers.ts --browser firefox|safari|ios [--headed] [--only sections] [--route id]'
  );
  process.exit(2);
}
const ONLY = new Set<Section>(values.only ? (values.only.split(',') as Section[]) : SECTIONS);
const ROUTE_FILTER = values.route?.split(',');

/** Ports nothing else in `scripts/` uses. */
const PORT = 5194;
const VIEWPORT: readonly [number, number] = [1280, 900];
const repo = (...segments: string[]): string => join(import.meta.dirname, '..', ...segments);

/** The views that cannot be photographed are still checked here, except the one that never holds still. */
const SKIPPED_VIEWS: Record<string, string> = {
  benchmark: 'drives a continuous load; its frame is never the point'
};
/**
 * Views that draw with the WebGPU renderer directly, with no fallback by
 * design: they demonstrate that renderer, and say in their footer when
 * there is no adapter. In a browser with no adapter (headless Firefox)
 * they are blank, correctly, and are not checked; anywhere else blank is
 * a failure.
 */
const WEBGPU_ONLY_VIEWS = new Set(['renderers/webgpu']);
const HAS_ADAPTER = `(async () => !!(navigator.gpu && (await navigator.gpu.requestAdapter())))()`;

/**
 * Fraction of the preview that must differ from its background colour.
 * The sparsest route (a short line of text on a plain ground) paints
 * well over a percent; a cleared canvas paints zero.
 */
const MIN_PAINTED = 0.002;
const PARITY_MAX_PERCENT = Number(process.env.PARITY_MAX_PERCENT ?? '0.08');
const PARITY_MAX_GROSS_PERCENT = Number(process.env.PARITY_MAX_GROSS_PERCENT ?? '0.02');

/**
 * Collects what went wrong on the page before any script of ours could
 * run: uncaught errors, unhandled rejections, `console.error`, and a
 * worker's `error` event, which fires on the `Worker` object and never
 * reaches `window.onerror`. Injected at the top of `<head>`, so it is
 * in place before the shell's first module loads.
 */
const ERROR_TRAP = `
window.__gessoErrors = [];
(() => {
  const push = (kind, detail) => window.__gessoErrors.push(kind + ': ' + String(detail).slice(0, 400));
  addEventListener('error', event => {
    if (event.target && event.target !== window && event.target.src) push('resource', event.target.src);
    // Firefox's stack leaves the message out, so both are kept.
    else push('error', event.error ? event.error.message + '\\n' + event.error.stack : event.message);
  }, true);
  addEventListener('unhandledrejection', event => push('rejection', event.reason instanceof Error ? event.reason.message + '\\n' + event.reason.stack : event.reason));
  const error = console.error;
  console.error = (...args) => { push('console.error', args.map(String).join(' ')); error.apply(console, args); };
  const Native = window.Worker;
  window.Worker = class extends Native {
    constructor(...args) {
      super(...args);
      this.addEventListener('error', event => push('worker', event.message || 'a worker failed to start or threw with no message'));
    }
  };
})();`;

const errorTrap: Plugin = {
  name: 'gesso-check-error-trap',
  transformIndexHtml: () => [{ tag: 'script', children: ERROR_TRAP, injectTo: 'head-prepend' }]
};

const PAGE_LOADED = `(() => {
  if (document.readyState !== 'complete') return false;
  for (const image of document.images) if (!image.complete) return false;
  return document.fonts.status === 'loaded';
})()`;

/**
 * The region a route draws into, in CSS pixels, and the viewport width
 * to scale a screenshot by.
 *
 * The largest canvas in the preview, and the preview itself for the one
 * route that positions DOM boxes instead. Behind it the preview's grid
 * is replaced with a flat sentinel colour first. The grid alone is six
 * percent "painted", so with it in place a canvas that had drawn nothing
 * yet, being transparent, passed as a painted frame; that is how the
 * first version of this check passed every route before any had drawn.
 */
const PREVIEW_BOX = `(() => {
  if (!document.getElementById('gesso-check-backdrop')) {
    const style = document.createElement('style');
    style.id = 'gesso-check-backdrop';
    style.textContent = '.pg-preview { background: rgb(255, 0, 255) !important; }';
    document.head.append(style);
  }
  const root = document.querySelector('.pg-preview') ?? document.querySelector('#app') ?? document.body;
  let el = root;
  let area = 0;
  for (const canvas of root.querySelectorAll('canvas')) {
    const box = canvas.getBoundingClientRect();
    if (box.width * box.height > area) { area = box.width * box.height; el = canvas; }
  }
  const box = el.getBoundingClientRect();
  return { x: box.left, y: box.top, width: box.width, height: box.height, innerWidth };
})()`;

/** The error panel a route mounts when it fails; see `check-route-screenshots.ts`. */
const ERROR_OVERLAY = `(() => {
  const root = document.querySelector('.pg-preview') ?? document.querySelector('#app');
  if (!root) return null;
  for (const child of root.children) {
    const panel = child.shadowRoot && child.shadowRoot.querySelector('.panel[role="alert"]');
    if (panel) return (panel.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200);
  }
  return null;
})()`;

/** The mirrored element with this role and name, or null. Its name is its label, or its text. */
const MIRRORED = (role: string, name: string, then: string): string => `(() => {
  for (const el of document.querySelectorAll('[data-gesso-semantics] [role=${JSON.stringify(role)}]')) {
    const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\\s+/g, ' ').trim();
    if (label === ${JSON.stringify(name)}) { ${then} }
  }
  return null;
})()`;

const centreOf = (role: string, name: string): string =>
  MIRRORED(
    role,
    name,
    `const box = el.getBoundingClientRect();
     if (box.width === 0 || box.height === 0) return null;
     return { x: box.left + box.width / 2, y: box.top + box.height / 2 };`
  );

/** The focused element as the accessibility reports name a Tab stop: role and name. */
const ACTIVE_ELEMENT = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return '';
  if (el.tagName === 'CANVAS') return 'canvas';
  const role = el.getAttribute('role');
  if (role === null) return '';
  const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\\s+/g, ' ').trim();
  return (el.id || el.tagName) + '\\u0000' + role + " '" + name + "'";
})()`;

const failures: string[] = [];
const skipped: string[] = [];

function pass(line: string): void {
  console.log(`  ✓ ${line}`);
}
function fail(line: string): void {
  console.log(`  ✗ ${line}`);
  failures.push(line);
}
function skip(line: string): void {
  console.log(`  - ${line}`);
  skipped.push(line);
}

/**
 * A Vite dev server on `root`. `entry` is named because Vite otherwise
 * scans every HTML file under the root for dependencies, and at the
 * repository root that includes a template whose tsconfig is generated.
 */
async function serve(
  root: string,
  plugins: Plugin[] = [],
  entry = 'index.html'
): Promise<{ server: ViteDevServer; base: string }> {
  const server = await createServer({
    root,
    plugins,
    optimizeDeps: { entries: [entry] },
    logLevel: 'error',
    clearScreen: false,
    server: { port: PORT, strictPort: true, hmr: false }
  });
  await server.listen();
  return { server, base: `http://localhost:${PORT}/` };
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

/** A fresh document for every route, so one route's errors and state are not the next one's. */
async function open(page: BrowserPage, url: string): Promise<void> {
  await page.navigate('about:blank');
  await page.navigate(url);
  await waitFor(
    'the page to load its fonts and images',
    async () => (await page.evaluate<boolean>(PAGE_LOADED)) || undefined,
    30_000
  );
}

async function pageErrors(page: BrowserPage): Promise<string[]> {
  const trapped = await page.evaluate<string[] | undefined>('window.__gessoErrors');
  // Without the trap the page would report no errors whatever happened.
  return [
    ...(trapped ?? ['the error trap was not installed, so errors on this page went unseen']),
    ...page.drainLoggedErrors()
  ];
}

async function checkRoutes(page: BrowserPage, base: string): Promise<void> {
  console.log('\nroutes: every view mounts and paints, with no error');
  const views = allViews().filter(
    view => ROUTE_FILTER === undefined || ROUTE_FILTER.some(id => view.id.startsWith(id))
  );
  let hasAdapter: boolean | undefined;
  for (const view of views) {
    const skippedBecause = SKIPPED_VIEWS[view.id];
    if (skippedBecause !== undefined) {
      skip(`#${view.id}: ${skippedBecause}`);
      continue;
    }
    try {
      page.drainLoggedErrors();
      await open(page, `${base}?still#${view.id}`);
      let painted = 0;
      let shot: Uint8Array | undefined;
      await waitFor(
        `#${view.id} to paint`,
        async () => {
          const box = await page.evaluate<{ x: number; y: number; width: number; height: number; innerWidth: number }>(
            PREVIEW_BOX
          );
          shot = await page.screenshot();
          const pixels = decodePng(shot);
          const scale = pixels.width / box.innerWidth;
          painted = paintedFraction(pixels, {
            x: box.x * scale,
            y: box.y * scale,
            width: box.width * scale,
            height: box.height * scale
          });
          return painted >= MIN_PAINTED ? true : undefined;
        },
        30_000
      ).catch(() => undefined);
      if (values.shots !== undefined && shot !== undefined) {
        mkdirSync(values.shots, { recursive: true });
        writeFileSync(join(values.shots, `${BROWSER}-${view.id.replaceAll('/', '-')}.png`), shot);
      }
      // Errors a moment after the first frame count too: a worker that
      // fails on its second message still fails.
      await sleep(500);
      const overlay = await page.evaluate<string | null>(ERROR_OVERLAY);
      const errors = await pageErrors(page);
      if (painted < MIN_PAINTED && WEBGPU_ONLY_VIEWS.has(view.id)) {
        hasAdapter ??= await page.evaluate<boolean>(HAS_ADAPTER);
        if (!hasAdapter) {
          skip(`#${view.id}: draws with WebGPU only, and this browser has no adapter`);
          continue;
        }
      }
      const problems = [
        ...(painted < MIN_PAINTED ? [`painted ${(painted * 100).toFixed(2)}% of its area, so it is blank`] : []),
        // An empty panel is the overlay's host with nothing in it, which
        // `check-route-screenshots.ts` reads the same way.
        ...(overlay !== null && overlay !== '' ? [`shows its error panel: ${overlay}`] : []),
        ...errors
      ];
      if (problems.length === 0) {
        pass(`#${view.id} painted ${(painted * 100).toFixed(1)}% of its area`);
      } else {
        fail(`#${view.id}: ${problems.join('\n      ')}`);
      }
    } catch (error) {
      fail(`#${view.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

interface Report {
  readonly route: string;
  readonly controls: readonly { role: string; name: string }[];
  readonly tabOrder: readonly string[];
}

/** The controls and Tab order a committed accessibility report lists. */
function readReport(file: string): Report {
  const text = readFileSync(file, 'utf8');
  const controls: { role: string; name: string }[] = [];
  for (const line of text.split('\n')) {
    const cells = /^\|(.*)\|$/
      .exec(line.trim())?.[1]
      ?.split(/(?<!\\)\|/)
      .map(cell => cell.trim().replace(/\\\|/g, '|'));
    if (cells && CONTROL_ROLES.has(cells[0]!) && !controls.some(c => c.role === cells[0] && c.name === cells[1])) {
      controls.push({ role: cells[0]!, name: cells[1]! });
    }
  }
  const tabSection = text.split('## Tab order')[1] ?? '';
  const tabOrder = [...tabSection.matchAll(/^\d+\. (.+)$/gm)].map(match => match[1]!.trim());
  return { route: file.split('/').pop()!.replace(/\.md$/, ''), controls, tabOrder };
}

/** Routes whose committed report this check cannot reproduce, and why. */
const REPORT_NOT_COMPARABLE: Record<string, string> = {
  'example-transitions':
    "reads Audius live wherever the network allows it, and its report is of the offline snapshot Chrome is held to; the browser's names would be today's playlists"
};

/**
 * Where focus comes to rest after a key: a value different from
 * `previous` that holds for three reads. See `settledFocus` in
 * `lib/a11y.ts` for the two transients this rides out.
 */
async function settledFocus(page: BrowserPage, previous: string): Promise<string | null> {
  const deadline = Date.now() + 1_500;
  let candidate: string | null = null;
  let held = 0;
  while (Date.now() < deadline) {
    const active = await page.evaluate<string>(ACTIVE_ELEMENT);
    if (active === '') {
      candidate = null;
      held = 0;
    } else if (active !== previous && active === candidate) {
      if (++held >= 3) return active;
    } else {
      candidate = active === previous ? null : active;
      held = candidate === null ? 0 : 1;
    }
    await sleep(50);
  }
  return null;
}

async function tabWalk(page: BrowserPage, stops: number): Promise<string[]> {
  await page.evaluate<void>(`document.querySelector('canvas').focus()`);
  const visited: string[] = [];
  let previous = await page.evaluate<string>(ACTIVE_ELEMENT);
  for (let press = 0; press < stops + 3; press++) {
    await page.perform(typeKeys(KEYS.Tab));
    const focused = await settledFocus(page, previous);
    if (focused === null) break;
    previous = focused;
    visited.push(focused === 'canvas' ? 'a focusable node with no semantics' : focused.split('\u0000')[1]!);
  }
  // Cut where the walk starts over, as `withoutWrap` does in `lib/a11y.ts`.
  for (let k = 1; k < visited.length; k++) {
    if (visited[k] === visited[0] && (k + 1 >= visited.length || visited[k + 1] === visited[1])) {
      return visited.slice(0, k);
    }
  }
  return visited;
}

async function checkAccessibility(page: BrowserPage, base: string): Promise<void> {
  console.log("\naccessibility: the browser's own engine names every reported control, and Tab walks them in order");
  const dir = repo('apps', 'playground', 'accessibility');
  for (const file of readdirSync(dir).filter(name => name.endsWith('.md'))) {
    const report = readReport(join(dir, file));
    if (ROUTE_FILTER !== undefined && !ROUTE_FILTER.includes(report.route)) continue;
    const notComparable = REPORT_NOT_COMPARABLE[report.route];
    if (notComparable !== undefined) {
      skip(`#${report.route}: ${notComparable}`);
      continue;
    }
    try {
      await open(page, `${base}?still#${report.route}`);
      // The report is the wait condition: the notes read OPFS, and the
      // first mirrored screen is the empty one.
      await waitFor(
        `#${report.route} to mirror every reported control`,
        async () => {
          for (const control of report.controls) {
            if ((await page.evaluate<true | null>(MIRRORED(control.role, control.name, 'return true;'))) === null) {
              return undefined;
            }
          }
          return true;
        },
        30_000
      );
      const missed: string[] = [];
      for (const [index, control] of report.controls.entries()) {
        const token = `${report.route}-${index}`;
        await page.evaluate(
          MIRRORED(control.role, control.name, `el.setAttribute('data-gesso-check', '${token}'); return true;`)
        );
        const instead = await page.exposes(`[data-gesso-check="${token}"]`, control.role, control.name);
        if (instead !== undefined) {
          missed.push(`${control.role} '${control.name}' is computed as ${instead}`);
        }
      }
      if (missed.length === 0) {
        pass(`#${report.route}: ${report.controls.length} controls, each with the role and name the report gives`);
      } else {
        fail(`#${report.route}: ${missed.join('\n      ')}`);
      }

      const walked = await tabWalk(page, report.tabOrder.length);
      if (JSON.stringify(walked) === JSON.stringify(report.tabOrder)) {
        pass(`#${report.route}: Tab reaches ${walked.length} controls in the committed order`);
      } else {
        fail(
          `#${report.route}: Tab walked\n        ${walked.join('\n        ') || '(nothing)'}\n      ` +
            `and the report says\n        ${report.tabOrder.join('\n        ')}`
        );
      }
    } catch (error) {
      fail(`#${report.route}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function checkInput(page: BrowserPage, base: string): Promise<void> {
  console.log('\ninput: a real pointer and real keys reach the application');
  if (ROUTE_FILTER === undefined || ROUTE_FILTER.includes('example-signin')) {
    try {
      await open(page, `${base}?still#example-signin`);
      const key = await waitFor(
        'the keypad',
        async () => (await page.evaluate<{ x: number; y: number } | null>(centreOf('button', '5'))) ?? undefined,
        30_000
      );
      await page.perform(click(key.x, key.y));
      await page.perform(park());
      const counted = await waitFor(
        'the passcode to count the press',
        async () =>
          (await page.evaluate<true | null>(MIRRORED('status', 'Passcode, 1 of 6 digits entered', 'return true;'))) ??
          undefined,
        10_000
      ).catch(() => false);
      if (counted) pass('#example-signin: a click on the key 5 entered one digit');
      else fail('#example-signin: a click on the key 5 did not reach the app; the passcode still counts no digits');
    } catch (error) {
      fail(`#example-signin: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (ROUTE_FILTER === undefined || ROUTE_FILTER.includes('example-notes')) {
    try {
      await open(page, `${base}?still#example-notes`);
      const field = await waitFor(
        'the note title',
        async () =>
          (await page.evaluate<{ x: number; y: number } | null>(centreOf('textbox', 'Note title'))) ?? undefined,
        30_000
      );
      await page.perform(click(field.x, field.y));
      await waitFor(
        'the editing proxy to take focus',
        async () =>
          (await page.evaluate<string>('document.activeElement?.tagName ?? ""')) === 'TEXTAREA' ? true : undefined,
        5_000
      ).catch(() => undefined);
      await page.perform(typeKeys('zq7'));
      const typed = await waitFor(
        'the typed text to reach the mirror',
        async () =>
          (await page.evaluate<boolean>(
            `[...document.querySelectorAll('[data-gesso-semantics] [role="textbox"]')].some(el => (el.textContent ?? '').includes('zq7') || (el.getAttribute('aria-valuetext') ?? '').includes('zq7'))`
          )) || undefined,
        10_000
      ).catch(() => false);
      if (typed) pass('#example-notes: keys typed into the title went through the editing proxy into the note');
      else {
        const active = await page.evaluate<string>(
          '(document.activeElement?.tagName ?? "") + " " + (document.activeElement?.getAttribute("aria-label") ?? "")'
        );
        fail(`#example-notes: typed "zq7" into the title and the note does not contain it (focus is on ${active})`);
      }
    } catch (error) {
      fail(`#example-notes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

interface Parity {
  status: string;
  diff: number;
  pixels: number;
  gross: number;
}

async function checkParity(page: BrowserPage, base: string): Promise<void> {
  console.log('\nparity: Canvas2D and WebGPU draw the same pixels');
  try {
    await open(page, `${base}#renderers/compare`);
    const parity = await waitFor(
      'the compare route to report parity',
      async () => {
        const value = await page.evaluate<Parity | null>(`(() => {
          const el = document.querySelector('[data-parity-status]');
          if (!el) return null;
          const d = el.dataset;
          return { status: d.parityStatus, diff: Number(d.parityDiff), pixels: Number(d.parityPixels), gross: Number(d.parityGross) };
        })()`);
        return value === null || value.status === 'pending' ? undefined : value;
      },
      45_000
    );
    if (parity.status !== 'ok') {
      // Measured on Firefox 160, macOS 27: headless, `requestAdapter()`
      // resolves to null on every run, however long it is given; headed,
      // it resolves on every run. That is the browser's headless mode,
      // not the page, and Gesso's own fallback to Canvas2D is what the
      // routes above saw. Headed, a missing adapter is a failure.
      if (BROWSER === 'firefox' && !values.headed && /unavailable/.test(parity.status)) {
        skip(`parity: headless Firefox has no WebGPU adapter (${parity.status}); run with --headed to compare`);
      } else {
        fail(`the compare route could not compare: ${parity.status}`);
      }
      return;
    }
    const percent = (parity.diff / parity.pixels) * 100;
    const gross = (parity.gross / parity.pixels) * 100;
    const line =
      `${parity.diff} of ${parity.pixels} pixels differ (${percent.toFixed(3)}%, threshold ${PARITY_MAX_PERCENT}%), ` +
      `${parity.gross} grossly (${gross.toFixed(3)}%, threshold ${PARITY_MAX_GROSS_PERCENT}%)`;
    if (percent <= PARITY_MAX_PERCENT && gross <= PARITY_MAX_GROSS_PERCENT) pass(line);
    else fail(line);
  } catch (error) {
    fail(`parity: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function checkProbes(page: BrowserPage): Promise<void> {
  console.log('\nprobes: the pages that report on themselves');

  let served = await serve(repo('scripts', 'rest-probe'));
  try {
    await page.navigate(served.base);
    const seen = await waitFor(
      'the worker to answer the command',
      async () => {
        const value = await page.evaluate<{ errors: string[]; calls: unknown[] } | undefined>('window.gessoProbe');
        return value !== undefined && (value.errors.length > 0 || value.calls.length > 0) ? value : undefined;
      },
      30_000
    );
    const expected = JSON.stringify([[2, 7, 'because the check said so']]);
    if (seen.errors.length === 0 && JSON.stringify(seen.calls) === expected) {
      pass('rest: a command with three arguments crossed a real Worker intact');
    } else {
      fail(
        `rest: the handler saw ${JSON.stringify(seen.calls)}, errors ${JSON.stringify(seen.errors)}; expected ${expected}`
      );
    }
  } catch (error) {
    fail(`rest: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await served.server.close();
  }

  served = await serve(repo('scripts', 'touch-probe'));
  try {
    await page.navigate(served.base);
    await waitFor(
      'the surface to mount',
      async () => (await page.evaluate<boolean>('typeof window.gessoScroll === "object"')) || undefined,
      30_000
    );
    // Past the recognizer's 12 px slop, as `check-touch-scroll.ts` drags.
    await page.perform(touchDrag([300, 220], [300 - 12 - 70, 220 - 12 - 70]));
    await sleep(200);
    const offset = await page.evaluate<{ x: number; y: number }>('window.gessoScroll');
    if (offset.x >= 40 && offset.y >= 40) {
      pass(`touch: a diagonal drag scrolled both axes, to (${offset.x.toFixed(0)}, ${offset.y.toFixed(0)})`);
    } else {
      fail(`touch: a diagonal drag of 82 px each way scrolled to (${offset.x.toFixed(0)}, ${offset.y.toFixed(0)})`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unsupported|not supported|invalid argument/i.test(message) && BROWSER === 'safari') {
      skip(`touch: desktop Safari's driver has no touch pointer (${message.split('\n')[0]}); --browser ios covers it`);
    } else {
      fail(`touch: ${message}`);
    }
  } finally {
    await served.server.close();
  }

  // The repository root, as `check-video-decode.ts` serves it, so the page
  // imports gesso-core from source. Its cross-origin source needs a second
  // server and is that script's to cover; the three same-origin sources
  // are what says whether this browser's decoder works.
  served = await serve(repo(), [], 'scripts/fixtures/video-decode/index.html');
  try {
    await page.navigate(`${served.base}scripts/fixtures/video-decode/index.html`);
    const result = await waitFor(
      'the decode check to finish',
      async () =>
        (await page.evaluate<
          | {
              canDecode: boolean;
              error?: string;
              sources: {
                name: string;
                error?: string;
                drewSomething?: boolean;
                picturesDrawn?: number;
                seekChangedPicture?: boolean;
                width?: number;
                height?: number;
              }[];
            }
          | undefined
        >('window.videoCheck')) ?? undefined,
      120_000
    );
    if (!result.canDecode || result.sources.length === 0) {
      fail(`video: ${result.error ?? 'this browser has no WebCodecs VideoDecoder'}`);
    }
    for (const source of result.sources) {
      const problems = [
        ...(source.error !== undefined ? [source.error] : []),
        ...(source.error === undefined && source.drewSomething !== true ? ['nothing was drawn'] : []),
        ...(source.error === undefined && (source.picturesDrawn ?? 0) < 5
          ? [`${source.picturesDrawn} pictures in a second`]
          : []),
        ...(source.error === undefined && source.seekChangedPicture !== true
          ? ['a seek did not change the picture']
          : []),
        ...(source.error === undefined && (source.width !== 1280 || source.height !== 992)
          ? [`read as ${source.width}x${source.height}`]
          : [])
      ];
      if (problems.length === 0) pass(`video, ${source.name}: decoded, advanced and seeked`);
      else fail(`video, ${source.name}: ${problems.join('; ')}`);
    }
  } catch (error) {
    fail(`video: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await served.server.close();
  }
}

async function main(): Promise<void> {
  const page = await openBrowser(BROWSER!, { viewport: VIEWPORT, headed: values.headed, device: values.device });
  console.log(`${page.name}, ${VIEWPORT.join('×')}`);
  try {
    if (ONLY.has('routes') || ONLY.has('accessibility') || ONLY.has('input') || ONLY.has('parity')) {
      const { server, base } = await serve(repo('apps', 'playground'), [errorTrap]);
      try {
        if (ONLY.has('routes')) await checkRoutes(page, base);
        if (ONLY.has('accessibility')) await checkAccessibility(page, base);
        if (ONLY.has('input')) await checkInput(page, base);
        if (ONLY.has('parity')) await checkParity(page, base);
      } finally {
        await server.close();
      }
    }
    if (ONLY.has('probes')) await checkProbes(page);
  } finally {
    await page.close();
  }
  console.log(
    `\n${page.name}: ${failures.length === 0 ? 'ok' : `${failures.length} failed`}` +
      (skipped.length > 0 ? `, ${skipped.length} not checked (listed with their reasons above)` : '')
  );
  if (failures.length > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
