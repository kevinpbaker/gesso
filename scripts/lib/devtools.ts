/**
 * Driving headless Chrome over the DevTools protocol.
 *
 * Extracted from `check-webgpu-parity.ts` when a second and a third
 * script needed the same launcher. The reason it is the DevTools
 * protocol and not a browser-automation library is the one that script
 * gives: `--dump-dom` serialises the page under a virtual time budget
 * that the GPU process's adapter request does not honour, and Node has
 * a `WebSocket` built in, so the dependency buys nothing.
 *
 * Set `CHROME_BIN` to choose the binary.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME_CANDIDATES = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome'];

/** The flags that make WebGPU work without a display: Dawn on Vulkan on SwiftShader. */
export const WEBGPU_FLAGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-angle=vulkan',
  '--use-vulkan=swiftshader',
  '--ignore-gpu-blocklist'
];

export function findChrome(): string {
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

export async function waitFor<T>(what: string, probe: () => Promise<T | undefined>, timeoutMs: number): Promise<T> {
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
export class DevTools {
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

  /**
   * Sends one command and awaits its reply.
   *
   * The timeout is not belt-and-braces: a `Runtime.evaluate` whose
   * execution context is torn down by a navigation mid-flight can go
   * unanswered forever, and without this the caller's own `waitFor`
   * never gets to time out either, because it is awaiting this promise.
   */
  send(method: string, params: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`DevTools ${method} did not reply within ${timeoutMs} ms.`));
      }, timeoutMs);
      this.pending.set(id, result => {
        clearTimeout(timer);
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve(result);
        }
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Evaluates an expression and returns its value.
   *
   * `awaitPromise` matters for an async expression: without it the reply
   * carries the Promise itself and the value comes back undefined, which
   * reads exactly like a successful evaluation of nothing.
   */
  async evaluate<T>(expression: string, awaitPromise = false): Promise<T> {
    const reply = (await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise
    })) as {
      result: { value: T };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    };
    if (reply.exceptionDetails !== undefined) {
      const detail = reply.exceptionDetails;
      throw new Error(`Evaluation threw: ${detail.exception?.description ?? detail.text}`);
    }
    return reply.result.value;
  }

  /** A base64 PNG of the viewport. */
  async screenshot(): Promise<string> {
    const reply = (await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true })) as {
      data: string;
    };
    return reply.data;
  }

  /** One key, down then up, as a raw key event the platform adapter sees. */
  async pressKey(key: string, code: string, windowsVirtualKeyCode: number): Promise<void> {
    for (const type of ['keyDown', 'keyUp'] as const) {
      await this.send('Input.dispatchKeyEvent', {
        type,
        key,
        code,
        windowsVirtualKeyCode,
        nativeVirtualKeyCode: windowsVirtualKeyCode
      });
    }
  }

  close(): void {
    this.socket.close();
  }
}

export interface BrowserOptions {
  /** The page to open. */
  readonly url: string;
  readonly devtoolsPort: number;
  readonly windowSize: readonly [number, number];
  /** Extra flags; pass `WEBGPU_FLAGS` when the page needs an adapter. */
  readonly flags?: readonly string[];
  readonly profileDir: string;
}

/** Starts Chrome on `url` and returns the process with a client attached to its page. */
export async function openPage(
  chrome: string,
  options: BrowserOptions
): Promise<{ browser: ChildProcess; devtools: DevTools }> {
  const browser = spawn(
    chrome,
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${options.windowSize[0]},${options.windowSize[1]}`,
      `--user-data-dir=${options.profileDir}`,
      `--remote-debugging-port=${options.devtoolsPort}`,
      ...(options.flags ?? []),
      options.url
    ],
    { stdio: 'ignore' }
  );

  const origin = new URL(options.url).origin;
  const target = await waitFor(
    'the DevTools endpoint',
    async () => {
      const targets = (await (await fetch(`http://localhost:${options.devtoolsPort}/json`)).json()) as {
        type: string;
        url: string;
        webSocketDebuggerUrl: string;
      }[];
      return targets.find(t => t.type === 'page' && t.url.startsWith(origin));
    },
    15_000
  );
  return { browser, devtools: await DevTools.connect(target.webSocketDebuggerUrl) };
}
