/**
 * Docs screenshot gate.
 *
 * Opens every documentation page that carries a `<LiveExample>`, waits
 * for the example to stop moving, captures the canvas it mounted, and
 * compares the pixels against a committed baseline. A change that stops
 * a page's canvas painting, or makes it paint something else, then
 * fails with the page's name.
 *
 * It is `check-route-screenshots.ts` pointed at a different site, and
 * the decisions that script explains hold here unchanged: the example's
 * own box rather than the viewport, quiescence over the region *and*
 * the pixels, a pixel diff against a measured threshold rather than a
 * byte comparison, the built site under `vitepress preview` rather than
 * a dev server, and a manifest stamping the environment the baselines
 * mean anything in. What is different is the shape of the thing being
 * covered, and that is four more decisions:
 *
 *   - **The pages are discovered, not listed.** The playground has a
 *     `ROUTES` array to iterate; the docs site has eighty-nine markdown
 *     files, seventy of which carry an example. So this scans
 *     `apps/docs/**\/*.md` for `<LiveExample id="...">` with the same
 *     regex `check-docs.ts` uses. A page that gains an example is
 *     covered the day it lands, and nobody has to remember a list.
 *   - **A capture is named by page and by id.** One page may hold more
 *     than one example, and one example may appear on more than one
 *     page (`counter` is on two, `structure` on three), so neither
 *     half is unique on its own. The baseline for `counter` on
 *     `guide/counter` is `guide-counter.counter.png`.
 *   - **An example is matched to its id by document order.** The
 *     component renders no id into the DOM, so the nth `.live-example`
 *     on the page is the nth `<LiveExample>` in the markdown. That
 *     holds because markdown renders in order, and the wrapper is
 *     rendered whether the example mounted or failed, so a failure
 *     does not shift the ones after it. If the counts disagree the
 *     page fails rather than being captured against the wrong name.
 *   - **A still frame is checked three ways before it is trusted.** A
 *     page that never mounted its example is perfectly still, and so
 *     is one that mounted a blank canvas, and `--update` would happily
 *     baseline either. So: the box is not measured until a sized
 *     `canvas` exists inside the host; `.live-example-failure` showing
 *     is reported with its message rather than captured; and a settled
 *     capture that is one flat colour inside the wrapper's rounded
 *     corners is rejected, because every example here paints something.
 *
 *   node scripts/check-docs-screenshots.ts                    # verify
 *   node scripts/check-docs-screenshots.ts --update           # rewrite baselines
 *   node scripts/check-docs-screenshots.ts --page guide/counter
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { DevTools, findChrome, openPage, waitFor } from './lib/devtools.ts';

/** Clear of the playground gate's 5189 and of anybody's own dev server. */
const PREVIEW_PORT = 5190;
/** Clear of 9336 to 9339, which the other four Chrome scripts hold. */
const DEVTOOLS_PORT = 9341;
/** Fixed so a baseline means something; DPR is forced to 1 by the launcher. */
const VIEWPORT: readonly [number, number] = [1280, 900];
/**
 * The appearance every capture is taken in.
 *
 * The site follows `prefers-color-scheme` and hands each example the
 * answer at construction, so without this the baselines would be
 * whatever the browser's default happens to be. That is not
 * hypothetical: headless Chrome 152 answers `dark` here, so the first
 * baseline captured was a dark canvas nobody had chosen. It is stated
 * instead, emulated on the page, and recorded in the manifest, so
 * changing it fails the environment check rather than reporting
 * seventy diffs.
 */
const COLOR_SCHEME = 'light';
const QUIESCE_MATCHES = 3;
const QUIESCE_INTERVAL_MS = 250;
const QUIESCE_TIMEOUT_MS = 20_000;
/**
 * Differing pixels allowed, as a percentage of the compared ones.
 *
 * Measured on this machine, not chosen by taste. Four verify runs over
 * all sixty-eight covered examples each read 0.000% on sixty-one or
 * sixty-two of them, and nothing ever moved by more than three pixels,
 * which is 0.002% at the worst and is rasterisation jitter on the edge
 * of a glyph. So the threshold is fifty times the largest jitter seen
 * and still nowhere near a real change: turning one example's button
 * from `primary` to `danger`, to fail this gate on purpose, measured
 * 0.839%.
 */
