/**
 * Route screenshot gate (`ROADMAP.md` F8's second exit criterion).
 *
 * Opens every playground route in headless Chrome, waits for it to stop
 * moving, captures each canvas, and compares the bytes against a
 * committed baseline. A change that alters what a route paints then
 * fails with the route's name.
 *
 * Four decisions worth knowing:
 *
 *   - **The route's own render area, not the viewport.** The shell's
 *     footer prints frame timings and an FPS reading, so a whole-page
 *     screenshot could never be stable. The clip is `.pg-preview`, which
 *     is the region a route draws into — inside it for a canvas route is
 *     the canvas, and for the layout route the DOM boxes it positions,
 *     so one rule covers both.
 *   - **Quiescence over the region *and* the pixels.** Each route is
 *     measured and captured repeatedly until three consecutive rounds
 *     agree on both. Measuring once up front was the bug behind every
 *     early flake: the shell's sidebar and footer arrive a frame or two
 *     after the route mounts, so `compare` was clipped at 1012×637 on
 *     one run and 1280×757 on the next, and comparing two different
 *     crops of the same screen reported five percent of it as changed.
 *     A route that never settles fails loudly instead of flaking; the
 *     ones that cannot settle by construction are excluded below with
 *     the reason.
 *   - **A pixel diff with a threshold, not a byte comparison.** Bytes
 *     were the first attempt and five of ten routes failed it: the same
 *     route settles to a slightly different still frame each run, which
 *     is rasterisation jitter and, on the notes example, a timestamp.
 *     So the comparison is the one `check-webgpu-parity.ts` uses — the
 *     share of differing pixels against a threshold — and the decoding
 *     is done by the browser, which already has a PNG decoder, so this
 *     still needs no dependency. The actual capture is written beside
 *     the baseline as `<name>.actual.png` whenever a route fails.
 *   - **The built playground, not the dev server.** Two runs against
 *     `vite` disagreed with each other by 5% on one route and then
 *     stopped doing so, which is the kind of result that makes a gate
 *     worthless whichever way it points. A production build and
 *     `vite preview` have no transform cache and no HMR to serve
 *     something stale, and they are also what ships.
 *   - **Stamped, like the layout fixtures.** Canvas text is rasterised
 *     with the system's fonts by the browser's rasteriser, so a baseline
 *     is only meaningful in the environment that produced it.
 *     `screenshots/manifest.json` records the Chrome version and the
 *     platform, and a mismatch is reported as a failure rather than
 *     quietly compared — see `decisions/0033-packaging.md` for what this
 *     costs in CI.
 *
 *   node scripts/check-route-screenshots.ts             # verify
 *   node scripts/check-route-screenshots.ts --update    # rewrite baselines
 *   node scripts/check-route-screenshots.ts --route framework
 *   node scripts/check-route-screenshots.ts --route modifiers,compare
 *   node scripts/check-route-screenshots.ts --app segue
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
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { DevTools, findChrome, openPage, waitFor, WEBGPU_FLAGS } from './lib/devtools.ts';
import { ROUTES } from '../apps/playground/src/shell/routes.ts';

/**
 * The applications this gate photographs, and how a route in each is
 * addressed.
 *
 * One browser and one preview server per application rather than one of
 * each for both, because the two need different browser flags: Segue
 * reads Audius, so it is photographed with no name resolution, and the
 * playground's baselines were captured without that and should not be
 * regenerated to accommodate a second app. Separate launches keep each
 * gate's meaning its own.
 */
interface AppUnderTest {
  readonly root: readonly string[];
  readonly port: number;
  readonly devtoolsPort: number;
  /** Where its baselines live, relative to the repository root. */
  readonly baselines: readonly string[];
  /** The url of a route, given the preview server's base. */
  url(base: string, route: string): string;
  /** Extra flags the browser needs for this application. */
  readonly flags: readonly string[];
  /**
   * The appearances to photograph each route in.
   *
   * One means the baseline keeps the route's bare name and nothing is
   * emulated, which is how the playground was photographed before this
   * existed and how it stays. More than one suffixes the name and asks
   * for each in turn, because M8 wants Segue seen in both.
   */
  readonly appearances: readonly ('light' | 'dark')[];
}

