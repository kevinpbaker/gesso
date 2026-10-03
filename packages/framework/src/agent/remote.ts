import type { AgentConfirmation, AgentResource, AgentSurfaceLike, AgentTool, AgentToolResult } from './AgentSurface';

/**
 * An agent surface across a thread.
 *
 * A web application's channels are served in workers, and an agent
 * reaches the page, so the surface has to cross from one to the other.
 * The worker that serves channels answers a `gesso:agent` port with its
 * own surface (`serveAgentPort`); the page holds the other end as a
 * surface of its own (`remoteSurface`); and a thread that knows several
 * such ports, the render worker with its channel workers behind it,
 * offers them as one (`combineSurfaces`).
 *
 * The four operations cross as they are. MCP itself is spoken only at
 * the end that faces the agent, so nothing in a worker parses JSON-RPC.
 */

/** The port key a thread answers with its agent surface. */
export const AGENT_PORT = 'gesso:agent';

/** What crosses an agent port, page to worker. */
export type AgentPortRequest =
  | { id: number; op: 'tools' }
  | { id: number; op: 'resources' }
  | { id: number; op: 'call'; name: string; args?: Readonly<Record<string, unknown>> }
  | { id: number; op: 'read'; uri: string };

/** A request before it is given an id. */
type Unsent<T> = T extends unknown ? Omit<T, 'id'> : never;

/** What crosses back. */
export type AgentPortResponse = { id: number; result: unknown } | { id: number; error: string };

/**
 * The question going the other way: a command marked `@confirm` needs
 * a person, the person is at the far end, so the thread that serves
 * the channel asks down the port it was asked on and waits.
 */
export type AgentPortConfirm = { confirm: number; request: AgentConfirmation } | { confirm: number; approved: boolean };

/** How a thread asks the person, wherever the person is. */
export type AgentConfirm = (request: AgentConfirmation) => boolean | Promise<boolean>;

/** A `MessagePort`, or anything that posts and receives like one. */
type AgentPort = Pick<MessagePort, 'postMessage' | 'onmessage'>;

/**
 * Answers a port with a surface.
 *
 * The surface is made on the first request rather than when the port
 * arrives: a port is opened by a page that may never ask anything, and
 * a surface subscribes to every view key once it is used. It is given
 * a `confirm` that asks the far end of this port, so a command marked
 * `@confirm` reaches the person wherever they are; the far end answers
 * no when it has no way to ask.
 */
export function serveAgentPort(port: AgentPort, makeSurface: (confirm: AgentConfirm) => AgentSurfaceLike): () => void {
  let surface: AgentSurfaceLike | undefined;
  let nextConfirm = 1;
  const asking = new Map<number, (approved: boolean) => void>();
  const confirm: AgentConfirm = request =>
    new Promise(resolve => {
      const id = nextConfirm++;
      asking.set(id, resolve);
      port.postMessage({ confirm: id, request } satisfies AgentPortConfirm);
    });
  port.onmessage = async event => {
    const data = event.data as AgentPortRequest | AgentPortConfirm;
    if ('confirm' in data && 'approved' in data) {
      asking.get(data.confirm)?.(data.approved);
      asking.delete(data.confirm);
      return;
    }
    const request = data as AgentPortRequest;
    if (typeof request?.id !== 'number') {
      return;
    }
    surface ??= makeSurface(confirm);
    try {
      port.postMessage({ id: request.id, result: await answer(surface, request) } satisfies AgentPortResponse);
    } catch (error) {
      port.postMessage({
        id: request.id,
        error: error instanceof Error ? error.message : String(error)
      } satisfies AgentPortResponse);
    }
  };
  return () => {
    port.onmessage = null;
    surface?.dispose?.();
    for (const resolve of asking.values()) {
      resolve(false);
    }
    asking.clear();
  };
}

function answer(surface: AgentSurfaceLike, request: AgentPortRequest): unknown {
  switch (request.op) {
    case 'tools':
      return surface.tools();
    case 'resources':
      return surface.resources();
    case 'call':
      return surface.call(request.name, request.args);
    case 'read':
      return surface.read(request.uri) ?? null;
  }
}

