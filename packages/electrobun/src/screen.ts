import type { AgentSurfaceLike, AgentToolResult } from 'gesso-framework/agent';
import { remoteSurface } from 'gesso-framework/agent';

/**
 * A desktop window's screen, offered to agents beside its channels.
 *
 * The screen tools (`ui_snapshot`, `ui_press`, `ui_type`, `ui_focus`,
 * `ui_key`) are served by each window's render worker, on its agent port,
 * and the main process cannot reach a worker. The window's own page can,
 * and it already talks to the main process over Electrobun's RPC. So
 * the page relays the agent port's messages over the RPC
 * (`relayScreenAgent`, in `gesso-electrobun/view`), and the main process holds the other end as a
 * surface (`createScreenAgent`) that `serveDesktopAgent` offers beside
 * the channel tools.
 *
 * Only the screen tools cross. The render worker's surface also lists
 * the channels it replicates, which the main process serves itself, so
 * they would only be listed twice.
 *
 * Pressing the screen's buttons is everything the person can do, so an
 * application offers this in development, not to every agent with the
 * token: a confirmation an agent could click through on the screen is
 * no confirmation.
 */

import type { ScreenAgentMessage } from './view';

/** The screen tools, by name; what crosses from the render worker. */
const SCREEN_TOOL = /^ui_/;

/** The main process's half. */
export interface ScreenAgent {
  /**
   * The screen tools of the window attached last, or none while no
   * window is. For `serveDesktopAgent`'s `screen`.
   */
  readonly surface: AgentSurfaceLike;
  /**
   * Attaches a window: `send` posts a message to its page's relay, and
   * the window's messages are handed to `receive`. Detach it when the
   * window closes. The window attached last is the one agents operate.
   */
  attach(send: (message: ScreenAgentMessage) => void): { receive(message: ScreenAgentMessage): void; detach(): void };
}

const NO_WINDOW: AgentToolResult = {
  content: [{ type: 'text', text: 'No window is open to operate.' }],
  isError: true
};

export function createScreenAgent(): ScreenAgent {
  const windows: { surface: AgentSurfaceLike }[] = [];
  const current = () => windows.at(-1)?.surface;
  const surface: AgentSurfaceLike = {
    tools: async () => ((await current()?.tools()) ?? []).filter(tool => SCREEN_TOOL.test(tool.name)),
    resources: () => [],
    call: async (name, args) => {
      const window = current();
      if (window === undefined || !SCREEN_TOOL.test(name)) return NO_WINDOW;
      return window.call(name, args);
    },
    read: () => undefined
  };
  return {
    surface,
    attach: send => {
      // A MessagePort's shape, over whatever carries the window's messages.
      const port = {
        postMessage: (message: unknown) => send(message),
        onmessage: null as ((event: MessageEvent) => void) | null
      };
      // The screen tools ask the person nothing; a channel command they
      // might reach is the main process's to confirm, not the window's.
      const entry = { surface: remoteSurface(port, { confirm: () => false }) };
      windows.push(entry);
      return {
        receive: message => port.onmessage?.({ data: message } as MessageEvent),
        detach: () => {
          const at = windows.indexOf(entry);
          if (at !== -1) windows.splice(at, 1);
        }
      };
    }
  };
}