/**
 * No name resolves but localhost's, so Segue photographs its committed
 * snapshot rather than whatever Audius is trending this hour.
 *
 * A browser-wide flag rather than the DevTools network domain, because
 * the requests to block are made by workers, and a worker is a target
 * of its own that the page's client never sees. The same flag, for the
 * same reason, as `check-a11y-tree.ts`.
 */
const OFFLINE_FLAGS = ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'];

const APPS: Record<string, AppUnderTest> = {
  playground: {
    root: ['apps', 'playground'],
    port: 5189,
    devtoolsPort: 9339,
    baselines: ['apps', 'playground', 'screenshots'],
    url: (base, route) => `${base}?still#${route}`,
    flags: WEBGPU_FLAGS,
    appearances: ['dark']
  },
  segue: {
    root: ['apps', 'segue'],
    port: 5190,
    devtoolsPort: 9351,
    baselines: ['apps', 'segue', 'screenshots'],
    // Segue addresses routes off the path, and still mode is a query,
    // so the flag goes on whatever path the route is.
    url: (base, route) => `${base.replace(/\/$/, '')}${route}${route.includes('?') ? '&' : '?'}still`,
    flags: [...WEBGPU_FLAGS, ...OFFLINE_FLAGS],
    appearances: ['light', 'dark']
  }
};

/**
 * Segue's routes, as concrete addresses.
 *
 * Four of its nine take parameters, so they cannot be photographed from
 * the route table alone. These are the same nine addresses
 * `check-a11y-tree.ts` walks, so the two gates cover the same screens
 * and a route added to one is obviously missing from the other.
 */
const SEGUE_ROUTES: readonly { readonly id: string; readonly path: string }[] = [
  { id: 'segue-home', path: '/' },
  { id: 'segue-about', path: '/about' },
  { id: 'segue-search', path: '/search' },
  { id: 'segue-library', path: '/library' },
  { id: 'segue-now-playing', path: '/now-playing' },
  { id: 'segue-collection', path: '/Dreameaterism/playlist/deep-house-vol1' },
  { id: 'segue-album', path: '/HEXED/album/alchemy' },
  { id: 'segue-track', path: '/Hypertraffic/stay-a-little-longer' },
  { id: 'segue-artist', path: '/Audius' }
];
/** Fixed so a baseline means something; DPR is forced to 1 by the launcher. */
const VIEWPORT: readonly [number, number] = [1280, 900];
/**
 * Captures that must agree before a route counts as still.
 *
 * Three quarters of a second was not enough. Two routes reported a size
 * change on one run and matched on the next, because the preview
 * container's height was still settling: the pixels inside the crop had
 * held still for three captures while the box around them had not
 * finished moving. Both routes build the same tree either way, which
 * was checked by reading the semantics mirror on each of them, so what
 * differed was only where the crop stopped.
 *
 * A second and a half, with the load wait above, made nineteen routes
 * agree across three consecutive full runs.
 */
const QUIESCE_MATCHES = 6;
const QUIESCE_INTERVAL_MS = 250;
const QUIESCE_TIMEOUT_MS = 20_000;
/** How long a route may take to load its fonts and images. */
const LOAD_TIMEOUT_MS = 20_000;
/**
 * Differing pixels allowed, as a percentage of the compared ones.
 *
 * Measured, not chosen by taste. Once the two timestamp routes were
 * excluded, repeated runs on this machine differ by exactly 0.000% on
 * all eight covered routes, so the threshold is not absorbing any known
 * jitter; it is headroom for a rasteriser that antialiases an edge
 * differently. A route that paints something else moves whole boxes and
 * text runs: a 5 px gap change measured 1.7%, and 6 px of padding
 * measured 5.2%.
 */
