/**
 * A command's extra arguments, watched crossing a real Worker.
 *
 * `decisions/0080` made a channel command carry every argument: the
 * first as `payload`, the others in `rest`, spread back out for the
 * handler on the far side. That was specified over a `MessageChannel`
 * in `Channel.spec.ts` and again in Segue's wiring spec, and the record
 * admits that no `rest` had been seen leaving a real thread: vitest
 * runs in node, and node has no Web `Worker`.
 *
 * This is the check the record asked for. `rest-probe/` is a page with
 * one channel served from a module worker, the way an application
 * worker serves its channels. The page sends `move(2, 7, why)` and the
 * worker publishes two things back: what its handler was called with,
 * and what the message looked like on the port before `provide` took it
 * apart. Both are read here through Chrome's DevTools protocol, so the
 * check is of the real transport rather than of a double of it.
 *
 *   node scripts/check-rest-across-worker.ts
 *   CHROME_BIN=/path/to/chrome node scripts/check-rest-across-worker.ts
 *
 * The ports are this script's own, as every script under `scripts/`
 * takes a pair nothing else uses.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DevTools, findChrome, openPage, waitFor } from './lib/devtools.ts';

const ROOT = 'scripts/rest-probe';
const PORT = 5194;
const DEVTOOLS_PORT = 9354;

interface Wire {
  readonly type: string;
  readonly command: string;
  readonly payload: unknown;
  readonly rest?: unknown[];
}

interface Result {
  readonly calls: readonly (readonly unknown[])[];
  readonly wire: readonly Wire[];
  readonly errors: readonly string[];
}

async function main(): Promise<void> {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'gesso-rest-probe-'));
  let server: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;
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
      windowSize: [800, 600],
      profileDir: profile
    }));
    const result = await waitFor(
      'the worker to answer the command',
      async () => {
        const seen = await devtools!.evaluate<Result | undefined>('window.gessoProbe');
        if (seen === undefined) {
          return undefined;
        }
        return seen.errors.length > 0 || seen.calls.length > 0 ? seen : undefined;
      },
      30_000
    );

    const failures: string[] = [];
    if (result.errors.length > 0) {
      failures.push(`the channel reported: ${result.errors.join('; ')}`);
    }
    const expectedCall = [2, 7, 'because the check said so'];
    if (JSON.stringify(result.calls) !== JSON.stringify([expectedCall])) {
      failures.push(
        `the handler was called with ${JSON.stringify(result.calls)}, not ${JSON.stringify([expectedCall])}`
      );
    }
    const commands = result.wire.filter(message => message.command === 'move');
    if (commands.length !== 1) {
      failures.push(`${commands.length} move messages arrived on the port, not 1`);
    } else {
      const [message] = commands;
      if (message!.payload !== 2) {
        failures.push(`the message's payload was ${JSON.stringify(message!.payload)}, not 2`);
      }
      if (JSON.stringify(message!.rest) !== JSON.stringify(expectedCall.slice(1))) {
        failures.push(
          `the message's rest was ${JSON.stringify(message!.rest)}, not ${JSON.stringify(expectedCall.slice(1))}`
        );
      }
    }

    console.log(`on the port, in the worker: ${JSON.stringify(commands[0] ?? null)}`);
    console.log(`the handler was called with: ${JSON.stringify(result.calls[0] ?? null)}`);
    if (failures.length > 0) {
      throw new Error(`rest did not cross the worker as declared:\n  ${failures.join('\n  ')}`);
    }
    console.log('rest crossed a real Worker: payload first, the other arguments beside it, spread on arrival.');
  } finally {
    devtools?.close();
    try {
      const version = (await (await fetch(`http://localhost:${DEVTOOLS_PORT}/json/version`)).json()) as {
        webSocketDebuggerUrl: string;
      };
      const client = await DevTools.connect(version.webSocketDebuggerUrl);
      await client.send('Browser.close', {}, 5_000).catch(() => undefined);
      client.close();
    } catch {
      // No endpoint to ask: the kill below is all there is.
    }
    browser?.kill();
    server?.kill();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
