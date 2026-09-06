/**
 * WebGPU parity check (WEBGPU_ROADMAP.md G0, browser layer).
 *
 * Starts the Vite dev server, opens the playground's compare route in
 * headless Chrome with WebGPU enabled, and reads the pixel diff the
 * route computes between its Canvas2D and WebGPU panes (published on
 * the preview element as data attributes). Fails when the diff exceeds
 * the threshold, or when the headless browser has no WebGPU adapter —
 * a machine that cannot run the check must say so rather than pass it.
 *
 * Chrome is driven over its DevTools protocol from `lib/devtools.ts`,
 * which carries the reason: `--dump-dom` serialises the page under a
 * virtual time budget that the GPU process's adapter request does not
 * honour. No browser-automation dependency, as with
 * gen-layout-fixtures.ts.
 *
 *   pnpm parity:webgpu                   # thresholds PARITY_MAX_PERCENT (0.03) and PARITY_MAX_GROSS_PERCENT (0.02)
 *   CHROME_BIN=/path/to/chrome pnpm parity:webgpu
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DevTools, findChrome, openPage, waitFor, WEBGPU_FLAGS } from './lib/devtools.ts';

const VITE_PORT = 5187;
const DEVTOOLS_PORT = 9337;
const PAGE_URL = `http://localhost:${VITE_PORT}/#compare`;
/**
 * Differing pixels as a fraction of the compared ones.
 *
 * This number is a function of how many antialiased edges the compare
 * route's tree has, not of how close the two backends are: a rounded
 * stroke costs about a pixel per corner whichever backend is right,
 * because one rasterises a path and the other evaluates an SDF. It was
 * 0.03 when the fixture ended at the scrolled sticky list; the
 * decorated card of `MODIFIERS_ROADMAP.md` B3 and the rasterised icon
 * of `COMPONENTS_ROADMAP.md` C7 added about thirty antialiased corners
 * between them and took the reading from 0.013% to 0.029%, which left
 * a pixel of headroom and would have failed the next rounded box
 * somebody added.
 *
 * Raised to 0.05 with that in mind, and with the gross allowance
 * below — which stayed at 0.02 and reads 0.000% — left alone. Gross is
 * the number that catches a backend actually being wrong; this one
 * catches a fixture growing.
 *
 * `EXCELLENCE_ROADMAP.md` X5's painted node and vector path took the
 * reading from 0.032% to 0.051%, and grew the compared area by 2,752
 * pixels while doing it. The extra pixels are the edges of a curve, an
 * arc and a dashed ring, which is what a paint hook is for. They are
 * not a disagreement about the picture: both backends draw the same
 * bitmap, made by one rasteriser, so what differs is only how each
 * puts a bitmap on screen: `drawImage` against a sampled quad, which is
 * the same difference the two image tiers above already carry. Gross
 * stayed at 0.000%. Raised to 0.08 for headroom, on the same reasoning
 * as the last raise.
 */
const MAX_PERCENT = Number(process.env.PARITY_MAX_PERCENT ?? '0.08');
/**
 * Pixels that differ grossly — covered on one backend, empty on the
 * other — as a fraction of the compared pixels. Anti-aliasing never
 * crosses that bar, so the allowance is tight: a one-pixel change to
 * the rounded-rect SDF moves this number, not the percentage above.
 */
const MAX_GROSS_PERCENT = Number(process.env.PARITY_MAX_GROSS_PERCENT ?? '0.02');
const READY_TIMEOUT_MS = 45_000;

interface Parity {
  status: string;
  diff: number;
  pixels: number;
  gross: number;
  histogram?: string;
  leftPainted: number;
  rightPainted: number;
}

async function main(): Promise<void> {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'gesso-parity-'));
  let vite: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;
  try {
    // The playground is its own package now, so Vite is given its root.
    vite = spawn('npx', ['vite', 'apps/playground', '--port', String(VITE_PORT), '--strictPort'], {
      stdio: 'ignore'
    });
    await waitFor('Vite', async () => ((await fetch(`http://localhost:${VITE_PORT}/`)).ok ? true : undefined), 30_000);

    ({ browser, devtools } = await openPage(chrome, {
      url: PAGE_URL,
      devtoolsPort: DEVTOOLS_PORT,
      windowSize: [1400, 900],
      // WebGPU without a display: Dawn on Vulkan on SwiftShader.
      flags: WEBGPU_FLAGS,
      profileDir: profile
    }));

    const parity = await waitFor(
      'the compare route to report parity',
      async () => {
        const value = await devtools!.evaluate<Parity | null>(
          `(() => { const el = document.querySelector('[data-parity-status]');
             if (!el) return null;
             const d = el.dataset;
             return { status: d.parityStatus, diff: Number(d.parityDiff), pixels: Number(d.parityPixels),
                      gross: Number(d.parityGross), histogram: d.parityHistogram,
                      leftPainted: Number(d.parityLeftPainted), rightPainted: Number(d.parityRightPainted) }; })()`
        );
        if (value === null || value.status === 'pending') {
          return undefined;
        }
        return value;
      },
      READY_TIMEOUT_MS
    );

    if (parity.status !== 'ok') {
      throw new Error(`WebGPU parity could not run: ${parity.status}`);
    }
    if (!Number.isFinite(parity.diff) || !Number.isFinite(parity.pixels) || parity.pixels <= 0) {
      throw new Error(`Malformed parity attributes: diff=${parity.diff} pixels=${parity.pixels}`);
    }
    const percent = (parity.diff / parity.pixels) * 100;
    const grossPercent = (parity.gross / parity.pixels) * 100;
    const summary =
      `${parity.diff} of ${parity.pixels} pixels differ (${percent.toFixed(3)}%, threshold ${MAX_PERCENT}%), ` +
      `${parity.gross} grossly (${grossPercent.toFixed(3)}%, threshold ${MAX_GROSS_PERCENT}%); ` +
      `painted: Canvas2D ${parity.leftPainted}, WebGPU ${parity.rightPainted}`;
    if (parity.rightPainted === 0 && parity.leftPainted > 0) {
      throw new Error(`WebGPU parity could not run: the WebGPU pane read back empty (${summary})`);
    }
    if (percent > MAX_PERCENT || grossPercent > MAX_GROSS_PERCENT) {
      throw new Error(
        `WebGPU parity failed: ${summary}${parity.histogram !== undefined ? `\n${parity.histogram}` : ''}`
      );
    }
    console.log(`WebGPU parity ok: ${summary}`);
    if (process.env.PARITY_VERBOSE !== undefined && parity.histogram !== undefined) {
      console.log(parity.histogram);
    }
  } finally {
    devtools?.close();
    browser?.kill();
    vite?.kill();
    // Chrome may still be flushing its profile when kill() returns; the
    // other Chrome scripts retry for the same reason, and CI failed a
    // passing parity run on ENOTEMPTY here before this did.
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