const MAX_PERCENT = Number(process.env.DOCS_SCREENSHOT_MAX_PERCENT ?? '0.1');
/**
 * Pixels that differ grossly, a channel apart by more than a third of
 * its range, as a share of the compared ones. Antialiasing does not
 * cross that bar at all: every one of the sixty-eight read 0.000%
 * grossly in every run, while the deliberate colour change read 0.769%.
 */
const MAX_GROSS_PERCENT = Number(process.env.DOCS_SCREENSHOT_MAX_GROSS_PERCENT ?? '0.02');

/**
 * Pages whose example cannot hold still, and why.
 *
 * Excluding one here is a claim that no baseline could exist, not that
 * one was inconvenient to make. Both were observed failing the quiesce
 * loop in a full `--update` run before they were written down, and in
 * both the movement belongs to a component rather than to the example:
 * `?still` freezes what an example chooses to freeze, and neither of
 * these has anything of its own to freeze. Each of these pages holds
 * exactly one `<LiveExample>`, so excluding the page excludes only the
 * example that cannot settle.
 */
const CANNOT_SETTLE: Record<string, string> = {
  'components/spinner':
    "the motion is inside `Spinner`: a repeating stepped tween with `reducedMotion: 'keep'`, and no prop turns it off. " +
    'A spinner that stopped would say work had stopped, which the media tier decided against.',
  'components/progress-bar':
    'the page ends with the indeterminate bar, which sweeps on the same repeating tween and for the same stated ' +
    'reason. The two determinate bars above it are still, but they share a page with it.'
};

/*
 * Every other page is opened in the site's "still" mode (`?still` on the
 * page url). The site reads the flag the way the playground does: the
 * page reads its own search string, and `LiveExample` names every worker
 * it spawns `still`, because a worker has no url of its own. What each
 * example freezes is the example's own decision, taken at the point
 * where the motion would have begun.
 */

const root = join(import.meta.dirname, '..');
const site = join(root, 'apps', 'docs');
const distDir = join(site, '.vitepress', 'dist');
const baselineDir = join(site, 'screenshots');
const manifestPath = join(baselineDir, 'manifest.json');
const update = process.argv.includes('--update');
const onlyPage = (() => {
  const at = process.argv.indexOf('--page');
  return at === -1 ? undefined : process.argv[at + 1];
})();

/** Directories that hold build output or dependencies, not pages. */
const SKIP = new Set(['node_modules', 'dist', '.vitepress']);

/** `<LiveExample id="foo" height="320" />`, in any attribute order. */
const LIVE_EXAMPLE = /<LiveExample\b[^>]*?\bid="([^"]*)"/g;

interface Manifest {
  readonly chrome: string;
  readonly platform: string;
  readonly viewport: readonly [number, number];
  readonly colorScheme: string;
  readonly captured: string;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One page's worth of work: its url path and the ids it embeds, in order. */
interface Page {
  /** The url path, with no leading slash: `guide/counter`, or `''` for the home page. */
  readonly route: string;
  readonly file: string;
  readonly ids: readonly string[];
}

/** Every markdown page on the site, depth-first, with stable ordering. */
function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP.has(entry)) {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...markdownFiles(path));
    } else if (entry.endsWith('.md')) {
      out.push(path);
    }
  }
  return out;
}

/**
 * The url path a markdown file is served at.
 *
 * `cleanUrls` is on, so `guide/counter.md` is `/guide/counter` and an
 * `index.md` is its directory. sirv resolves both, the first through
 * its `html` extension and the second through the directory index.
 */
function routeOf(file: string): string {
  const rel = relative(site, file).split(sep).join('/');
  const withoutExtension = rel.slice(0, -'.md'.length);
  if (withoutExtension === 'index') {
    return '';
  }
  return withoutExtension.endsWith('/index') ? withoutExtension.slice(0, -'index'.length) : withoutExtension;
}

