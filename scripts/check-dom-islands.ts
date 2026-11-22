/**
 * DOM islands in a real browser: the native fields Chrome's password
 * manager reads, the elements following their boxes, and how far an
 * element trails its box while the page scrolls.
 *
 * The specs cover what islands compute: placements, cuts, the order an
 * update is applied in, the value echoes a field must not write back.
 * What they cannot reach is the browser's side, which is the reason the
 * feature exists at all:
 *
 *   - **The password manager.** The playground's islands route is
 *     opened with chrome://password-manager-internals open beside it,
 *     and the check reads Chrome's own log: the sign-in form parsed with
 *     the email field as its username and the password field as its
 *     password, and a submission seen once the form is sent from the
 *     keyboard.
 *   - **Tracking.** After a scroll and after a resize, each element must
 *     sit over the box the semantics mirror says its node has, within a
 *     pixel.
 *   - **Lag.** The route has a red element over a blue box. The page is
 *     scrolled at a steady speed with the wheel while Chrome's screencast
 *     records composited frames, and the blue strip in each frame is how
 *     far the element is behind the canvas. It is reported, not judged:
 *     headless Chrome composites without a display, so the number is a
 *     guide to a real browser's and not the same thing.
 *
 *   pnpm check:islands
 *   CHROME_BIN=/path/to/chrome pnpm check:islands
 *
 * The ports are this script's own, as every script under `scripts/`
 * takes a pair nothing else uses.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import { DevTools, findChrome, openPage, waitFor } from './lib/devtools.ts';

const PORT = 5203;
const DEVTOOLS_PORT = 9365;
const ROUTE = `http://localhost:${PORT}/#example-islands`;
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function main(): Promise<void> {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'gesso-dom-islands-'));
  let server: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  const failures: string[] = [];
  const check = (ok: boolean, what: string): void => {
    console.log(`${ok ? '✓' : '✗'} ${what}`);
    if (!ok) failures.push(what);
  };
  try {
    server = spawn('npx', ['vite', 'apps/playground', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
    await waitFor(
      'the dev server',
      async () => ((await fetch(`http://localhost:${PORT}/`)).ok ? true : undefined),
      60_000
    );
    const opened = await openPage(chrome, {
      url: ROUTE,
      devtoolsPort: DEVTOOLS_PORT,
      windowSize: [1024, 768],
      profileDir: profile
    });
    browser = opened.browser;
    const page = opened.devtools;

    // The password manager's log only records while its page is open,
    // so it is opened first and the route loaded again under it.
    const target = (await (
      await fetch(`http://localhost:${DEVTOOLS_PORT}/json/new?chrome://password-manager-internals`, { method: 'PUT' })
    ).json()) as { webSocketDebuggerUrl: string };
    const internals = await DevTools.connect(target.webSocketDebuggerUrl);
    await sleep(1000);
    // The new tab took the front, and a hidden page draws nothing.
    await page.send('Page.bringToFront');
    await page.send('Page.reload');
    await waitFor(
      'two native fields',
      async () =>
        (await page.evaluate<number>("document.querySelectorAll('[data-gesso-island-input]').length")) === 2
          ? true
          : undefined,
      30_000
    );
    await sleep(1000);

    // ── The fields ────────────────────────────────────────────────────────
    const fields = await page.evaluate<{ name: string; type: string; autocomplete: string; form: string | null }[]>(
      `[...document.querySelectorAll('[data-gesso-island-input]')].map(input => ({
        name: input.name, type: input.type, autocomplete: input.autocomplete,
        form: input.form ? input.form.method + ':' + input.form.getAttribute('name') : null }))`
    );
    check(
      fields.some(f => f.name === 'email' && f.autocomplete === 'username' && f.form === 'post:sign-in') &&
        fields.some(
          f =>
            f.name === 'password' &&
            f.type === 'password' &&
            f.autocomplete === 'current-password' &&
            f.form === 'post:sign-in'
        ),
      'the email and password fields are native inputs in one post form, with username and current-password'
    );
    const parsed = await internals.evaluate<string>('document.body.innerText');
    check(
      /Username element\s*:\s*email/.test(parsed) && /Password element\s*:\s*password/.test(parsed),
      "Chrome's password manager parsed the form: username element email, password element password"
    );

    // ── Tracking ──────────────────────────────────────────────────────────
    const drift = (): Promise<number> =>
      page.evaluate<number>(`(() => {
        let worst = 0;
        for (const element of document.querySelectorAll('[data-gesso-island-input]')) {
          // Off the canvas, a field is not placed at all (and takes no pointer).
          if (element.style.pointerEvents === 'none') continue;
          const id = element.getAttribute('data-gesso-island');
          const stand = [...document.querySelectorAll('[data-gesso-semantics] [id]')].find(e => e.id.endsWith('-' + id));
          if (!stand) return -1;
          const a = element.getBoundingClientRect(), b = stand.getBoundingClientRect();
          worst = Math.max(worst, Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
        }
        return worst;
      })()`);
    const at = await fieldBox(page, 'email');
    // The mirror's boxes, which this compares against, arrive on a sweep
    // of their own after the first frames; the fields are placed on the
    // first frame.
    const rest = await waitFor(
      "the semantics mirror's boxes",
      async () => {
        const off = await drift();
        return off >= 0 && off <= 1 ? off : undefined;
      },
      5000
    ).catch(() => drift());
    check(rest >= 0 && rest <= 1, `each field sits over its node's box at rest (off by ${rest} px)`);
    await wheel(page, at.x + at.width / 2, at.y, 120);
    await sleep(800);
    const scrolled = await drift();
    const moved = await fieldBox(page, 'email');
    check(
      moved.y < at.y - 50 && scrolled >= 0 && scrolled <= 1,
      `after a scroll of ${Math.round(at.y - moved.y)} px each field is over its box (off by ${scrolled} px)`
    );
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 760,
      height: 700,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(1200);
    const resized = await drift();
    check(resized >= 0 && resized <= 1, `after a resize to 760×700 each field is over its box (off by ${resized} px)`);
    await page.send('Emulation.clearDeviceMetricsOverride');
    await sleep(1200);

    // ── The focused field while it moves ──────────────────────────────────
    // Its DOM text hides while the box moves, the canvas draws it there
    // instead, and it shows again on the first still frame.
    const focusAt = await fieldBox(page, 'email');
    await click(page, focusAt.x + 20, focusAt.y + focusAt.height / 2);
    await sleep(300);
    const opacity = (): Promise<string> =>
      page.evaluate<string>('document.querySelector(\'[data-gesso-island-input][name="email"]\').style.opacity');
    const still = await opacity();
    const during: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      await wheel(page, focusAt.x + 20, focusAt.y, index < 6 ? 15 : -15);
      await sleep(16);
      during.push(await opacity());
    }
    await sleep(600);
    const after = await opacity();
    check(
      still === '1' && during.includes('0') && after === '1',
      `a focused field shows its DOM text, hides it while it scrolls, and shows it once still (${still}, ${during.join('')}, ${after})`
    );

    // ── Typing and submitting ─────────────────────────────────────────────
    const email = await fieldBox(page, 'email');
    await click(page, email.x + 20, email.y + email.height / 2);
    await page.send('Input.insertText', { text: 'probe@example.com' });
    await page.pressKey('Tab', 'Tab', 9);
    await sleep(300);
    const focusedName = await page.evaluate<string>("document.activeElement?.getAttribute('name') ?? ''");
    check(
      focusedName === 'password',
      `Tab moves DOM focus from the email field to the password field (${focusedName || 'nothing'})`
    );
    await page.send('Input.insertText', { text: 'hunter22' });
    await page.pressKey('Enter', 'Enter', 13);
    await sleep(1500);
    const signedIn = await page.evaluate<boolean>(
      "document.querySelector('[data-gesso-semantics]')?.textContent?.includes('Signed in as probe@example.com') ?? false"
    );
    check(signedIn, 'Enter in the password field submitted, and the render worker read both values');
    const log = await internals.evaluate<string>('document.body.innerText');
    check(
      /HTML form for submit/.test(log) && /ProvisionallySaveForm/.test(log),
      "Chrome's password manager saw the submission"
    );

    // ── Lag ───────────────────────────────────────────────────────────────
    // A brisk wheel, then a fling: 20 and 80 px every 16 ms.
    await measureLag(page, 20);
    await measureLag(page, 80);
  } finally {
    if (browser !== undefined && browser.exitCode === null) {
      const exited = new Promise(resolve => browser!.once('exit', resolve));
      browser.kill();
      await exited;
    }
    server?.kill();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('\n✓ DOM islands behave in Chrome.');
  }
}

async function fieldBox(page: DevTools, name: string): Promise<Box> {
  return page.evaluate<Box>(
    `(() => { const r = document.querySelector('[data-gesso-island-input][name="${name}"]').getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`
  );
}

async function click(page: DevTools, x: number, y: number): Promise<void> {
  for (const type of ['mousePressed', 'mouseReleased'] as const) {
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
}

async function wheel(page: DevTools, x: number, y: number, deltaY: number): Promise<void> {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
}

/**
 * Scrolls at a steady speed and reads the blue strip beside the red
 * probe in every composited frame.
 */