/**
 * The surface at the other end of a port.
 *
 * A request nobody answers within `timeoutMs` (default 2000) is taken
 * as a thread with nothing to offer: a worker that serves no channels
 * never installs the answering side, and an agent asking the whole
 * application should hear about the threads that do rather than wait
 * on one that does not.
 */
export function remoteSurface(
  port: AgentPort,
  options: { timeoutMs?: number; confirm?: AgentConfirm } = {}
): AgentSurfaceLike {
  const timeoutMs = options.timeoutMs ?? 2000;
  let next = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  port.onmessage = event => {
    const question = event.data as AgentPortConfirm;
    if (question !== null && typeof question === 'object' && 'request' in question) {
      // Asked to put a command to the person. With nobody to ask, the
      // answer is no, which is what a contract asking for a person means.
      void Promise.resolve(options.confirm?.(question.request) ?? false).then(
        approved => port.postMessage({ confirm: question.confirm, approved } satisfies AgentPortConfirm),
        () => port.postMessage({ confirm: question.confirm, approved: false } satisfies AgentPortConfirm)
      );
      return;
    }
    const response = event.data as AgentPortResponse;
    const waiting = pending.get(response?.id);
    if (waiting === undefined) {
      return;
    }
    pending.delete(response.id);
    if ('error' in response) {
      waiting.reject(new Error(response.error));
    } else {
      waiting.resolve(response.result);
    }
  };
  const ask = <T>(request: Unsent<AgentPortRequest>, fallback: T, timeout = timeoutMs): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = next++;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(fallback);
      }, timeout);
      pending.set(id, {
        resolve: value => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: error => {
          clearTimeout(timer);
          reject(error);
        }
      });
      port.postMessage({ ...request, id });
    });
  return {
    tools: () => ask<readonly AgentTool[]>({ op: 'tools' }, []),
    resources: () => ask<readonly AgentResource[]>({ op: 'resources' }, []),
    // A command may wait on the person through `confirm`, so a call is
    // given far longer than a listing before it is abandoned.
    call: (name, args) =>
      ask<AgentToolResult>(
        { op: 'call', name, args },
        { content: [{ type: 'text', text: `${name} did not answer in time.` }], isError: true },
        Math.max(timeoutMs, 120_000)
      ),
    read: async uri => (await ask<Record<string, unknown> | null>({ op: 'read', uri }, null)) ?? undefined
  };
}

/**
 * Several surfaces as one: tools and resources listed together, a call
 * or a read sent to whichever surface listed it. When two list the same
 * name, the first keeps it, as the order of the threads is the order
 * the application registered them in.
 */
export function combineSurfaces(surfaces: readonly AgentSurfaceLike[]): AgentSurfaceLike {
  const toolOwners = new Map<string, AgentSurfaceLike>();
  const resourceOwners = new Map<string, AgentSurfaceLike>();

  const tools = async () => {
    const lists = await Promise.all(surfaces.map(surface => surface.tools()));
    toolOwners.clear();
    const out: AgentTool[] = [];
    lists.forEach((list, index) => {
      for (const tool of list) {
        if (!toolOwners.has(tool.name)) {
          toolOwners.set(tool.name, surfaces[index]);
          out.push(tool);
        }
      }
    });
    return out;
  };

  const resources = async () => {
    const lists = await Promise.all(surfaces.map(surface => surface.resources()));
    resourceOwners.clear();
    const out: AgentResource[] = [];
    lists.forEach((list, index) => {
      for (const resource of list) {
        if (!resourceOwners.has(resource.uri)) {
          resourceOwners.set(resource.uri, surfaces[index]);
          out.push(resource);
        }
      }
    });
    return out;
  };

  return {
    tools,
    resources,
    call: async (name, args) => {
      if (!toolOwners.has(name)) {
        await tools();
      }
      const owner = toolOwners.get(name);
      if (owner === undefined) {
        const known = [...toolOwners.keys()].join(', ');
        return {
          content: [{ type: 'text', text: `There is no tool called ${name}. The tools are ${known}.` }],
          isError: true
        };
      }
      return owner.call(name, args);
    },
    read: async uri => {
      if (!resourceOwners.has(uri)) {
        await resources();
      }
      return resourceOwners.get(uri)?.read(uri);
    },
    dispose: () => {
      for (const surface of surfaces) {
        surface.dispose?.();
      }
    }
  };
}