/** Every page carrying at least one live example, with its ids in document order. */
function pagesWithExamples(): Page[] {
  const pages: Page[] = [];
  for (const file of markdownFiles(site)) {
    const ids = [...readFileSync(file, 'utf8').matchAll(LIVE_EXAMPLE)].map(match => match[1]);
    if (ids.length > 0) {
      pages.push({ route: routeOf(file), file, ids });
    }
  }
  return pages;
}

/** `guide/counter` + `counter` becomes `guide-counter.counter.png`. */
function baselineName(page: Page, id: string): string {
  const route = page.route === '' ? 'index' : page.route.replace(/\/$/, '/index').replaceAll('/', '-');
  return `${route}.${id}.png`;
}

/**
 * Scrolls the nth example into view and reports its box.
 *
 * Three answers, and they are not interchangeable. `failure` is the
 * component's own error slot, which is a page that did not render and
 * has to be reported rather than captured. `null` means "not ready
 * yet": either the wrapper is not in the DOM or the app has not put a
 * sized canvas inside it, and the caller keeps waiting. A box means the
 * example is on screen and can be captured.
 *
 * The scroll is here rather than done once per page because a
 * documentation page is taller than the viewport and a screenshot with
 * `captureBeyondViewport: false` can only crop what is on screen. It is
 * instant and centred, so it lands on the same offset every round once
 * the page's own layout has settled, which is what the box half of the
 * quiesce loop then confirms.
 *
 * The box is in **page** coordinates, which is the scroll offset added
 * to the client rect. `Page.captureScreenshot`'s clip is a page
 * rectangle, not a viewport one, and the playground gate never had to
 * know because a playground route does not scroll. Here it does, and
 * passing the client rect straight through produced a capture displaced
 * upwards by exactly the scroll: the baseline for `access/semantics`
 * was two paragraphs of the prose above the example, perfectly stable
 * across runs and completely wrong.
 */
function measureExpression(index: number): string {
  return `(() => {
  const wrappers = [...document.querySelectorAll('.live-example')];
  const wrapper = wrappers[${index}];
  if (!wrapper) return null;
  const failure = wrapper.querySelector('.live-example-failure');
  if (failure) return { failure: (failure.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 300) };
  const host = wrapper.querySelector('.live-example-host');
  if (!host) return null;
  const canvas = host.querySelector('canvas');
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  host.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = host.getBoundingClientRect();
  const box = {
    x: Math.round(r.x + window.scrollX),
    y: Math.round(r.y + window.scrollY),
    width: Math.round(r.width),
    height: Math.round(r.height)
  };
  return box.width > 0 && box.height > 0 ? box : null;
})()`;
}

/** How many live examples the rendered page actually holds. */
const WRAPPER_COUNT = `document.querySelectorAll('.live-example').length`;

/**
 * How far in from the edge the flat-colour check looks.
 *
 * `.live-example` rounds its corners by 8 px and clips the host to
 * them, so the four corner pixels of any capture differ from the fill
 * whatever the example did. Checking the whole box therefore called
 * every blank capture "not flat", which is how this check first failed
 * to catch an example emptied on purpose. Twelve pixels clears the
 * radius with room to spare.
 */
const FLATNESS_INSET = 12;

/**
 * Whether a capture is one flat colour inside its rounded corners.
 *
 * A canvas that was created and never painted is perfectly still, so
 * the quiesce loop settles on it and `--update` writes a picture of
 * nothing as the baseline. Every example on this site paints something
 * on a background, so a single colour across the interior means the
 * example did not run, whatever the absence of an error message says.
 */
function uniformExpression(base64: string): string {
  return `(async () => {
  const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,${base64}')).blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const inset = ${FLATNESS_INSET};
  const left = width > inset * 2 ? inset : 0;
  const top = height > inset * 2 ? inset : 0;
  const first = (top * width + left) * 4;
  for (let y = top; y < height - top; y++) {
    for (let x = left; x < width - left; x++) {
      const i = (y * width + x) * 4;
      if (
        data[i] !== data[first] ||
        data[i + 1] !== data[first + 1] ||
        data[i + 2] !== data[first + 2] ||
        data[i + 3] !== data[first + 3]
      ) {
        return false;
      }
    }
  }
  return true;
})()`;
}