async function measureLag(page: DevTools, delta: number): Promise<void> {
  const probe = await page.evaluate<Box | null>(`(() => {
    const element = [...document.querySelectorAll('[data-gesso-island]')].find(e => !e.matches('input'));
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  })()`);
  if (probe === null) {
    console.log('· no lag probe on the page; lag not measured');
    return;
  }
  // The probe to the bottom, so a scroll down has the whole page to carry it up.
  await wheel(page, probe.x + probe.width / 2, probe.y, probe.y - 640);
  await sleep(800);
  const start = await page.evaluate<Box>(`(() => {
    const r = [...document.querySelectorAll('[data-gesso-island]')].find(e => !e.matches('input')).getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  })()`);
  const column = Math.round(start.x + start.width / 2);

  const frames: { strip: number; red: number; at: number }[] = [];
  const socket = (page as unknown as { socket: WebSocket }).socket;
  const onMessage = (event: MessageEvent): void => {
    const message = JSON.parse(String(event.data)) as {
      method?: string;
      params?: { data: string; sessionId: number; metadata: { timestamp?: number } };
    };
    if (message.method !== 'Page.screencastFrame' || message.params === undefined) return;
    void page.send('Page.screencastFrameAck', { sessionId: message.params.sessionId });
    const pixels = decodePng(Buffer.from(message.params.data, 'base64'));
    const reading = readColumn(pixels, column);
    if (reading !== null) frames.push({ ...reading, at: message.params.metadata.timestamp ?? 0 });
  };
  socket.addEventListener('message', onMessage);
  await page.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await sleep(300);
  const until = Date.now() + (delta > 40 ? 500 : 1200);
  while (Date.now() < until) {
    await wheel(page, column, start.y, delta);
    await sleep(16);
  }
  await sleep(500);
  await page.send('Page.stopScreencast');
  socket.removeEventListener('message', onMessage);

  const moving = frames.filter((frame, index) => index > 0 && frame.red !== frames[index - 1]!.red);
  if (moving.length < 5) {
    console.log(`· lag: only ${moving.length} moving frames captured; not measured`);
    return;
  }
  const strips = moving.map(frame => frame.strip).sort((a, b) => a - b);
  const steps: number[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    const step = Math.abs(frames[index]!.red - frames[index - 1]!.red);
    if (step > 0) steps.push(step);
  }
  steps.sort((a, b) => a - b);
  const median = (values: number[]): number => values[Math.floor(values.length / 2)] ?? 0;
  const step = median(steps);
  console.log(
    `· lag at ${delta} px per wheel event every 16 ms (headless Chrome, ${moving.length} moving frames): the element trails its box by ` +
      `${median(strips)} px median, ${strips.at(-1)} px worst, at ${step} px per composited frame ` +
      `(${step > 0 ? (median(strips) / step).toFixed(1) : '?'} frames behind); 0 px once still: ` +
      `${frames.at(-1)!.strip} px in the last frame`
  );
}