const MAX_PERCENT = Number(process.env.SCREENSHOT_MAX_PERCENT ?? '0.1');
/**
 * Pixels that differ grossly — a channel apart by more than a third of
 * its range — as a share of the compared ones. Antialiasing does not
 * cross that bar, so this is the reading that catches a route actually
 * painting something else.
 */
const MAX_GROSS_PERCENT = Number(process.env.SCREENSHOT_MAX_GROSS_PERCENT ?? '0.02');

/**
 * Routes that cannot hold still, and why.
 *
 * Excluding one here is a claim that no baseline could exist, not that
 * one was inconvenient to make.
 */
const CANNOT_SETTLE: Record<string, string> = {
  benchmark: 'drives a continuous load and reports a moving frame time; it never reaches a still frame'
};

/**
 * Known headroom, so the next person to see one of these is not
 * surprised by it.
 *
 * `compare` carries a scrollbar thumb that is sometimes captured
 * visible and sometimes fully faded into the panel, worth about 381
 * pixels either way. Quiescence does not catch it, because both states
 * are still. That is 0.059% against a 0.1% budget, so it passes, and it
 * eats over half the headroom: a real change to that route of the size
 * that would normally be caught might not be. The fix, when someone
 * wants it, is for still mode to settle the thumb rather than for the
 * threshold to grow.
 *
 * `example-transitions` and `transitions-app` sit at 0.076% and 0.077%
 * of the same budget, with 30 gross pixels each against 129.
 */

/*
 * Every other route is opened in the playground's "still" mode (`?still`
 * on the URL, `apps/playground/src/shell/still.ts`): the routes name the
 * workers they spawn, the tickers do not start, the clocks read one
 * fixed instant, and the video holds its first frame. Before that mode
 * existed seven routes were excluded here: the two framework routes for
 * their counters, the live example for its feed, the notes and theme
 * examples for a rendered time whose width changed with the clock, and
 * the two transitions routes for a video that decoded continuously.
 * Freezing them from outside was not possible — a script evaluated on
 * the page does not reach a worker, and every one of those sources ran
 * in one — so the freeze is a branch at each source, taken only when the
 * flag says so.
 */

const root = join(import.meta.dirname, '..');
const update = process.argv.includes('--update');
const onlyApp = (() => {
  const at = process.argv.indexOf('--app');
  return at === -1 ? undefined : process.argv[at + 1];
})();
/**
 * `--route a,b` rather than one route, so two routes that need
 * attributing to the same change can be photographed from one build
 * instead of two.
 */
const onlyRoutes = (() => {
  const at = process.argv.indexOf('--route');
  const value = at === -1 ? undefined : process.argv[at + 1];
  return value === undefined ? undefined : new Set(value.split(',').map(name => name.trim()));
})();

interface Manifest {
  readonly chrome: string;
  readonly platform: string;
  readonly viewport: readonly [number, number];
  readonly captured: string;
}

interface CanvasBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The box of the route's render area.
 *
 * `.pg-preview` is the shell's own container for whatever the route
 * draws; the fallback to `#app` is for a route that replaces the shell
 * rather than mounting inside it.
 */
const PREVIEW_BOX = `(() => {
  const el = document.querySelector('.pg-preview') ?? document.querySelector('#app');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const box = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  return box.width > 0 && box.height > 0 ? box : null;
})()`;

/**
 * Whether everything that can change a layout has arrived.
 *
 * The quiesce loop below settles as soon as the box and the pixels hold
 * still for three captures, which a page using a fallback font does
 * perfectly well. When the real font then arrives, text remeasures and
 * the container's height moves, and the capture has already been taken
 * at the old height. That is what made two routes report a size change
 * on one run and match on the next, with content pixel-identical and
 * only the crop differing: nothing was flaky about the renderer, the
 * gate was racing `document.fonts`.
 *
 * Images are waited for as well, and for the same reason rather than a
 * different one: an image that has not decoded contributes no intrinsic
 * height to the box around it.
 */
