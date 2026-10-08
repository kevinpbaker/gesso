import type { ServedChannel } from 'gesso-framework';
import {
  agentSurface,
  mcpHandler,
  type AgentConfirmation,
  type AgentSurface,
  type McpHandlerOptions
} from 'gesso-framework/agent';

/**
 * A desktop application's channels, served to AI agents over MCP.
 *
 * The main process already holds every channel's source: it is what
 * `createDesktopApp` serves to each window. So it is also where an
 * agent connects. This serves those same sources with MCP's HTTP
 * transport on the person's own machine, through `Bun.serve`, which
 * Cottontail provides as Bun does, and an agent such as Claude Code
 * connects by URL:
 *
 *   const agent = serveDesktopAgent([counter], { name: 'my-app', confirm: messageBoxConfirm(Utils.showMessageBox) });
 *   // claude mcp add --transport http my-app http://127.0.0.1:7310/mcp
 *
 * The channels are passed rather than read from the app, because
 * `createDesktopApp` takes them per window, and the per-window ones
 * (`windowsChannel`) are about a window an agent does not have.
 *
 * What it offers is the channel tools only. The screen is in each
 * window's render worker, out of the main process's reach, so the
 * screen tools a web app offers are not here.
 *
 * The descriptions come from `channelSchema`. A main process is bundled
 * by Electrobun's own build, which `gesso-vite-plugin` never sees, so
 * the template runs `gesso-channels` to write a module that describes
 * the contracts, and imports it.
 */

/** A `Bun.serve`, as far as this uses one. */
export type DesktopServe = (options: {
  hostname: string;
  port: number;
  fetch: (request: Request) => Promise<Response>;
}) => { stop(closeActiveConnections?: boolean): void };

export interface DesktopAgentOptions extends Omit<McpHandlerOptions, 'allowedOrigins'> {
  /**
   * The port to listen on (default 7310). When it is taken, the next
   * nine are tried in turn, so a second copy of the app still serves;
   * `url` says which one it got.
   */
  port?: number;
  /** Default `127.0.0.1`: reachable from this machine only. */
  hostname?: string;
  /**
   * Asks the person whether a `@confirm` command may be sent. Without
   * it such a command is refused. `messageBoxConfirm` makes one from
   * Electrobun's native dialog.
   */
  confirm?: (request: AgentConfirmation) => boolean | Promise<boolean>;
  /** The server to start. Defaults to the runtime's `Bun.serve`. */
  serve?: DesktopServe;
}

export interface DesktopAgent {
  /** Where an agent connects: `http://127.0.0.1:<port>/mcp`. */
  readonly url: string;
  readonly surface: AgentSurface;
  /** Stops serving and stops following the channels. */
  stop(): void;
}

const DEFAULT_PORT = 7310;
const PORTS_TRIED = 10;

export function serveDesktopAgent(channels: readonly ServedChannel[], options: DesktopAgentOptions = {}): DesktopAgent {
  const serve = options.serve ?? bunServe();
  const hostname = options.hostname ?? '127.0.0.1';
  const first = options.port ?? DEFAULT_PORT;
  const surface = agentSurface(channels, options.confirm === undefined ? {} : { confirm: options.confirm });
  // A desktop app has no browser pages of its own to let in, so every
  // request carrying an Origin is refused: that is a web page the person
  // has open, reaching for their machine.
  const fetch = mcpHandler(surface, { ...options, allowedOrigins: [] });

  let lastError: unknown;
  for (let port = first; port < first + PORTS_TRIED; port++) {
    try {
      const server = serve({ hostname, port, fetch });
      return {
        url: `http://${hostname}:${port}/mcp`,
        surface,
        stop: () => {
          server.stop(true);
          surface.dispose();
        }
      };
    } catch (error) {
      if (!isAddressInUse(error)) {
        surface.dispose();
        throw error;
      }
      lastError = error;
    }
  }
  surface.dispose();
  throw new Error(
    `Ports ${first} to ${first + PORTS_TRIED - 1} are all in use, so agents cannot be served. ` +
      `Pass another port to serveDesktopAgent. (${String(lastError)})`
  );
}

/** The options Electrobun's `Utils.showMessageBox` takes, as far as this uses them. */
export type ShowMessageBox = (options: {
  type?: 'info' | 'warning' | 'error' | 'question';
  title?: string;
  message?: string;
  detail?: string;
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
}) => Promise<{ response: number }>;

/**
 * A `confirm` that asks with the operating system's own dialog.
 *
 * Takes Electrobun's `Utils.showMessageBox` rather than importing it,
 * because Electrobun is a toolchain a project is projected into, not a
 * package this one can depend on.
 *
 * Everything the person needs to decide is in `message`, the command's
 * description and its arguments included, because macOS shows no
 * `detail`: a dialog that asked there showed only "wants to
 * createBranch in workspace", with nothing to say which branch.
 *
 * Decline is the first button. macOS makes the first button the
 * default, whatever `defaultId` says, so with Allow first, Enter
 * approved; first is also what `defaultId` and `cancelId` name, so
 * Enter, Escape and closing the dialog decline on every platform.
 */
export function messageBoxConfirm(showMessageBox: ShowMessageBox): (request: AgentConfirmation) => Promise<boolean> {
  return async request => {
    const argumentLines = Object.entries(request.arguments).map(([name, value]) => `${name}: ${JSON.stringify(value)}`);
    const message = [
      `An AI agent wants to ${request.command} in ${request.channel}.${request.destructive ? ' This cannot be undone.' : ''}`,
      request.description,
      argumentLines.join('\n')
    ]
      .filter((part): part is string => part !== undefined && part !== '')
      .join('\n\n');
    const { response } = await showMessageBox({
      type: request.destructive ? 'warning' : 'question',
      title: 'An AI agent is asking',
      message,
      buttons: ['Decline', 'Allow'],
      defaultId: 0,
      cancelId: 0
    });
    return response === 1;
  };
}

function bunServe(): DesktopServe {
  const bun = (globalThis as { Bun?: { serve?: DesktopServe } }).Bun;
  if (typeof bun?.serve !== 'function') {
    throw new Error(
      'serveDesktopAgent needs Bun.serve, which Cottontail and Bun provide. Pass serve to use another server.'
    );
  }
  return options => bun.serve!(options);
}

function isAddressInUse(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'EADDRINUSE' || /in use|EADDRINUSE/i.test(String((error as Error | null)?.message ?? error));
}