/** The red probe's top in a column, and the height of the blue strip above or below it. */
function readColumn(pixels: Pixels, x: number): { red: number; strip: number } | null {
  let redTop = -1;
  let redBottom = -1;
  let blue = 0;
  for (let y = 0; y < pixels.height; y += 1) {
    const offset = (y * pixels.width + x) * 4;
    const r = pixels.data[offset]!;
    const g = pixels.data[offset + 1]!;
    const b = pixels.data[offset + 2]!;
    if (r > 200 && g < 70 && b < 70) {
      if (redTop < 0) redTop = y;
      redBottom = y;
    } else if (b > 200 && r < 70 && g < 70) {
      blue += 1;
    }
  }
  if (redTop < 0 && blue === 0) return null;
  return { red: redTop < 0 ? -1 : redTop, strip: redTop < 0 ? blue : Math.min(blue, redBottom - redTop + 1) };
}

interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/**
 * A PNG as RGBA, for the 8-bit colour and colour-with-alpha images a
 * screencast produces. Enough of the format for that and no more.
 */
function decodePng(png: Buffer): Pixels {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const chunks: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      channels = body[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      chunks.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  const line = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    const start = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i += 1) {
      const value = raw[start + i]!;
      const left = i >= channels ? line[i - channels]! : 0;
      const up = previous[i]!;
      const upLeft = i >= channels ? previous[i - channels]! : 0;
      let decoded = value;
      if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + up;
      else if (filter === 3) decoded = value + ((left + up) >> 1);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        decoded = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      }
      line[i] = decoded & 0xff;
    }
    for (let px = 0; px < width; px += 1) {
      out[(y * width + px) * 4] = line[px * channels]!;
      out[(y * width + px) * 4 + 1] = line[px * channels + 1]!;
      out[(y * width + px) * 4 + 2] = line[px * channels + 2]!;
      out[(y * width + px) * 4 + 3] = channels === 4 ? line[px * channels + 3]! : 255;
    }
    previous.set(line);
  }
  return { width, height, data: out };
}

await main();
