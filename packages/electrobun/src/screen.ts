import type { AgentConfirmation, AgentSurfaceLike, AgentToolResult } from 'gesso-framework/agent';
import { remoteSurface, SCREEN_TOOL_NAMES } from 'gesso-framework/agent';

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
 * Only the screen tools cross (`SCREEN_TOOL_NAMES`: the `ui_` tools,
 * `tokens_view` and `render_frame`). The render worker's surface also
 * lists the channels it replicates, which the main process serves
 * itself, so they would only be listed twice. An application whose state
 * lives in its window instead, with nothing in the main process to
 * serve it, asks for those too with `windowChannels`.
 *
 * Pressing the screen's buttons is everything the person can do, so an
 * application offers this in development, not to every agent with the
 * token: a confirmation an agent could click through on the screen is
 * no confirmation.
 */

import type { ScreenAgentMessage } from './view';

/**
 * The screen tools, by name; what crosses from the render worker. It
 * was `/^ui_/`, which kept `tokens_view` and `render_frame` from every
 * desktop app's agents once they joined the screen's tools.
 */
const SCREEN_TOOLS = new Set(SCREEN_TOOL_NAMES);

export interface ScreenAgentOptions {
  /**
   * Offer the window's channels too, as its render worker lists them:
   * for an application whose state lives in its window, such as an
   * editor, with nothing in the main process to serve it. Off by default,
   * because an Electrobun application's channels are the main process's.
   */
  readonly windowChannels?: boolean;
  /**
   * Asks the person before a window channel's `@confirm` command is
   * sent. Without it such a command is refused.
   */
  readonly confirm?: (request: AgentConfirmation) => boolean | Promise<boolean>;
}

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

export function createScreenAgent(options: ScreenAgentOptions = {}): ScreenAgent {
  const windows: { surface: AgentSurfaceLike }[] = [];
  const current = () => windows.at(-1)?.surface;
  const offered = (name: string) => options.windowChannels === true || SCREEN_TOOLS.has(name);
  const surface: AgentSurfaceLike = {
    tools: async () => ((await current()?.tools()) ?? []).filter(tool => offered(tool.name)),
    resources: () => [],
    call: async (name, args) => {
      const window = current();
      if (window === undefined || !offered(name)) return NO_WINDOW;
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
      // The screen tools ask the person nothing; a window channel's
      // command marked `@confirm` is asked through `confirm`, and refused
      // without one.
      const entry = { surface: remoteSurface(port, { confirm: options.confirm ?? (() => false) }) };
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