interface Diff {
  readonly pixels: number;
  readonly diff: number;
  readonly gross: number;
  readonly note?: string;
}

/**
 * Compares a capture with its baseline inside the page.
 *
 * The baseline is fetched rather than passed in: the baselines are
 * copied into the built site before it is served, so the page can ask
 * for its own, and shipping two base64 strings of a quarter of a
 * megabyte through `Runtime.evaluate` per example is avoidable. The
 * decoding is the browser's, which is why this needs no dependency.
 */
function diffExpression(baselineUrl: string, actualBase64: string): string {
  return `(async () => {
  const decode = async source => {
    const response = await fetch(source);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    return { data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, w: bitmap.width, h: bitmap.height };
  };
  const a = await decode(${JSON.stringify(baselineUrl)});
  const b = await decode('data:image/png;base64,${actualBase64}');
  if (a === null || b === null) return { pixels: 0, diff: 0, gross: 0, note: 'could not decode one of the images' };
  if (a.w !== b.w || a.h !== b.h) {
    return { pixels: 0, diff: 0, gross: 0, note: 'size changed: ' + a.w + '×' + a.h + ' vs ' + b.w + '×' + b.h };
  }
  let diff = 0;
  let gross = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    const da = Math.abs(a.data[i + 3] - b.data[i + 3]);
    const worst = Math.max(dr, dg, db, da);
    if (worst === 0) continue;
    diff++;
    if (worst > 85) gross++;
  }
  return { pixels: a.w * a.h, diff, gross };
})()`;
}

async function captureClip(devtools: DevTools, box: Box): Promise<Buffer> {
  const reply = (await devtools.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 }
  })) as { data: string };
  return Buffer.from(reply.data, 'base64');
}

type Measured = Box | { readonly failure: string } | null;

function isFailure(measured: Measured): measured is { readonly failure: string } {
  return measured !== null && 'failure' in measured;
}

function sameBox(a: Box | undefined, b: Box): boolean {
  return a !== undefined && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

interface Settled {
  readonly kind: 'settled';
  readonly shots: readonly Buffer[];
  readonly boxes: readonly Box[];
}

interface Failed {
  readonly kind: 'failure';
  readonly index: number;
  readonly message: string;
}

interface Moving {
  readonly kind: 'moving';
}

/**
 * Captures a page's examples repeatedly until all of them stop changing.
 *
 * All of them together, not one at a time: the examples share a page, so
 * one that is still loading can still reflow the ones below it, and a
 * round that agreed with the last one on example two while example one
 * was moving would be measuring the wrong thing. A page whose examples
 * never all agree returns `moving`, so one run can report every page
 * that fails rather than dying on the first.
 */
async function captureSettled(devtools: DevTools, count: number): Promise<Settled | Failed | Moving> {
  let previousShots: Buffer[] | undefined;
  let previousBoxes: Box[] | undefined;
  let matches = 0;
  const deadline = Date.now() + QUIESCE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const boxes: Box[] = [];
    const shots: Buffer[] = [];
    for (let index = 0; index < count; index += 1) {
      const measured = await devtools.evaluate<Measured>(measureExpression(index));
      if (isFailure(measured)) {
        return { kind: 'failure', index, message: measured.failure };
      }
      if (measured === null) {
        break;
      }
      boxes.push(measured);
      shots.push(await captureClip(devtools, measured));
    }

    if (boxes.length === count) {
      const lastBoxes = previousBoxes;
      const lastShots = previousShots;
      const agreed =
        lastBoxes !== undefined &&
        lastShots !== undefined &&
        boxes.every((box, index) => sameBox(lastBoxes[index], box)) &&
        shots.every((shot, index) => shot.equals(lastShots[index]));
      if (agreed) {
        matches += 1;
        if (matches >= QUIESCE_MATCHES) {
          return { kind: 'settled', shots, boxes };
        }
      } else {
        matches = 0;
      }
      previousShots = shots;
      previousBoxes = boxes;
    } else {
      matches = 0;
      previousShots = undefined;
      previousBoxes = undefined;
    }
    await sleep(QUIESCE_INTERVAL_MS);
  }
  return { kind: 'moving' };
}

