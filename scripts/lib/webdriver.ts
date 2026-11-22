/**
 * Driving Safari over classic WebDriver, through `safaridriver`.
 *
 * `safaridriver` ships with macOS and speaks the W3C protocol over HTTP,
 * so the client is `fetch`. Safari 27's driver can also open a BiDi
 * socket, but its BiDi is still partial, and everything a check needs
 * (navigate, run a script, a screenshot, input actions, the computed
 * role and label of an element) is in the classic protocol.
 *
 * Safari will not be automated until a person has allowed it, once per
 * machine: Safari > Settings > Advanced > "Show features for web
 * developers", then Settings > Developer > "Allow remote automation",
 * then `safaridriver --enable` in a terminal, which asks for a
 * password. The error below says the same when a session is refused.
 *
 * With `simulator`, the same driver is asked for Safari in a booted iOS
 * Simulator: WebKit on iOS with real touch, on the Mac's GPU and memory.
 * On macOS 27 with the iOS 27 simulator the driver has found no session
 * host, so this path is written and not yet seen to work.
 *
 * Set `SAFARIDRIVER_BIN` to choose the driver (Safari Technology
 * Preview carries its own, inside its app bundle).
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import type { BrowserPage, InputSource, OpenOptions } from './browsers.ts';
import { waitFor } from './devtools.ts';

/** This script family's own port for the driver, as each script under `scripts/` takes one. */
const DRIVER_PORT = Number(process.env.SAFARIDRIVER_PORT ?? '9363');
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

const SETUP =
  'Safari has not allowed automation on this Mac. Once per machine: Safari > Settings > Advanced > ' +
  '"Show features for web developers"; Settings > Developer > "Allow remote automation"; then run ' +
  '`safaridriver --enable` in a terminal (it asks for your password).';

class WebDriverError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${DRIVER_PORT}${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(90_000)
  });
  const reply = (await response.json()) as { value: T & { error?: string; message?: string } };
  if (!response.ok || (reply.value !== null && typeof reply.value === 'object' && 'error' in reply.value)) {
    const value = reply.value as { error?: string; message?: string };
    throw new WebDriverError(value.error ?? String(response.status), `${method} ${path}: ${value.message}`);
  }
  return reply.value;
}

export async function openSafari(options: OpenOptions & { readonly simulator: boolean }): Promise<BrowserPage> {
  const driver = spawn(process.env.SAFARIDRIVER_BIN ?? 'safaridriver', ['-p', String(DRIVER_PORT)], {
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let said = '';
  driver.stderr.setEncoding('utf8');
  driver.stderr.on('data', (chunk: string) => {
    said = (said + chunk).slice(-4000);
  });
  const stop = (): void => {
    driver.kill();
  };

  let session: string;
  let version: string;
  try {
    await waitFor(
      'safaridriver to listen',
      async () => ((await call<{ ready: boolean }>('GET', '/status')).ready ? true : undefined),
      15_000
    ).catch(error => {
      throw new Error(
        `${error instanceof Error ? error.message : error}${said ? `\nsafaridriver said:\n${said}` : ''}`
      );
    });
    const capabilities: Record<string, unknown> = { browserName: 'safari' };
    if (options.simulator) {
      capabilities.platformName = 'iOS';
      capabilities['safari:useSimulator'] = true;
      if (options.device !== undefined) {
        capabilities['safari:deviceName'] = options.device;
      }
    }
    let created: { sessionId: string; capabilities: { browserVersion: string } };
    try {
      created = await call('POST', '/session', { capabilities: { alwaysMatch: capabilities } });
    } catch (error) {
      if (error instanceof Error && /remote automation|--enable|authenticat/i.test(error.message)) {
        throw new Error(`${SETUP}\n(${error.message})`);
      }
      if (options.simulator && error instanceof Error && /session hosts/i.test(error.message)) {
        // Seen on macOS 27 with an iOS 27 simulator booted and Safari
        // running in it, and its Safari settings have no Remote
        // Automation switch to turn on. CONTRIBUTING says how to check
        // iOS by hand meanwhile.
        throw new Error(
          `safaridriver found no iOS Simulator Safari to drive. Boot one and open Safari in it; on macOS 27 with ` +
            `the iOS 27 simulator this has not worked yet, and CONTRIBUTING says how to check iOS by hand.\n(${error.message})`
        );
      }
      throw error;
    }
    session = created.sessionId;
    version = created.capabilities.browserVersion;
    await call('POST', `/session/${session}/timeouts`, { script: 60_000, pageLoad: 60_000 });
  } catch (error) {
    stop();
    throw error;
  }
  const at = (path: string): string => `/session/${session}${path}`;

  const evaluate = async <T>(expression: string): Promise<T> => {
    const reply = await call<{ ok: boolean; undefined?: boolean; value?: T; error?: string }>(
      'POST',
      at('/execute/async'),
      {
        script: `const done = arguments[arguments.length - 1];
          Promise.resolve().then(() => (${expression})).then(
            v => done({ ok: true, undefined: v === undefined, value: v === undefined ? null : v }),
            e => done({ ok: false, error: String((e && e.stack) || e) }));`,
        args: []
      }
    );
    if (!reply.ok) {
      throw new Error(`Evaluation threw: ${reply.error}`);
    }
    return (reply.undefined ? undefined : reply.value) as T;
  };

  if (!options.simulator) {
    // The window's size includes its toolbar, and the check wants the
    // viewport, so the window is grown by whatever the toolbar took.
    const [width, height] = options.viewport;
    await call('POST', at('/window/rect'), { width, height });
    const inner = await evaluate<[number, number]>('[innerWidth, innerHeight]');
    await call('POST', at('/window/rect'), { width: width * 2 - inner[0], height: height * 2 - inner[1] });
  }

  const elementOf = async (selector: string): Promise<string | undefined> => {
    try {
      const found = await call<Record<string, string>>('POST', at('/element'), {
        using: 'css selector',
        value: selector
      });
      return found[ELEMENT];
    } catch (error) {
      if (error instanceof WebDriverError && error.code === 'no such element') return undefined;
      throw error;
    }
  };

  return {
    name: `${options.simulator ? 'iOS Simulator Safari' : 'Safari'} ${version}`,
    async navigate(url) {
      await call('POST', at('/url'), { url });
    },
    evaluate,
    async screenshot() {
      return Buffer.from(await call<string>('GET', at('/screenshot')), 'base64');
    },
    async bringToFront() {
      // Switching to the window it is already on is how classic
      // WebDriver asks for it to be focused.
      await call('POST', at('/window'), { handle: await call<string>('GET', at('/window')) });
    },
    async perform(sources: readonly InputSource[]) {
      await call('POST', at('/actions'), { actions: sources });
      await call('DELETE', at('/actions'));
    },
    async exposes(selector, role, name) {
      const element = await elementOf(selector);
      if (element === undefined) {
        return `nothing matches ${selector}`;
      }
      const computedRole = await call<string>('GET', at(`/element/${element}/computedrole`));
      const computedLabel = await call<string>('GET', at(`/element/${element}/computedlabel`));
      return computedRole === role && computedLabel === name
        ? undefined
        : `role ${computedRole || '(none)'} named '${computedLabel}'`;
    },
    drainLoggedErrors() {
      // Classic WebDriver has no log; the page's own trap is the only witness.
      return [];
    },
    async close() {
      await call('DELETE', at('')).catch(() => undefined);
      await sleep(200);
      stop();
    }
  };
}
