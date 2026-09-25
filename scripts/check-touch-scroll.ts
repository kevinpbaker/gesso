/**
 * A finger on a surface that overflows both ways, in a real browser.
 *
 * `UiTouchScroller` classified a scroll container as horizontal or
 * vertical from its flex direction and asked it for that one axis, so
 * a container overflowing both ways dropped every delta on the other.
 * A spreadsheet's viewport is exactly that container, and for ten
 * phases a finger could not move one sideways at all. `UiWheelController`
 * had the same bug and was fixed first; the finger followed much later.
 *
 * Both fixes are covered by specs, and the specs run in Node against
 * synthesised `UiPointerEvent`s. What they cannot reach is everything
 * between a real contact and those events: whether Chrome's
 * `pointerType: 'touch'` reaches the surface at all, whether
 * `touch-action` lets the page keep the gesture instead of panning
 * itself, and whether the recognizer's slop and the platform's agree.
 * The documentation admits this in as many words — "none of this was
 * verified on a physical touchscreen" — and a hand is still not
 * available, but a browser is, and it is the half that can be checked
 * every run rather than once by somebody who remembered to.
 *
 * So: a page with one `ScrollView` over content wider and taller than
 * itself, driven with `Input.dispatchTouchEvent` through the DevTools
 * protocol, and the offset read back off the engine's own scroll
 * notifications.
 *
 *   node scripts/check-touch-scroll.ts
 *   CHROME_BIN=/path/to/chrome node scripts/check-touch-scroll.ts
 *
 * The ports are this script's own, as every script under `scripts/`
 * takes a pair nothing else uses.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DevTools, findChrome, openPage, waitFor } from './lib/devtools.ts';

const ROOT = 'scripts/touch-probe';
const PORT = 5201;
const DEVTOOLS_PORT = 9361;

/** Past the recognizer's 12px touch slop, so the pan is claimed. */
const SLOP = 12;

interface Offset {
  readonly x: number;
  readonly y: number;
}

async function main(): Promise<void> {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'gesso-touch-probe-'));
  let server: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;
  const failures: string[] = [];
  try {
    server = spawn('npx', ['vite', ROOT, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
    await waitFor(
      'Vite to serve the probe',
      async () => ((await fetch(`http://localhost:${PORT}/`)).ok ? true : undefined),
      30_000
    );
    ({ browser, devtools } = await openPage(chrome, {
      url: `http://localhost:${PORT}/`,
      devtoolsPort: DEVTOOLS_PORT,
      windowSize: [420, 320],
      profileDir: profile
    }));
    const client = devtools;

    const read = async (): Promise<Offset> => {
      const reply = (await client.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.gessoScroll)',
        returnByValue: true
      })) as { result: { value?: string } };
      return JSON.parse(reply.result.value ?? '{"x":0,"y":0}') as Offset;
    };

    await waitFor(
      'the surface to mount',
      async () => {
        const reply = (await client.send('Runtime.evaluate', {
          expression: 'typeof window.gessoScroll === "object"',
          returnByValue: true
        })) as { result: { value?: boolean } };
        return reply.result.value === true ? true : undefined;
      },
      30_000
    );

    const touch = async (type: string, x: number, y: number): Promise<void> => {
      await client.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }]
      });
    };

    /** One drag, in steps, so the recognizer sees movement rather than a jump. */
    const drag = async (from: Offset, to: Offset, steps = 8): Promise<void> => {
      await touch('touchStart', from.x, from.y);
      for (let step = 1; step <= steps; step++) {
        const at = step / steps;
        await touch('touchMove', from.x + (to.x - from.x) * at, from.y + (to.y - from.y) * at);
      }
      await touch('touchEnd', to.x, to.y);
      // A frame for the offset to be written, and for a fling to start.
      await new Promise(resolve => setTimeout(resolve, 120));
    };

    const reset = async (): Promise<void> => {
      await client.send('Runtime.evaluate', { expression: 'location.reload()' });
      await waitFor(
        'the surface to mount again',
        async () => {
          const reply = (await client.send('Runtime.evaluate', {
            expression: 'typeof window.gessoScroll === "object" ? JSON.stringify(window.gessoScroll) : null',
            returnByValue: true
          })) as { result: { value?: string | null } };
          return reply.result.value === '{"x":0,"y":0}' ? true : undefined;
        },
        30_000
      );
    };

    // 1. Sideways. The case that did not work at all.
    await drag({ x: 300, y: 130 }, { x: 300 - SLOP - 80, y: 130 });
    const sideways = await read();
    console.log(`  a sideways drag:   x ${sideways.x.toFixed(0)}, y ${sideways.y.toFixed(0)}`);
    if (sideways.x < 40) {
      failures.push(
        `a sideways drag of 80px moved the content ${sideways.x.toFixed(0)}px on x; it should move most of it`
      );
    }
    if (sideways.y > 2) {
      failures.push(`a sideways drag moved the content ${sideways.y.toFixed(0)}px on y, and should move none`);
    }

    // 2. Both axes at once, because a finger moves diagonally.
    await reset();
    await drag({ x: 300, y: 220 }, { x: 300 - SLOP - 70, y: 220 - SLOP - 70 });
    const diagonal = await read();
    console.log(`  a diagonal drag:   x ${diagonal.x.toFixed(0)}, y ${diagonal.y.toFixed(0)}`);
    if (diagonal.x < 40 || diagonal.y < 40) {
      failures.push(
        `a diagonal drag moved the content to (${diagonal.x.toFixed(0)}, ${diagonal.y.toFixed(0)}); ` +
          'both axes should move'
      );
    }

    // 3. The axis that still has room keeps taking the gesture when the
    //    other is spent.
    await reset();
    // Down the middle, well clear of either scrollbar, repeatedly, until
    // the vertical axis has nothing left. Four drags of the viewport's
    // height clears 580px of overflow with room to spare.
    for (let pull = 0; pull < 4; pull++) {
      await drag({ x: 180, y: 230 }, { x: 180, y: 20 }, 10);
    }
    const spent = await read();
    const maximum = (await (async () => {
      const reply = (await client.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.gessoMaximum)',
        returnByValue: true
      })) as { result: { value?: string } };
      return JSON.parse(reply.result.value ?? '{"x":0,"y":0}') as Offset;
    })())!;
    // The premise of the case, asserted rather than assumed: a test that
    // quietly stopped exhausting the axis would go on passing while
    // checking nothing.
    if (spent.y < maximum.y - 1) {
      failures.push(
        `the setup for the chaining case did not exhaust the vertical axis: ` +
          `y is ${spent.y.toFixed(0)} of ${maximum.y.toFixed(0)}`
      );
    }
    await drag({ x: 300, y: 130 }, { x: 40, y: 130 }, 12);
    const thenSideways = await read();
    console.log(
      `  spent, then across: x ${thenSideways.x.toFixed(0)}, y ${thenSideways.y.toFixed(0)} ` +
        `(y reached ${spent.y.toFixed(0)} of ${maximum.y.toFixed(0)})`
    );
    if (thenSideways.x < 40) {
      failures.push('after a drag that exhausted the vertical axis, a sideways drag moved nothing');
    }

    if (failures.length === 0) {
      console.log('\nA real finger scrolls a two-axis surface on both of its axes, sideways and diagonally.');
    }
  } finally {
    browser?.kill();
    server?.kill('SIGKILL');
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome can still be letting go of its profile; the OS will.
    }
  }

  if (failures.length > 0) {
    console.error('\nTouch scroll check failed:');
    for (const failure of failures) {
      console.error(`  ${failure}`);
    }
    process.exitCode = 1;
  }
}

await main();