const PAGE_LOADED = `(() => {
  if (document.readyState !== 'complete') return false;
  for (const image of document.images) {
    if (!image.complete) return false;
  }
  return document.fonts.status === 'loaded';
})()`;

/**
 * Whether the error overlay is up, and what it says.
 *
 * A route that failed to render is perfectly still, so the quiesce loop
 * settles on it happily and `--update` writes a picture of the error
 * overlay as the baseline. That has happened: a route whose whole page
 * threw was baselined and the gate went green on it forever after.
 *
 * The overlay is `@gesso/devtools`', in a shadow root under the element
 * the app was mounted in, so this looks for that rather than for
 * anything the application draws.
 */
const ERROR_OVERLAY = `(() => {
  const root = document.querySelector('.pg-preview') ?? document.querySelector('#app');
  if (!root) return null;
  for (const child of root.children) {
    const panel = child.shadowRoot && child.shadowRoot.querySelector('.panel[role="alert"]');
    if (panel) return (panel.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200);
  }
  return null;
})()`;

interface Diff {
  readonly pixels: number;
  readonly diff: number;
  readonly gross: number;
  readonly note?: string;
}

/**
 * Compares a capture with its baseline inside the page.
 *
 * The baseline is fetched rather than passed in: it lives under the
 * playground's own root, so Vite already serves it, and shipping an
 * 80 kB base64 string through `Runtime.evaluate` twice per route is
 * avoidable.
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

async function captureClip(devtools: DevTools, box: CanvasBox): Promise<Buffer> {
  const reply = (await devtools.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 }
  })) as { data: string };
  return Buffer.from(reply.data, 'base64');
}

/**
 * Captures a region repeatedly until it stops changing.
 *
 * `undefined` when it never does, so one run can report every route
 * that moves rather than dying on the first.
 */
async function captureSettled(devtools: DevTools): Promise<{ shot: Buffer; box: CanvasBox } | undefined> {
  let previousShot: Buffer | undefined;
  let previousBox: CanvasBox | undefined;
  let matches = 0;
  const deadline = Date.now() + QUIESCE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const box = await devtools.evaluate<CanvasBox | null>(PREVIEW_BOX);
    if (box === null) {
      await sleep(QUIESCE_INTERVAL_MS);
      continue;
    }
    const shot = await captureClip(devtools, box);
    const sameBox =
      previousBox !== undefined &&
      previousBox.x === box.x &&
      previousBox.y === box.y &&
      previousBox.width === box.width &&
      previousBox.height === box.height;
    if (sameBox && previousShot !== undefined && shot.equals(previousShot)) {
      matches += 1;
      if (matches >= QUIESCE_MATCHES) {
        return { shot, box };
      }
    } else {
      matches = 0;
    }
    previousShot = shot;
    previousBox = box;
    await sleep(QUIESCE_INTERVAL_MS);
  }
  return undefined;
}

function chromeVersion(chrome: string): string {
  return execFileSync(chrome, ['--version'], { encoding: 'utf8' }).trim();
}

