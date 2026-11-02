import { afterEach, describe, expect, it } from 'vitest';

import { WorkerApp } from './WorkerApp';
import type { RuntimeToShellMessage, ShellToRuntimeMessage } from './RenderWorkerProtocol';

/**
 * The shell's half of `ShellService.preferColorScheme`: an app in the
 * render worker that keeps its own appearance setting asks for it, and
 * the shell reports that appearance, or the platform's again for `auto`,
 * as `setColorScheme` would. Driven without mounting, as the history
 * specs are.
 */
interface Internals {
  renderWorker: Pick<Worker, 'postMessage' | 'removeEventListener' | 'terminate'>;
  handleWorkerMessage(event: MessageEvent<RuntimeToShellMessage>): void;
}

/** A platform in dark mode that a spec can switch to light. */
function darkPlatform() {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const list = {
    matches: true,
    addEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => listeners.delete(fn)
  };
  (globalThis as { matchMedia?: unknown }).matchMedia = () => list as unknown as MediaQueryList;
  return {
    set(dark: boolean) {
      list.matches = dark;
      listeners.forEach(listener => listener({ matches: dark }));
    }
  };
}

afterEach(() => {
  delete (globalThis as { matchMedia?: unknown }).matchMedia;
});

function shell() {
  const app = new WorkerApp({ renderWorker: () => ({}) as unknown as Worker, colorScheme: 'light' });
  const internals = app as unknown as Internals;
  const posts: ShellToRuntimeMessage[] = [];
  internals.renderWorker = {
    postMessage: (message: unknown) => posts.push(message as ShellToRuntimeMessage),
    removeEventListener: () => {},
    terminate: () => {}
  };
  const fromWorker = (message: RuntimeToShellMessage): void =>
    internals.handleWorkerMessage({ data: message } as MessageEvent<RuntimeToShellMessage>);
  const schemes = (): string[] => posts.flatMap(message => (message.type === 'colorScheme' ? [message.scheme] : []));
  return { fromWorker, schemes };
}

describe("WorkerApp and the app's own appearance", () => {
  it('reports the appearance the app asks for, whatever the platform says', () => {
    darkPlatform();
    const { fromWorker, schemes } = shell();

    fromWorker({ type: 'preferColorScheme', preference: 'light' });

    expect(schemes()).toEqual(['light']);
  });

  it('follows the platform again, live, when the app asks for auto', () => {
    const platform = darkPlatform();
    const { fromWorker, schemes } = shell();

    fromWorker({ type: 'preferColorScheme', preference: 'auto' });
    platform.set(false);
    fromWorker({ type: 'preferColorScheme', preference: 'dark' });
    // An override stops the following: the platform's change is not reported.
    platform.set(true);
    platform.set(false);

    expect(schemes()).toEqual(['dark', 'light', 'dark']);
  });
});
