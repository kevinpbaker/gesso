import type { AgentConfirmation, AgentSurfaceLike, AgentToolResult } from './AgentSurface';
import { AGENT_PORT, remoteSurface, type AgentConfirm } from './remote';

/**
 * An application's channels, offered to an agent in the browser.
 *
 * WebMCP (https://webmachinelearning.github.io/webmcp/) is a page
 * registering tools with the browser, `document.modelContext.registerTool`,
 * for an agent the browser runs or hosts to call. It is MCP without
 * the server: no port, no process, and the tools live exactly as long
 * as the page does. The channel surface is already a list of tools
 * with JSON Schema inputs and an answer per call, so this registers
 * each one and routes its calls back through the render worker.
 *
 * What the spec gives a tool that a channel does not, and the reverse:
 *
 *   - `readOnlyHint` is a channel's view tool; `consequentialHint`, the
 *     spec's "significant, real-world, or non-reversible", is a command
 *     marked `@destructive`. `untrustedContentHint` is never set: a
 *     channel's view is the application's own data.
 *   - There is no output schema. The result of a call is serialized to
 *     JSON for the agent, so a call answers with the view it left.
 *   - There is no way to ask the person. A command marked `@confirm`
 *     asks through `confirm`, `window.confirm` unless told otherwise.
 *   - A failed call rejects, which the spec turns into a failed
 *     `executeTool` the agent reads, with the sentence that says why.
 *
 * The API is behind an origin trial in Chrome 149 to 156, and was
 * `navigator.modelContext` until Chrome 150; the old name is read when
 * the new one is missing. Where neither exists, nothing is registered
 * and nothing fails: a page offering tools to a browser that takes
 * none is an ordinary page.
 */

/** The part of `ModelContext` this uses. */
export interface ModelContextLike {
  registerTool(
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema?: object;
      annotations?: { readOnlyHint?: boolean; consequentialHint?: boolean };
      execute: (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>;
    },
    options?: { signal?: AbortSignal }
  ): Promise<void>;
}

export interface WebMcpOptions {
  /**
   * Asks the person whether a `@confirm` command may be sent. Defaults to
   * the browser's own `window.confirm`, which an application with its
   * own dialogs will want to replace.
   */
  confirm?: AgentConfirm;
  /** Where to register. Defaults to the page's own `modelContext`. */
  modelContext?: ModelContextLike;
}

/** The page's model context, if the browser has one. */
export function pageModelContext(): ModelContextLike | undefined {
  const fromDocument = (globalThis.document as { modelContext?: ModelContextLike } | undefined)?.modelContext;
  return fromDocument ?? (globalThis.navigator as { modelContext?: ModelContextLike } | undefined)?.modelContext;
}

/**
 * Registers every tool a surface offers, and returns what removes them.
 *
 * A tool the browser refuses, a name already taken by something else on
 * the page, is reported on the console and skipped rather than taking
 * the rest down with it. Resolves to a no-op when there is no model
 * context to register with.
 */
export async function registerWebMcpTools(
  surface: AgentSurfaceLike,
  modelContext: ModelContextLike | undefined = pageModelContext()
): Promise<() => void> {
  if (modelContext === undefined) {
    return () => {};
  }
  const registration = new AbortController();
  for (const tool of await surface.tools()) {
    try {
      await modelContext.registerTool(
        {
          name: tool.name,
          ...(tool.title === undefined ? {} : { title: tool.title }),
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: {
            readOnlyHint: tool.annotations.readOnlyHint,
            consequentialHint: tool.annotations.destructiveHint === true
          },
          execute: async input => answerOf(await surface.call(tool.name, input ?? {}))
        },
        { signal: registration.signal }
      );
    } catch (error) {
      console.warn(`[gesso] WebMCP refused the tool ${tool.name}:`, error);
    }
  }
  return () => registration.abort();
}

/**
 * Registers an application's channels once it is mounted.
 *
 * Reaches them the way the development bridge does, through an agent
 * port to the render worker, so every channel the page can reach is
 * offered, wherever it is served.
 */
export async function connectWebMcp(
  app: { openRenderPort(key: string): MessagePort | undefined },
  options: WebMcpOptions = {}
): Promise<() => void> {
  const modelContext = options.modelContext ?? pageModelContext();
  if (modelContext === undefined) {
    return () => {};
  }
  const port = app.openRenderPort(AGENT_PORT);
  if (port === undefined) {
    throw new Error('connectWebMcp needs a mounted app: call it after app.mount().');
  }
  const surface = remoteSurface(port, { confirm: options.confirm ?? confirmInWindow });
  const unregister = await registerWebMcpTools(surface, modelContext);
  return () => {
    unregister();
    port.close();
  };
}

/** The browser's own dialog, worded for a person who did not ask for anything. */
export function confirmInWindow(request: AgentConfirmation): boolean {
  const lines = [`An AI agent wants to ${request.command} in ${request.channel}.`];
  if (request.description !== undefined) {
    lines.push(request.description);
  }
  if (Object.keys(request.arguments).length > 0) {
    lines.push(JSON.stringify(request.arguments, null, 2));
  }
  if (request.destructive) {
    lines.push('This cannot be undone.');
  }
  return window.confirm(lines.join('\n\n'));
}

/** What a call hands back to WebMCP: the view it left, or a rejection that says why. */
function answerOf(result: AgentToolResult): unknown {
  const text = result.content.map(part => part.text).join('\n');
  if (result.isError) {
    throw new Error(text);
  }
  return result.structuredContent ?? text;
}