/** One application's routes, photographed and compared. */
async function shoot(appName: string, app: AppUnderTest, routes: readonly Route[]): Promise<string[]> {
  const chrome = findChrome();
  const version = chromeVersion(chrome);
  const profile = mkdtempSync(join(tmpdir(), 'gesso-shots-'));
  const baselineDir = join(root, ...app.baselines);
  const manifestPath = join(baselineDir, 'manifest.json');
  let vite: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;

  const manifest: Manifest | undefined = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest)
    : undefined;
  if (!update && manifest !== undefined) {
    if (manifest.chrome !== version || manifest.platform !== process.platform) {
      throw new Error(
        `The baselines were captured with ${manifest.chrome} on ${manifest.platform}; this is ${version} on ` +
          `${process.platform}. Canvas text is rasterised with the system's fonts, so the two are not comparable. ` +
          'Regenerate with `pnpm screenshots:update` in the environment that will run the gate.'
      );
    }
  }

  const failures: string[] = [];
  const written: string[] = [];
  try {
    execFileSync('npx', ['vite', 'build', '--logLevel', 'warn'], {
      cwd: join(root, ...app.root),
      stdio: 'inherit'
    });
    // The page fetches its own baseline to diff against, and `vite
    // preview` serves only the build output, so the baselines are copied
    // in beside it. `dist/` is ignored by git, so this leaves nothing.
    if (!update && existsSync(baselineDir)) {
      const served = join(root, ...app.root, 'dist', 'screenshots');
      mkdirSync(served, { recursive: true });
      for (const name of readdirSync(baselineDir)) {
        if (name.endsWith('.png') && !name.endsWith('.actual.png')) {
          cpSync(join(baselineDir, name), join(served, name));
        }
      }
    }
    vite = spawn('npx', ['vite', 'preview', '--port', String(app.port), '--strictPort'], {
      cwd: join(root, ...app.root),
      stdio: 'ignore'
    });
    const base = `http://localhost:${app.port}/`;
    await waitFor('the preview server', async () => ((await fetch(base)).ok ? true : undefined), 30_000);

    ({ browser, devtools } = await openPage(chrome, {
      url: base,
      devtoolsPort: app.devtoolsPort,
      windowSize: VIEWPORT,
      // Some routes are WebGPU; the adapter has to exist for them to
      // paint. Segue adds the flag that stops names resolving.
      flags: [...app.flags],
      profileDir: profile
    }));

    if (update) {
      mkdirSync(baselineDir, { recursive: true });
    }

    for (const { route, appearance } of routes.flatMap(route =>
      app.appearances.map(appearance => ({ route, appearance }))
    )) {
      // Through about:blank, so each route is a real document load and
      // cannot inherit the last one's state. Navigating straight from one
      // hash to another would be a same-document navigation, and a reload
      // issued to force the point races the navigation it follows — which
      // is how this first hung, with a `Runtime.evaluate` whose context
      // had been torn down never getting a reply.
      await devtools.send('Page.navigate', { url: 'about:blank' });
      // The appearance the page will read, before it loads. Headless
      // Chrome answers `dark` for `prefers-color-scheme` whatever the
      // system is set to, so the light run has to be asked for rather
      // than assumed, and the flag Chrome documents for it silently
      // does nothing.
      if (app.appearances.length > 1) {
        await devtools.send('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: appearance }]
        });
      }
      // In still mode, so a route that ticks or plays holds one frame.
      await devtools.send('Page.navigate', { url: app.url(base, route.address) });

      const name = `${route.id}${app.appearances.length > 1 ? `-${appearance}` : ''}.png`;
      const file = join(baselineDir, name);
      // Before quiescing, not instead of it: a loaded page still has a
      // first frame to draw and a spring to come to rest.
      await waitFor(
        `${name} to finish loading its fonts and images`,
        async () => (await devtools!.evaluate<boolean>(PAGE_LOADED)) || undefined,
        LOAD_TIMEOUT_MS
      );
      const settled = await captureSettled(devtools);
      if (settled === undefined) {
        failures.push(
          `${name}: never held still for ${QUIESCE_MATCHES} captures over ${QUIESCE_TIMEOUT_MS} ms. ` +
            'If it cannot by construction, add it to CANNOT_SETTLE with the reason.'
        );
        continue;
      }
      const { shot, box } = settled;

      // Before anything is written or compared: a still frame is not
      // the same thing as a rendered one.
      const overlay = await devtools.evaluate<string | null>(ERROR_OVERLAY);
      if (overlay !== null && overlay !== '') {
        failures.push(`${name}: the error overlay is up, so this route did not render. It says: ${overlay}`);
        continue;
      }

      if (update) {
        writeFileSync(file, shot);
        written.push(name);
        console.log(`  wrote ${name} (${box.width}×${box.height}, ${shot.length} bytes)`);
      } else if (!existsSync(file)) {
        failures.push(`${name}: no baseline. Run \`pnpm screenshots:update\`.`);
      } else {
        const comparison = await devtools.evaluate<Diff | undefined>(
          diffExpression(`${base}screenshots/${name}`, shot.toString('base64')),
          true
        );
        // A gate that cannot measure must fail, not pass. The first
        // version of this returned undefined for every route — the
        // expression is async and `awaitPromise` was not set — and
        // cheerfully reported ten routes ok.
        if (comparison === undefined || !Number.isFinite(comparison.pixels)) {
          failures.push(`${name}: the comparison returned nothing, so nothing was verified.`);
        } else if (comparison.note !== undefined) {
          const actual = file.replace(/\.png$/, '.actual.png');
          writeFileSync(actual, shot);
          failures.push(`${name}: ${comparison.note}. Wrote ${actual.slice(root.length + 1)}.`);
        } else {
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
            console.log(`  ok ${name} — ${reading}`);
          }
        }
      }
    }

    if (update) {
      // Anything left over is a baseline for a canvas that no longer
      // exists; leaving it would make the gate quietly cover less.
      for (const name of readdirSync(baselineDir)) {
        if (name.endsWith('.png') && !written.includes(name) && onlyRoutes === undefined) {
          unlinkSync(join(baselineDir, name));
          console.log(`  removed ${name}, which nothing captures any more`);
        }
      }
      const next: Manifest = {
        chrome: version,
        platform: process.platform,
        viewport: VIEWPORT,
        captured: new Date().toISOString()
      };
      writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
      console.log(
        `\nwrote ${written.length} ${appName} baselines and the manifest (${version} on ${process.platform}).`
      );
    }
  } finally {
    devtools?.close();
    browser?.kill();
    vite?.kill();
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Cleanup must never mask the result.
    }
  }

  console.log(
    `  ${appName}: ${routes.length} routes` +
      (app.appearances.length > 1 ? ` in ${app.appearances.length} appearances` : '')
  );
  return failures;
}

