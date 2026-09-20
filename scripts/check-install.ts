/**
 * Install check (the first exit criterion).
 *
 * "`npm install gesso-framework` in a fresh Vite project runs the
 * counter example." This script is that sentence, executed: it packs the
 * publishable packages into tarballs, installs them into a copy of
 * `examples/counter` with npm, typechecks that project against the
 * published declarations, runs its vitest suite, builds it with Vite,
 * serves the build, and drives it in headless Chrome until the counter
 * counts.
 *
 * What each step is actually for:
 *
 *   - `pnpm pack` exercises `publishConfig`, which is the only thing that
 *     rewrites each package's `exports` from `src/*.ts` to `dist`. A
 *     workspace link never goes through it, so nothing else in this
 *     repository would notice if it were wrong.
 *   - `tsc --noEmit` in the example runs with `skipLibCheck: false`, so
 *     the rolled-up `.d.ts` files are checked as a consumer sees them.
 *   - The browser step reads the canvas back rather than comparing
 *     screenshots: the count is painted, so there is no DOM to assert on,
 *     and a checksum over the pixels is the honest way to say "this
 *     repainted after a key".
 *   - `vitest run` in the example is F7's half of the same idea: the
 *     point of `gesso-testing` is that somebody outside this workspace
 *     can test a component with it, and only an install proves that.
 *     Nothing else here resolves it any way but through a workspace
 *     link.
 *
 *   node scripts/check-install.ts           # pack, install, build, run
 *   node scripts/check-install.ts --keep    # leave the temp project behind
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DevTools, findChrome, openPage, waitFor } from './lib/devtools.ts';

const PACKAGES = ['core', 'framework', 'components', 'testing', 'devtools'];
const PREVIEW_PORT = 5188;
const DEVTOOLS_PORT = 9338;
const root = join(import.meta.dirname, '..');
const keep = process.argv.includes('--keep');

interface Readback {
  /** Pixels that are not the page's white background. */
  readonly painted: number;
  /** A cheap sum over the pixel bytes, to tell one frame from another. */
  readonly checksum: number;
  readonly width: number;
  readonly height: number;
  /** The bounding box of what was painted, in canvas pixels. */
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const READ_CANVAS = `(() => {
  const canvas = document.querySelector('#app canvas');
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let painted = 0;
  let checksum = 0;
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    checksum = (checksum + r * 3 + g * 5 + b * 7 + a) % 2147483647;
    if (a === 0 || (r >= 250 && g >= 250 && b >= 250)) continue;
    painted++;
    const pixel = i / 4;
    const x = pixel % canvas.width;
    const y = (pixel - x) / canvas.width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { painted, checksum, width: canvas.width, height: canvas.height, minX, minY, maxX, maxY };
})()`;

