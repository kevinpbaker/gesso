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

const VITE_PORT = 5189;
const DEVTOOLS_PORT = 9339;
/** Fixed so a baseline means something; DPR is forced to 1 by the launcher. */
const VIEWPORT: readonly [number, number] = [1280, 900];
const QUIESCE_MATCHES = 3;
const QUIESCE_INTERVAL_MS = 250;
const QUIESCE_TIMEOUT_MS = 20_000;
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
  benchmark: 'drives a continuous load and reports a moving frame time; it never reaches a still frame',
  framework:
    "paints two counters that never stop — HeavyWorker's TickerViewModel steps one on a setInterval, and the Heartbeat component steps the other every 100 ms",
  'framework-sync': 'the same two counters as `framework`, in one thread',
  'example-live': 'a continuously sampled feed is the whole point of the example',
  'example-notes':
    "paints the note's edited time (NotesViewModel: `new Date(note.updatedAt).toLocaleString()`), whose width changes with the clock and reflows the line around it",
  'example-theme':
    'paints the time the tree was built (ThemeExampleApp: `new Date().toLocaleTimeString()`), which re-wraps the paragraph it sits in when its width changes',
  'example-transitions':
    'plays a video: the second card decodes an MP4 continuously, so the frame on screen depends on when the shot was taken and the route never reaches a still frame',
  'transitions-app': 'the same example as `example-transitions`, and the same video, with the shell taken away'
};

/*
 * The two timestamp routes are the more interesting exclusions: they
 * passed twice in a row and then started failing by 1.5%, because two
 * runs a minute apart render the same-width string and two runs an hour
 * apart do not — the kind of gate that is green until it is
 * inexplicably red. Freezing the clock cannot be done from the outside
 * either: `Page.addScriptToEvaluateOnNewDocument` does not reach a
 * worker, and both times are rendered in the render worker.
 *
 * Covering the ticker routes would take a "still" mode in the playground: a
 * flag that reaches the data worker (whose `location` is its own script,
 * not the page's, so it would have to arrive on the worker URL or by
 * message) and that `Heartbeat` also reads. That is a test-only branch in
 * three places in the harness, which is why it is not here; what the
 * exclusions cost is coverage of the component runtime's rendering, and
 * `canvas`, `compare` and the five example routes cover that ground from
 * other directions.
 */

const root = join(import.meta.dirname, '..');
const baselineDir = join(root, 'apps', 'playground', 'screenshots');
const manifestPath = join(baselineDir, 'manifest.json');
const update = process.argv.includes('--update');
const onlyRoute = (() => {
  const at = process.argv.indexOf('--route');
  return at === -1 ? undefined : process.argv[at + 1];
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

async function main(): Promise<void> {
  const chrome = findChrome();
  const version = chromeVersion(chrome);
  const profile = mkdtempSync(join(tmpdir(), 'gesso-shots-'));
  let vite: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;

  const routes = ROUTES.filter(route => onlyRoute === undefined || route.id === onlyRoute).filter(
    route => CANNOT_SETTLE[route.id] === undefined
  );
  if (routes.length === 0) {
    throw new Error(`No routes to capture${onlyRoute === undefined ? '' : ` for --route ${onlyRoute}`}.`);
  }

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
      cwd: join(root, 'apps', 'playground'),
      stdio: 'inherit'
    });
    // The page fetches its own baseline to diff against, and `vite
    // preview` serves only the build output, so the baselines are copied
    // in beside it. `dist/` is ignored by git, so this leaves nothing.
    if (!update && existsSync(baselineDir)) {
      const served = join(root, 'apps', 'playground', 'dist', 'screenshots');
      mkdirSync(served, { recursive: true });
      for (const name of readdirSync(baselineDir)) {
        if (name.endsWith('.png') && !name.endsWith('.actual.png')) {
          cpSync(join(baselineDir, name), join(served, name));
        }
      }
    }
    vite = spawn('npx', ['vite', 'preview', '--port', String(VITE_PORT), '--strictPort'], {
      cwd: join(root, 'apps', 'playground'),
      stdio: 'ignore'
    });
    const base = `http://localhost:${VITE_PORT}/`;
    await waitFor('the preview server', async () => ((await fetch(base)).ok ? true : undefined), 30_000);

    ({ browser, devtools } = await openPage(chrome, {
      url: base,
      devtoolsPort: DEVTOOLS_PORT,
      windowSize: VIEWPORT,
      // Some routes are WebGPU; the adapter has to exist for them to paint.
      flags: WEBGPU_FLAGS,
      profileDir: profile
    }));

    if (update) {
      mkdirSync(baselineDir, { recursive: true });
    }

    for (const route of routes) {
      // Through about:blank, so each route is a real document load and
      // cannot inherit the last one's state. Navigating straight from one
      // hash to another would be a same-document navigation, and a reload
      // issued to force the point races the navigation it follows — which
      // is how this first hung, with a `Runtime.evaluate` whose context
      // had been torn down never getting a reply.
      await devtools.send('Page.navigate', { url: 'about:blank' });
      await devtools.send('Page.navigate', { url: `${base}#${route.id}` });

      const name = `${route.id}.png`;
      const file = join(baselineDir, name);
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
        if (name.endsWith('.png') && !written.includes(name) && onlyRoute === undefined) {
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
      console.log(`\nwrote ${written.length} baselines and the manifest (${version} on ${process.platform}).`);
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

  const excluded = Object.entries(CANNOT_SETTLE)
    .map(([id, why]) => `  ${id}: ${why}`)
    .join('\n');
  if (failures.length > 0) {
    console.error(`\n${failures.length} route screenshot(s) differ:\n${failures.map(f => `  ${f}`).join('\n')}`);
    console.error('\nIf the change is intended, run `pnpm screenshots:update` and commit the baselines.');
    process.exit(1);
  }
  console.log(`\nroute screenshots ok: ${routes.length} routes match their baselines.`);
  if (excluded.length > 0) {
    console.log(`not covered:\n${excluded}`);
  }
}

main().catch(error => {
  console.error(`\nroute screenshots failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