/** A route to photograph: its baseline's name, and where to find it. */
interface Route {
  readonly id: string;
  /** What `AppUnderTest.url` is given: a hash id, or a path. */
  readonly address: string;
}

async function main(): Promise<void> {
  const wanted = Object.entries(APPS).filter(([name]) => onlyApp === undefined || name === onlyApp);
  if (wanted.length === 0) {
    throw new Error(`No application called ${onlyApp}. Known: ${Object.keys(APPS).join(', ')}.`);
  }

  const failures: string[] = [];
  let captured = 0;
  for (const [name, app] of wanted) {
    const all: Route[] =
      name === 'segue'
        ? SEGUE_ROUTES.map(route => ({ id: route.id, address: route.path }))
        : ROUTES.filter(route => CANNOT_SETTLE[route.id] === undefined).map(route => ({
            id: route.id,
            address: route.id
          }));
    const routes = all.filter(route => onlyRoutes === undefined || onlyRoutes.has(route.id));
    if (routes.length === 0) {
      if (onlyRoutes !== undefined) {
        continue;
      }
      throw new Error(`No routes to capture for ${name}.`);
    }
    captured += routes.length * app.appearances.length;
    failures.push(...(await shoot(name, app, routes)));
  }
  if (captured === 0) {
    throw new Error(
      `No routes to capture${onlyRoutes === undefined ? '' : ` for --route ${[...onlyRoutes].join(',')}`}.`
    );
  }

  const excluded = Object.entries(CANNOT_SETTLE)
    .map(([id, why]) => `  ${id}: ${why}`)
    .join('\n');
  if (failures.length > 0) {
    console.error(`\n${failures.length} route screenshot(s) differ:\n${failures.map(f => `  ${f}`).join('\n')}`);
    console.error('\nIf the change is intended, run `pnpm screenshots:update` and commit the baselines.');
    process.exit(1);
  }
  console.log(`\nroute screenshots ok: ${captured} routes match their baselines.`);
  if (excluded.length > 0) {
    console.log(`not covered:\n${excluded}`);
  }
}

main().catch(error => {
  console.error(`\nroute screenshots failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
