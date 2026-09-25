/**
 * What a worker application sends to the thread it is protecting.
 *
 * Gesso's claim is that the main thread creates a canvas, forwards
 * input and does nothing else. A bundle is where that claim is either
 * true or quietly false: a shell that *runs* none of the layout engine
 * still pays for it if it *imports* it, in bytes over the wire and in
 * parse time on the one thread that cannot afford either.
 *
 * It was quietly false until the single-thread configuration moved out
 * of `createApp` into `createSyncApp`. One function with two overloads
 * meant one module graph, and a bundler cannot know which half of it a
 * given call reaches — so the engine was in every shell whether or not
 * anything called it. The measurement then: 169.3 kB gzipped. Now:
 * around twelve.
 *
 * Two assertions, because the number alone is the weaker one.
 *
 *   - **A budget**, in the style of the frame budgets: a ceiling with
 *     real headroom, which catches the engine coming back without
 *     nagging about a legitimate kilobyte.
 *   - **The absence of the engine**, by looking for Canvas2D calls in
 *     the shell's bytes. `fillText` and `measureText` are property
 *     names on a browser object, so no minifier can rename them and no
 *     rasterizer can avoid them. This is the assertion that says what
 *     the budget means.
 *
 *   node scripts/check-bundle-size.ts
 *   node scripts/check-bundle-size.ts --report    # sizes, no verdict
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * The ceiling for a worker application's main thread, gzipped.
 *
 * Twelve and a bit kilobytes today. The headroom is for the shell
 * growing a feature, not for the engine coming back: the engine is a
 * hundred and fifty, so this fails by an order of magnitude on the one
 * regression it exists to catch.
 */
const SHELL_BUDGET = 20_000;

/** Canvas2D calls, which only a rasterizer makes and no minifier renames. */
const ENGINE_MARKERS = ['fillText', 'measureText', 'roundRect', 'bezierCurveTo', 'createLinearGradient'] as const;

interface Measured {
  readonly raw: number;
  readonly gzip: number;
  readonly code: string;
}

async function measure(entry: string, outDir: string): Promise<Measured> {
  await build({
    logLevel: 'silent',
    resolve: {
      alias: {
        'gesso-framework': at('../packages/framework/src/index.ts'),
        'gesso-core': at('../packages/core/src/index.ts'),
        'gesso-components': at('../packages/components/src/index.ts')
      }
    },
    build: {
      lib: { entry: at(entry), formats: ['es'], fileName: 'out' },
      outDir: at(outDir),
      minify: true,
      emptyOutDir: true,
      reportCompressedSize: false
    }
  });
  const code = readFileSync(at(`${outDir}/out.js`), 'utf8');
  return { raw: Buffer.byteLength(code), gzip: gzipSync(code).byteLength, code };
}

const kb = (bytes: number): string => `${(bytes / 1000).toFixed(1)} kB`;

async function main(): Promise<void> {
  const report = process.argv.includes('--report');
  const shell = await measure('./bundle-probe/shell.ts', './bundle-probe/.out-shell');
  const sync = await measure('./bundle-probe/sync.ts', './bundle-probe/.out-sync');
  rmSync(at('./bundle-probe/.out-shell'), { recursive: true, force: true });
  rmSync(at('./bundle-probe/.out-sync'), { recursive: true, force: true });

  console.log(`shell (createApp)      ${kb(shell.raw).padStart(9)} raw  ${kb(shell.gzip).padStart(9)} gzip`);
  console.log(`single (createSyncApp) ${kb(sync.raw).padStart(9)} raw  ${kb(sync.gzip).padStart(9)} gzip`);

  if (report) {
    return;
  }

  const failures: string[] = [];
  if (shell.gzip > SHELL_BUDGET) {
    failures.push(
      `The shell is ${kb(shell.gzip)} gzipped, over its ${kb(SHELL_BUDGET)} budget. Something the main thread ` +
        'does not run is now reachable from `createApp`.'
    );
  }
  const found = ENGINE_MARKERS.filter(marker => shell.code.includes(marker));
  if (found.length > 0) {
    failures.push(
      `The shell carries the rasterizer: ${found.join(', ')}. A worker application's main thread must not be able ` +
        'to reach the engine, and something now imports it from a module `createApp` pulls in.'
    );
  }
  const missing = ENGINE_MARKERS.filter(marker => !sync.code.includes(marker));
  if (missing.length === ENGINE_MARKERS.length) {
    failures.push(
      'The single-thread bundle carries no Canvas2D calls at all, so the markers this check looks for no longer ' +
        'say anything about either bundle. Choose new ones.'
    );
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`\n✗ ${failure}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `\n✓ The main thread carries none of the engine, ${kb(shell.gzip)} against a ${kb(SHELL_BUDGET)} budget.`
  );
}

await main();
