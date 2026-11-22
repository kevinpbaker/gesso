/**
 * Driving Firefox over WebDriver BiDi.
 *
 * Firefox serves BiDi itself when started with `--remote-debugging-port`:
 * a WebSocket at `ws://127.0.0.1:<port>/session`. So there is no
 * geckodriver to install, and the client is the same shape as
 * `devtools.ts`: send a command, await the reply with that id.
 *
 * Set `FIREFOX_BIN` to choose the binary.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserPage, InputSource, OpenOptions } from './browsers.ts';

const FIREFOX_CANDIDATES = [
  'firefox',
  '/Applications/Firefox.app/Contents/MacOS/firefox',
  '/Applications/Firefox Nightly.app/Contents/MacOS/firefox'
];

export function findFirefox(): string {
  const candidates = process.env.FIREFOX_BIN ? [process.env.FIREFOX_BIN] : FIREFOX_CANDIDATES;
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try the next name
    }
  }
  throw new Error(`No Firefox binary found. Tried: ${candidates.join(', ')}. Set FIREFOX_BIN.`);
}

interface Message {
  id?: number;
  type?: 'success' | 'error' | 'event';
  result?: unknown;
  error?: string;
  message?: string;
  method?: string;
  params?: unknown;
}

/** A minimal BiDi client: send a command, await its reply; events go to listeners. */
export class Bidi {
  private nextId = 1;
  private readonly pending = new Map<number, (message: Message) => void>();
  private readonly listeners = new Map<string, ((params: unknown) => void)[]>();
  private readonly socket: WebSocket;

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data)) as Message;
      if (message.type === 'event' && message.method !== undefined) {
        for (const listener of this.listeners.get(message.method) ?? []) {
          listener(message.params);
        }
      } else if (message.id !== undefined) {
        this.pending.get(message.id)?.(message);
        this.pending.delete(message.id);
      }
    });
  }

  static async connect(url: string): Promise<Bidi> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error(`Could not connect to ${url}`)), { once: true });
    });
    return new Bidi(socket);
  }

  /** Sends one command and awaits its reply; see `DevTools.send` for why it times out. */
  send<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`BiDi ${method} did not reply within ${timeoutMs} ms.`));
      }, timeoutMs);
      this.pending.set(id, message => {
        clearTimeout(timer);
        if (message.type === 'error') {
          reject(new Error(`BiDi ${method}: ${message.error}: ${message.message}`));
        } else {
          resolve(message.result as T);
        }
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event: string, listener: (params: unknown) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  close(): void {
    this.socket.close();
  }
}

/**
 * Starts Firefox and returns its one tab.
 *
 * The port is 0, so Firefox picks a free one and says which on its error
 * output. A Firefox with an update waiting to be applied applies it on
 * the next start and opens no port at all until it has, which is the
 * one start-up failure seen on a working machine; the error says so.
 */
export async function openFirefox(options: OpenOptions): Promise<BrowserPage> {
  const binary = findFirefox();
  // A fresh profile every run. The remote agent applies its own
  // recommended preferences to it (no updates, no first-run pages, focus
  // that behaves in a background window), and nothing more is needed.
  const profile = mkdtempSync(join(tmpdir(), 'gesso-firefox-'));
  const [width, height] = options.viewport;
  const browser = spawn(
    binary,
    [
      ...(options.headed ? [] : ['--headless']),
      '--no-remote',
      '--profile',
      profile,
      `--width=${width}`,
      `--height=${height}`,
      '--remote-debugging-port=0',
      'about:blank'
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let said = '';
  browser.stderr.setEncoding('utf8');
  const endpoint = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            'Firefox opened no WebDriver BiDi endpoint within 45 s. If it has an update waiting, it applies it ' +
              'on this start and opens nothing; start it once by hand and try again.' +
              (said.trim() === '' ? '' : `\nFirefox said:\n${said.trim().slice(-2000)}`)
          )
        ),
      45_000
    );
    browser.stderr.on('data', (chunk: string) => {
      said = (said + chunk).slice(-8000);
      const match = /WebDriver BiDi listening on (ws:\/\/\S+)/.exec(said);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    });
    browser.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Firefox exited with code ${code} before it opened its endpoint.\n${said.trim()}`));
    });
  });

  const cleanUp = (): void => {
    browser.kill();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  let bidi: Bidi;
  let context: string;
  let version: string;
  try {
    bidi = await Bidi.connect(`${await endpoint}/session`);
    const session = await bidi.send<{ capabilities: { browserVersion: string } }>('session.new', { capabilities: {} });
    version = session.capabilities.browserVersion;
    const tree = await bidi.send<{ contexts: { context: string }[] }>('browsingContext.getTree', { maxDepth: 0 });
    context = tree.contexts[0]!.context;
    await bidi.send('browsingContext.setViewport', { context, viewport: { width, height }, devicePixelRatio: 1 });
  } catch (error) {
    cleanUp();
    throw error;
  }

  // Worker realms log here too, which the page's own error trap cannot see.
  const logged: string[] = [];
  bidi.on('log.entryAdded', params => {
    const entry = params as { level: string; type: string; text: string | null; source?: { realm?: string } };
    if (entry.level === 'error') {
      logged.push(`${entry.type}: ${entry.text ?? ''}`.slice(0, 400));
    }
  });
  await bidi.send('session.subscribe', { events: ['log.entryAdded'] });

  const sharedIdOf = async (selector: string): Promise<string | undefined> => {
    const found = await bidi.send<{ nodes: { sharedId: string }[] }>('browsingContext.locateNodes', {
      context,
      locator: { type: 'css', value: selector },
      maxNodeCount: 1
    });
    return found.nodes[0]?.sharedId;
  };
  /** Whether the element itself (not a descendant) matches an accessibility locator. */
  const matches = async (sharedId: string, value: { role?: string; name?: string }): Promise<boolean> => {
    const found = await bidi.send<{ nodes: { sharedId: string }[] }>('browsingContext.locateNodes', {
      context,
      locator: { type: 'accessibility', value },
      startNodes: [{ sharedId }],
      maxNodeCount: 1
    });
    return found.nodes[0]?.sharedId === sharedId;
  };

  return {
    name: `Firefox ${version}`,
    async navigate(url) {
      await bidi.send('browsingContext.navigate', { context, url, wait: 'complete' }, 60_000);
    },
    async evaluate<T>(expression: string): Promise<T> {
      // Serialised in the page, because a BiDi remote value is a tagged
      // tree that would need a deserialiser of its own to read back.
      const reply = await bidi.send<{
        type: 'success' | 'exception';
        result?: { value?: string };
        exceptionDetails?: { text: string };
      }>(
        'script.evaluate',
        {
          expression: `Promise.resolve(${expression}).then(v => v === undefined ? undefined : JSON.stringify(v))`,
          target: { context },
          awaitPromise: true,
          resultOwnership: 'none'
        },
        30_000
      );
      if (reply.type === 'exception') {
        throw new Error(`Evaluation threw: ${reply.exceptionDetails?.text}`);
      }
      const value = reply.result?.value;
      return (value === undefined ? undefined : JSON.parse(value)) as T;
    },
    async screenshot() {
      const reply = await bidi.send<{ data: string }>('browsingContext.captureScreenshot', { context });
      return Buffer.from(reply.data, 'base64');
    },
    async bringToFront() {
      await bidi.send('browsingContext.activate', { context });
    },
    async perform(sources: readonly InputSource[]) {
      await bidi.send('input.performActions', { context, actions: sources });
      await bidi.send('input.releaseActions', { context });
    },
    async exposes(selector, role, name) {
      const sharedId = await sharedIdOf(selector);
      if (sharedId === undefined) {
        return `nothing matches ${selector}`;
      }
      if (await matches(sharedId, { role, name })) {
        return undefined;
      }
      // BiDi can match an accessible role and name but not read one, so
      // the miss is narrowed to which half the engine disagrees with.
      if (await matches(sharedId, { name })) {
        return `the name, with another role than ${role}`;
      }
      if (await matches(sharedId, { role })) {
        return `the role, with another name than '${name}'`;
      }
      return 'neither that role nor that name';
    },
    drainLoggedErrors() {
      return logged.splice(0);
    },
    async close() {
      await bidi.send('browser.close', {}, 5_000).catch(() => undefined);
      bidi.close();
      cleanUp();
    }
  };
}