/**
 * The manifest, written the way the formatter wants it.
 *
 * `JSON.stringify(_, null, 2)` puts each number of the viewport on a
 * line of its own and oxfmt puts them back on one, so writing it that
 * way would leave the tree unformatted after every regeneration. That
 * is not hypothetical either: CI went red for several pushes because
 * the playground's manifest had been committed unformatted, which skipped every check behind it.
 */
function manifestJson(manifest: Manifest): string {
  return (
    [
      '{',
      `  "chrome": ${JSON.stringify(manifest.chrome)},`,
      `  "platform": ${JSON.stringify(manifest.platform)},`,
      `  "viewport": [${manifest.viewport[0]}, ${manifest.viewport[1]}],`,
      `  "colorScheme": ${JSON.stringify(manifest.colorScheme)},`,
      `  "captured": ${JSON.stringify(manifest.captured)}`,
      '}'
    ].join('\n') + '\n'
  );
}

function chromeVersion(chrome: string): string {
  return execFileSync(chrome, ['--version'], { encoding: 'utf8' }).trim();
}

/**
 * Refuses to run when something already holds a port this needs.
 *
 * Both ports, and for the same reason twice over. `vitepress preview`
 * has no `--strictPort`, so it would exit and this would then drive
 * whatever *is* on that port, comparing the docs baselines against
 * somebody else's dev server. And a Chrome that cannot bind its
 * debugging port starts anyway with no endpoint, which is how this
 * script first failed: another browser on this machine held 9340, which
 * is why the constant above is 9341, the launch printed `bind() failed`
 * into a log nobody reads, and the run died fifteen seconds later
 * saying only that the endpoint never appeared.
 */
async function requireFreePort(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (error: NodeJS.ErrnoException) => {
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(`Port ${port} is already in use, and this gate needs it. Stop what is on it and retry.`)
          : error
      );
    });
    probe.once('listening', () => probe.close(() => resolve()));
    probe.listen(port, '127.0.0.1');
  });
}

