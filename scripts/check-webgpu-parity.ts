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
 * Chrome is driven over its DevTools protocol with Node's built-in
 * WebSocket, because `--dump-dom` serialises the page under a virtual
 * time budget that the GPU process's adapter request does not honour.
 * No browser-automation dependency, as with gen-layout-fixtures.ts.
 *
 *   pnpm parity:webgpu                   # thresholds PARITY_MAX_PERCENT (0.03) and PARITY_MAX_GROSS_PERCENT (0.02)
 *   CHROME_BIN=/path/to/chrome pnpm parity:webgpu
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

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
 */
const MAX_PERCENT = Number(process.env.PARITY_MAX_PERCENT ?? '0.05');
/**
 * Pixels that differ grossly — covered on one backend, empty on the
 * other — as a fraction of the compared pixels. Anti-aliasing never
 * crosses that bar, so the allowance is tight: a one-pixel change to
 * the rounded-rect SDF moves this number, not the percentage above.
 */
const MAX_GROSS_PERCENT = Number(process.env.PARITY_MAX_GROSS_PERCENT ?? '0.02');
const READY_TIMEOUT_MS = 45_000;
const CHROME_CANDIDATES = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome'];

interface Parity {
  status: string;
  diff: number;
  pixels: number;
  gross: number;
  histogram?: string;
  leftPainted: number;
  rightPainted: number;
}

function findChrome(): string {
  const candidates = process.env.CHROME_BIN ? [process.env.CHROME_BIN] : CHROME_CANDIDATES;
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try the next name
    }
  }
  throw new Error(`No Chrome binary found. Tried: ${candidates.join(', ')}. Set CHROME_BIN.`);
}

async function waitFor<T>(what: string, probe: () => Promise<T | undefined>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await probe();
      if (result !== undefined) {
        return result;
      }
    } catch {
      // not yet
    }
    await sleep(250);
  }
  throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}.`);
}

/** A minimal DevTools client: send a command, await its reply. */
class DevTools {
  private nextId = 1;
  private readonly pending = new Map<number, (result: unknown) => void>();
  private readonly socket: WebSocket;

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (message.id !== undefined) {
        const resolve = this.pending.get(message.id);
        this.pending.delete(message.id);
        resolve?.(message.error !== undefined ? new Error(message.error.message) : message.result);
      }
    });
  }

  static async connect(url: string): Promise<DevTools> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error(`Could not connect to ${url}`)), { once: true });
    });
    return new DevTools(socket);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, result => (result instanceof Error ? reject(result) : resolve(result)));
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const reply = (await this.send('Runtime.evaluate', { expression, returnByValue: true })) as {
      result: { value: T };
    };
    return reply.result.value;
  }

  close(): void {
    this.socket.close();
  }
}

async function main(): Promise<void> {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'nodal-parity-'));
  let vite: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;
  try {
    vite = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], { stdio: 'ignore' });
    await waitFor('Vite', async () => ((await fetch(`http://localhost:${VITE_PORT}/`)).ok ? true : undefined), 30_000);

    browser = spawn(
      chrome,
      [
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--window-size=1400,900',
        `--user-data-dir=${profile}`,
        `--remote-debugging-port=${DEVTOOLS_PORT}`,
        // WebGPU without a display: Dawn on Vulkan on SwiftShader.
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan',
        '--use-angle=vulkan',
        '--use-vulkan=swiftshader',
        '--ignore-gpu-blocklist',
        PAGE_URL
      ],
      { stdio: 'ignore' }
    );

    const target = await waitFor(
      'the DevTools endpoint',
      async () => {
        const targets = (await (await fetch(`http://localhost:${DEVTOOLS_PORT}/json`)).json()) as {
          type: string;
          url: string;
          webSocketDebuggerUrl: string;
        }[];
        return targets.find(t => t.type === 'page' && t.url.startsWith(`http://localhost:${VITE_PORT}`));
      },
      15_000
    );
    devtools = await DevTools.connect(target.webSocketDebuggerUrl);

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
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
