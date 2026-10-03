import { handleMcpMessage, type JsonRpcResponse, type McpServerInfo } from './mcp';
import { AGENT_PORT, combineSurfaces, remoteSurface } from './remote';
import { confirmInWindow } from './webmcp';
import type { AgentSurfaceLike } from './AgentSurface';

/**
 * The page's half of the development agent bridge.
 *
 * `gesso-vite-plugin` serves MCP at `/__gesso/mcp` on the dev server,
 * but the channels are in the page's workers, and a server cannot
 * reach a worker. The page can, and it already holds a socket to the
 * server: Vite's HMR connection. So the server relays each JSON-RPC
 * message down that socket, this answers it against the render
 * worker's agent port, and the answer goes back up the same way.
 *
 * MCP is spoken here, in the page, rather than on the server, so the
 * server needs nothing from the framework and the workers need nothing
 * from MCP. The plugin injects the call in a dev server only; a build
 * carries no reference to this module.
 */

/** The part of `import.meta.hot` this uses. */
export interface DevAgentHot {
  send(event: string, data?: unknown): void;
  on(event: string, listener: (data: never) => void): void;
}

/** What the bridge needs of an application: a way to reach its render worker. */
export interface DevAgentApp {
  openRenderPort(key: string): MessagePort | undefined;
}

/** Server to page. */
export interface DevAgentRequest {
  readonly id: number;
  readonly message: unknown;
}

/** Page to server. */
export interface DevAgentResponse {
  readonly id: number;
  readonly response: JsonRpcResponse | null;
}

/** The HMR events the bridge speaks. The plugin's half uses the same names. */
export const DEV_AGENT_EVENTS = {
  ready: 'gesso:agent:ready',
  request: 'gesso:agent:request',
  response: 'gesso:agent:response'
} as const;

export function connectDevAgent(app: DevAgentApp, hot: DevAgentHot, info: McpServerInfo = {}): void {
  let surface: AgentSurfaceLike | undefined;
  /**
   * Opened on the first request, because the render worker does not
   * exist until the app mounts, and an agent may well ask first.
   */
  const reach = (): AgentSurfaceLike => {
    if (surface !== undefined) {
      return surface;
    }
    const port = app.openRenderPort(AGENT_PORT);
    if (port === undefined) {
      return combineSurfaces([]);
    }
    // A command marked `@confirm` is put to the person here, in the
    // page they are looking at. A browser's own dialog: in development
    // that is enough, and it cannot be mistaken for the application's.
    surface = remoteSurface(port, { confirm: confirmInWindow });
    return surface;
  };
  hot.on(DEV_AGENT_EVENTS.request, (request: DevAgentRequest) => {
    void handleMcpMessage(reach(), request.message, {
      name: info.name ?? (document.title || 'gesso'),
      ...info
    }).then(response => hot.send(DEV_AGENT_EVENTS.response, { id: request.id, response } satisfies DevAgentResponse));
  });
  hot.send(DEV_AGENT_EVENTS.ready, { title: document.title, url: location.href });
}