function run(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

/** Packs each package and returns its tarball path. */
function packPackages(into: string): Map<string, string> {
  const tarballs = new Map<string, string>();
  for (const pkg of PACKAGES) {
    const dir = join(root, 'packages', pkg);
    const before = new Set(readdirSync(into));
    execFileSync('pnpm', ['pack', '--pack-destination', into], { cwd: dir, stdio: 'ignore' });
    const created = readdirSync(into).filter(name => !before.has(name) && name.endsWith('.tgz'));
    if (created.length !== 1) {
      throw new Error(`pnpm pack in packages/${pkg} produced ${created.length} tarballs, expected 1.`);
    }
    tarballs.set(`gesso-${pkg}`, join(into, created[0]));
  }
  return tarballs;
}

/** Asserts the tarball ships `dist` and an `exports` map that points at it. */
function checkTarballShape(pkg: string, tarball: string): void {
  const listing = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
    .split('\n')
    .filter(line => line.length > 0);
  const dist = listing.filter(line => line.includes('/dist/'));
  if (dist.length === 0) {
    throw new Error(`${pkg} ships no dist/: ${listing.slice(0, 10).join(', ')}`);
  }
  if (listing.some(line => line.includes('/src/'))) {
    throw new Error(`${pkg} ships src/, which publishConfig should have replaced with dist/.`);
  }
  const manifest = JSON.parse(
    execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' })
  ) as { exports?: Record<string, unknown> };
  const entry = JSON.stringify(manifest.exports ?? {});
  if (entry.includes('./src/')) {
    throw new Error(`${pkg}'s published exports still point at src: ${entry}`);
  }
  if (!entry.includes('./dist/')) {
    throw new Error(`${pkg}'s published exports do not point at dist: ${entry}`);
  }
}

async function main(): Promise<void> {
  const chrome = findChrome();
  const work = mkdtempSync(join(tmpdir(), 'gesso-install-'));
  const app = join(work, 'app');
  const profile = join(work, 'chrome-profile');
  let preview: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;

  try {
    console.log('building the packages…');
    execFileSync('pnpm', ['--filter', './packages/*', 'build'], { cwd: root, stdio: 'ignore' });

    console.log('packing…');
    const tarballs = packPackages(work);
    for (const [name, tarball] of tarballs) {
      checkTarballShape(name, tarball);
    }

    console.log('installing into a fresh project…');
    cpSync(join(root, 'examples', 'counter'), app, { recursive: true });
    const manifestPath = join(app, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    // Both lists: `gesso-testing` is a dev dependency of a consumer, as
    // it is of anyone who tests components rather than shipping them.
    for (const list of [manifest.dependencies, manifest.devDependencies]) {
      for (const [name, tarball] of tarballs) {
        if (list[name] !== undefined) {
          list[name] = `file:${tarball}`;
        }
      }
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    // npm, not pnpm: the criterion says `npm install`, and npm's flat
    // layout is the one that catches a missing dependency declaration.
    run('npm', ['install', '--no-audit', '--no-fund', '--loglevel', 'error'], app);

    console.log('typechecking the example against the published types…');
    run('npx', ['tsc', '--noEmit'], app);

    console.log("running the example's component tests through gesso-testing…");
    run('npx', ['vitest', 'run'], app);

    console.log('building the example…');
    run('npx', ['vite', 'build', '--logLevel', 'warn'], app);

    console.log('serving and driving it…');
    preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
      cwd: app,
      stdio: 'ignore'
    });
    const pageUrl = `http://localhost:${PREVIEW_PORT}/`;
    await waitFor('the preview server', async () => ((await fetch(pageUrl)).ok ? true : undefined), 30_000);

    ({ browser, devtools } = await openPage(chrome, {
      url: pageUrl,
      devtoolsPort: DEVTOOLS_PORT,
      windowSize: [800, 600],
      profileDir: profile
    }));

    const first = await waitFor(
      'the counter to paint',
      async () => {
        const value = await devtools!.evaluate<Readback | null>(READ_CANVAS);
        return value !== null && value.painted > 0 ? value : undefined;
      },
      30_000
    );
    console.log(`  painted ${first.painted} pixels on a ${first.width}×${first.height} canvas`);

    // Click the `+1`. Its position comes from the render rather than from
    // arithmetic over the font: the button is the last thing in the row, so
    // the rightmost painted pixels are its label, and both cells are
    // vertically centred on the same line. A core `Button` is
    // pointer-activated — Enter-to-click belongs to `gesso-components`'
    // Inputs tier, not to the primitive — so a click is what there is.
    const x = first.maxX - 3;
    const y = Math.round((first.minY + first.maxY) / 2);
    for (const type of ['mousePressed', 'mouseReleased'] as const) {
      await devtools.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }

    // Move the pointer off the button before reading again. A `Button`
    // publishes hover and press through `BUTTON_INTERACTION`, so a
    // checksum taken with the cursor still on it would prove only that
    // the button noticed the mouse — which it would do whether or not
    // the click reached `onClick`. With hover cleared, a difference from
    // the first frame can only be the count.
    await devtools.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });

    const second = await waitFor(
      `the count to change after clicking (${x}, ${y})`,
      async () => {
        const value = await devtools!.evaluate<Readback | null>(READ_CANVAS);
        return value !== null && value.checksum !== first.checksum ? value : undefined;
      },
      10_000
    );
    console.log(
      `  clicking (${x}, ${y}) changed the count with the pointer away ` +
        `(checksum ${first.checksum} → ${second.checksum}, painted ${first.painted} → ${second.painted})`
    );
    console.log('\ninstall check ok: the packed packages install, typecheck, build and count.');
  } finally {
    devtools?.close();
    browser?.kill();
    preview?.kill();
    if (keep) {
      console.log(`temp project kept at ${app}`);
    } else {
      // Never let cleanup mask the failure that brought us here: Chrome
      // and npm can still be releasing files as this runs, and an
      // ENOTEMPTY thrown from a finally block replaces the real error.
      try {
        rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch (error) {
        console.warn(`could not remove ${work}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

main().catch(error => {
  console.error(`\ninstall check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