async function main(): Promise<void> {
  const chrome = findChrome();
  const version = chromeVersion(chrome);
  const profile = mkdtempSync(join(tmpdir(), 'gesso-docs-shots-'));
  let preview: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;

  const all = pagesWithExamples();
  const pages = all
    .filter(page => onlyPage === undefined || page.route === onlyPage)
    .filter(page => CANNOT_SETTLE[page.route] === undefined);
  if (pages.length === 0) {
    const known = onlyPage === undefined ? '' : ` Known pages: ${all.map(page => page.route).join(', ')}.`;
    throw new Error(`No docs pages to capture${onlyPage === undefined ? '' : ` for --page ${onlyPage}`}.${known}`);
  }

  // Two captures sharing a name would overwrite each other on `--update`
  // and then be compared against one another, which is a gate quietly
  // covering less rather than a gate failing. The route is in the name,
  // so this takes a page and an id that collide across the separator,
  // which is unlikely and not impossible.
  const claimed = new Map<string, string>();
  for (const page of pages) {
    for (const id of page.ids) {
      const name = baselineName(page, id);
      const owner = claimed.get(name);
      if (owner !== undefined) {
        throw new Error(`Both ${owner} and /${page.route} (${id}) want the baseline ${name}. Rename one of them.`);
      }
      claimed.set(name, `/${page.route} (${id})`);
    }
  }

  const manifest: Manifest | undefined = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest)
    : undefined;
  if (!update && manifest !== undefined) {
    if (
      manifest.chrome !== version ||
      manifest.platform !== process.platform ||
      manifest.colorScheme !== COLOR_SCHEME
    ) {
      throw new Error(
        `The baselines were captured with ${manifest.chrome} on ${manifest.platform} in ${manifest.colorScheme}; ` +
          `this is ${version} on ${process.platform} in ${COLOR_SCHEME}. Canvas text is rasterised with the ` +
          "system's fonts, so the two are not comparable. Regenerate with `pnpm docs:screenshots:update` in the " +
          'environment that will run the gate.'
      );
    }
  }

  await requireFreePort(PREVIEW_PORT);
  await requireFreePort(DEVTOOLS_PORT);

  const failures: string[] = [];
  const written: string[] = [];
  try {
    execFileSync('npx', ['vitepress', 'build'], { cwd: site, stdio: 'inherit' });
    // The page fetches its own baseline to diff against, and the preview
    // server serves only the build output, so the baselines are copied in
    // beside it. `.vitepress/dist` is ignored by git, so this leaves nothing.
    if (!update && existsSync(baselineDir)) {
      const served = join(distDir, 'screenshots');
      mkdirSync(served, { recursive: true });
      for (const name of readdirSync(baselineDir)) {
        if (name.endsWith('.png') && !name.endsWith('.actual.png')) {
          cpSync(join(baselineDir, name), join(served, name));
        }
      }
    }
    preview = spawn('npx', ['vitepress', 'preview', '--port', String(PREVIEW_PORT)], {
      cwd: site,
      stdio: 'ignore'
    });
    const base = `http://localhost:${PREVIEW_PORT}/`;
    await waitFor('the preview server', async () => ((await fetch(base)).ok ? true : undefined), 30_000);

    ({ browser, devtools } = await openPage(chrome, {
      url: base,
      devtoolsPort: DEVTOOLS_PORT,
      windowSize: VIEWPORT,
      profileDir: profile
    }));

    // Set once on the session, and it outlives every navigation that
    // follows. Reduced motion is deliberately left at the browser's
    // default: what holds the examples still is `?still`, not a media
    // query, and emulating a preference would change what the motion
    // page says about itself.
    await devtools.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: COLOR_SCHEME }]
    });

    if (update) {
      mkdirSync(baselineDir, { recursive: true });
    }

    for (const page of pages) {
      // Through about:blank, so each page is a real document load and
      // cannot inherit the last one's state. VitePress is a single-page
      // app, so navigating between two of its urls would otherwise be a
      // client-side route change, and `?still` has to be read at start-up.
      await devtools.send('Page.navigate', { url: 'about:blank' });
      await devtools.send('Page.navigate', { url: `${base}${page.route}?still` });

      const where = page.route === '' ? '/' : `/${page.route}`;
      const rendered = await waitFor(
        `the examples on ${where}`,
        async () => {
          const count = await devtools.evaluate<number>(WRAPPER_COUNT);
          return count > 0 ? count : undefined;
        },
        20_000
      ).catch(() => 0);
      if (rendered !== page.ids.length) {
        failures.push(
          `${where}: ${relative(root, page.file)} embeds ${page.ids.length} live example(s) and the page ` +
            `rendered ${rendered}. An example is matched to its id by document order, so nothing can be ` +
            'captured until those agree.'
        );
        continue;
      }

      const settled = await captureSettled(devtools, page.ids.length);
      if (settled.kind === 'failure') {
        failures.push(
          `${where}: the example "${page.ids[settled.index]}" failed to mount, so this page shows an error ` +
            `where its canvas should be. It says: ${settled.message}`
        );
        continue;
      }
      if (settled.kind === 'moving') {
        failures.push(
          `${where}: never held still for ${QUIESCE_MATCHES} captures over ${QUIESCE_TIMEOUT_MS} ms. ` +
            'If it cannot by construction, add it to CANNOT_SETTLE with the reason.'
        );
        continue;
      }

      for (const [index, id] of page.ids.entries()) {
        const name = baselineName(page, id);
        const file = join(baselineDir, name);
        const shot = settled.shots[index];
        const box = settled.boxes[index];

        // Before anything is written or compared: a still frame is not
        // the same thing as a painted one.
        const uniform = await devtools.evaluate<boolean>(uniformExpression(shot.toString('base64')), true);
        if (uniform) {
          failures.push(
            `${name}: every pixel inside the rounded corners is the same colour, so the example mounted a ` +
              'canvas and painted nothing into it.'
          );
          continue;
        }

        if (update) {
          writeFileSync(file, shot);
          written.push(name);
          console.log(`  wrote ${name} (${box.width}×${box.height}, ${shot.length} bytes)`);
          continue;
        }
        if (!existsSync(file)) {
          failures.push(`${name}: no baseline. Run \`pnpm docs:screenshots:update\`.`);
          continue;
        }

        const comparison = await devtools.evaluate<Diff | undefined>(
          diffExpression(`${base}screenshots/${name}`, shot.toString('base64')),
          true
        );
        // A gate that cannot measure must fail, not pass.
        if (comparison === undefined || !Number.isFinite(comparison.pixels)) {
          failures.push(`${name}: the comparison returned nothing, so nothing was verified.`);
          continue;
        }
        if (comparison.note !== undefined) {
          const actual = file.replace(/\.png$/, '.actual.png');
          writeFileSync(actual, shot);
          failures.push(`${name}: ${comparison.note}. Wrote ${actual.slice(root.length + 1)}.`);
          continue;
        }
        if (comparison.pixels <= 0) {
          failures.push(`${name}: compared zero pixels.`);
          continue;
        }
        const percent = (comparison.diff / comparison.pixels) * 100;
        const grossPercent = (comparison.gross / comparison.pixels) * 100;
        const reading =
          `${comparison.diff} of ${comparison.pixels} pixels differ (${percent.toFixed(3)}%), ` +
          `${comparison.gross} grossly (${grossPercent.toFixed(3)}%)`;
        if (percent > MAX_PERCENT || grossPercent > MAX_GROSS_PERCENT) {
          const actual = file.replace(/\.png$/, '.actual.png');
          writeFileSync(actual, shot);
          failures.push(
            `${name}: ${reading}; thresholds ${MAX_PERCENT}% and ${MAX_GROSS_PERCENT}% gross. ` +
              `Wrote ${actual.slice(root.length + 1)}.`
          );
        } else {
          console.log(`  ok ${name}: ${reading}`);
        }
      }
    }

    if (update && onlyPage === undefined) {
      // Anything left over is a baseline for an example that no longer
      // exists, or for a page that no longer embeds it; leaving it would
      // make the gate quietly cover less.
      for (const name of readdirSync(baselineDir)) {
        if (name.endsWith('.png') && !written.includes(name)) {
          unlinkSync(join(baselineDir, name));
          console.log(`  removed ${name}, which nothing captures any more`);
        }
      }
    }
    if (update) {
      const next: Manifest = {
        chrome: version,
        platform: process.platform,
        viewport: VIEWPORT,
        colorScheme: COLOR_SCHEME,
        captured: new Date().toISOString()
      };
      writeFileSync(manifestPath, manifestJson(next));
      console.log(`\nwrote ${written.length} baselines and the manifest (${version} on ${process.platform}).`);
    }
  } finally {
    devtools?.close();
    browser?.kill();
    preview?.kill();
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Cleanup must never mask the result.
    }
  }

  const examples = pages.reduce((total, page) => total + page.ids.length, 0);
  const excluded = Object.entries(CANNOT_SETTLE)
    .map(([route, why]) => `  /${route}: ${why}`)
    .join('\n');
  if (failures.length > 0) {
    console.error(`\n${failures.length} docs screenshot(s) differ:\n${failures.map(f => `  ${f}`).join('\n')}`);
    console.error('\nIf the change is intended, run `pnpm docs:screenshots:update` and commit the baselines.');
    process.exit(1);
  }
  console.log(`\ndocs screenshots ok: ${examples} examples across ${pages.length} pages match their baselines.`);
  if (excluded.length > 0) {
    console.log(`not covered:\n${excluded}`);
  }
}

main().catch(error => {
  console.error(`\ndocs screenshots failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
