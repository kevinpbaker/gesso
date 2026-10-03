import type { Subscription } from 'rxjs';

import { channelSchema, type CommandSchema, type JsonSchema } from '../channel/ChannelSchema';
import type { ServedChannel } from '../channel/serveChannels';
import { validate } from './validate';

/**
 * An application's channels, as an AI agent sees them.
 *
 * A channel is already the shape an agent wants. Its view is what the
 * application currently holds, as plain data, and its commands are
 * the things it can be asked to do, by name, with typed arguments. A
 * component reaches both through a replica; this reaches them from the
 * other side, through the same `{ token, source }` the application
 * already hands to `serveChannels` or `createDesktopApp`, so an agent
 * sends a command to exactly the handler a click does and sees its
 * effect in exactly the view a screen draws.
 *
 * For each channel it offers:
 *
 *   - a resource, `gesso://<channel>/view`, holding the view;
 *   - a tool, `<channel>_view`, returning the same thing, because more
 *     agents call tools than read resources;
 *   - a tool per command, `<channel>_<command>`, whose input schema is
 *     the command's parameters by name. Calling it sends the command,
 *     waits for the view to settle, and returns the view as it now is,
 *     so the agent sees what its call did without a second round trip.
 *
 * The descriptions come from `channelSchema(token)`, which
 * `gesso-vite-plugin` writes from the contract's JSDoc. A command
 * marked `@hidden` is not offered; `@destructive` and `@idempotent`
 * become hints a client shows; `@confirm` means the person is asked,
 * through `confirm`, before the command is sent, and a surface given
 * no way to ask refuses it. A channel nobody described is still
 * offered, with its commands taking their arguments as a positional
 * list, and says so in its description.
 *
 * Nothing here knows about a transport. `mcpHandler` serves it over
 * MCP's HTTP transport; anything else can call `tools`, `call`,
 * `resources` and `read` directly.
 */

/** A tool, in the shape MCP's `tools/list` returns. */
export interface AgentTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema?: JsonSchema;
  readonly annotations: {
    readonly title?: string;
    readonly readOnlyHint: boolean;
    readonly destructiveHint?: boolean;
    readonly idempotentHint?: boolean;
    readonly openWorldHint: false;
  };
}

/** A resource, in the shape MCP's `resources/list` returns. */
export interface AgentResource {
  readonly uri: string;
  readonly name: string;
  readonly description?: string;
  readonly mimeType: 'application/json';
}

/** What a tool call returned, in the shape MCP's `tools/call` returns. */
export interface AgentToolResult {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError: boolean;
}

/** A command an agent wants to send that its contract says a person should approve. */
export interface AgentConfirmation {
  readonly channel: string;
  readonly command: string;
  readonly description?: string;
  /** The arguments, by parameter name. */
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly destructive: boolean;
}

export interface AgentSurfaceOptions {
  /**
   * Asks the person whether a `@confirm` command may be sent. Resolve
   * true to send it. Without this, such a command is refused, which is
   * the safe reading of a contract that asked for a person.
   */
  confirm?: (request: AgentConfirmation) => boolean | Promise<boolean>;
  /**
   * How long the view must be quiet after a command before the call
   * returns it, in milliseconds (default 50). A command whose effect is
   * synchronous settles at once; one that waits on a request settles
   * when the patch lands, or at `settleMs`.
   */
  quietMs?: number;
  /** The longest a call waits for the view to settle (default 1000). */
  settleMs?: number;
}

export interface AgentSurface {
  tools(): readonly AgentTool[];
  /** Calls a tool by name. Never throws: a failure is a result with `isError`, which an agent can read and correct. */
  call(name: string, args: Readonly<Record<string, unknown>> | undefined): Promise<AgentToolResult>;
  resources(): readonly AgentResource[];
  /** The current view of the channel a resource names, or undefined for a URI this surface does not hold. */
  read(uri: string): Record<string, unknown> | undefined;
  /** Stops following every view. */
  dispose(): void;
}

/** The longest tool name MCP clients accept. */
const MAX_NAME = 64;

interface Entry {
  readonly served: ServedChannel;
  readonly name: string;
  readonly description?: string;
  readonly viewSchema?: JsonSchema;
  readonly view: Record<string, unknown>;
  readonly commands: ReadonlyMap<string, CommandSchema | null>;
}

type Handler = (request: Readonly<Record<string, unknown>> | undefined) => Promise<AgentToolResult>;

export function agentSurface(channels: readonly ServedChannel[], options: AgentSurfaceOptions = {}): AgentSurface {
  const quietMs = options.quietMs ?? 50;
  const settleMs = options.settleMs ?? 1000;
  const subscriptions: Subscription[] = [];
  const entries: Entry[] = [];
  const tools: AgentTool[] = [];
  const handlers = new Map<string, Handler>();
  let lastChange = 0;
  let following = false;

  /**
   * Subscribed on first use rather than at construction, so a surface
   * built at startup and never called costs the application nothing:
   * a view key may be a cold observable doing real work per subscriber.
   */
  const follow = () => {
    if (following) {
      return;
    }
    following = true;
    for (const entry of entries) {
      for (const [key, observable] of Object.entries(entry.served.source.view)) {
        subscriptions.push(
          observable.subscribe(value => {
            entry.view[key] = value;
            lastChange = Date.now();
          })
        );
      }
    }
  };

  const settle = async () => {
    const start = Date.now();
    for (;;) {
      await new Promise(resolve => setTimeout(resolve, quietMs));
      const now = Date.now();
      if (now - lastChange >= quietMs || now - start >= settleMs) {
        return;
      }
    }
  };

  const add = (tool: AgentTool, handler: Handler) => {
    if (handlers.has(tool.name)) {
      throw new Error(
        `Two tools would be called '${tool.name}'. A channel and command name pair has to be unique once joined ` +
          'with an underscore, and a command cannot be called `view`.'
      );
    }
    tools.push(tool);
    handlers.set(tool.name, handler);
  };

  for (const served of channels) {
    const schema = channelSchema(served.token as never);
    const name = toolName(served.token.name);
    const commands = new Map<string, CommandSchema | null>();
    for (const command of Object.keys(served.source.commands ?? {})) {
      const described = schema?.commands[command];
      if (described?.hidden !== true) {
        commands.set(command, described ?? null);
      }
    }
    const entry: Entry = {
      served,
      name,
      description: schema?.description,
      viewSchema: schema?.view,
      view: { ...(served.token.initial as Record<string, unknown>) },
      commands
    };
    entries.push(entry);

    const about = entry.description === undefined ? '' : `\n\n${entry.description}`;
    add(
      {
        name: toolName(`${served.token.name}_view`),
        title: `Read ${served.token.name}`,
        description: `What the ${served.token.name} channel currently holds.${about}`,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        ...(entry.viewSchema === undefined ? {} : { outputSchema: entry.viewSchema }),
        annotations: { readOnlyHint: true, openWorldHint: false }
      },
      async () => {
        follow();
        return viewResult(entry, `The ${served.token.name} view.`);
      }
    );

    for (const [command, described] of commands) {
      add(commandTool(entry, command, described), args => send(entry, command, described, args));
    }
  }

  const send = async (
    entry: Entry,
    command: string,
    described: CommandSchema | null,
    args: Readonly<Record<string, unknown>> | undefined
  ): Promise<AgentToolResult> => {
    follow();
    const channel = entry.served.token.name;
    const input = args ?? {};
    let positional: unknown[];
    if (described === null) {
      const list = input.arguments ?? [];
      if (!Array.isArray(list)) {
        return failure('arguments must be an array of the values the command takes, in order.');
      }
      positional = list;
    } else {
      const problem = validate(described.input, input);
      if (problem !== null) {
        return failure(problem);
      }
      positional = described.parameters.map(parameter => input[parameter]);
      if (described.rest === true) {
        const spread = positional.pop();
        positional.push(...(Array.isArray(spread) ? spread : []));
      }
      while (positional.length > 0 && positional[positional.length - 1] === undefined) {
        positional.pop();
      }
      if (described.confirm === true) {
        if (options.confirm === undefined) {
          return failure(
            `${channel}.${command} asks for a person to approve it, and this application has given agents no way ` +
              'to ask. Ask the person to do it themselves.'
          );
        }
        const approved = await options.confirm({
          channel,
          command,
          description: described.description,
          arguments: input,
          destructive: described.destructive === true
        });
        if (!approved) {
          return failure(`The person declined ${channel}.${command}. Do not send it again unless they ask.`);
        }
      }
    }
    const handler = entry.served.source.commands?.[command] as ((...values: unknown[]) => void) | undefined;
    if (handler === undefined) {
      return failure(`${channel} has no command ${command}.`);
    }
    try {
      handler(...positional);
    } catch (error) {
      return failure(`${channel}.${command} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await settle();
    return viewResult(entry, `Sent ${command} to ${channel}. The view afterwards:`);
  };

  return {
    tools: () => tools,
    call: async (name, args) => {
      const handler = handlers.get(name);
      if (handler === undefined) {
        return failure(`There is no tool called ${name}. The tools are ${[...handlers.keys()].join(', ')}.`);
      }
      return handler(args);
    },
    resources: () =>
      entries.map(entry => ({
        uri: resourceUri(entry.served.token.name),
        name: entry.served.token.name,
        ...(entry.description === undefined ? {} : { description: entry.description }),
        mimeType: 'application/json' as const
      })),
    read: uri => {
      const entry = entries.find(candidate => resourceUri(candidate.served.token.name) === uri);
      if (entry === undefined) {
        return undefined;
      }
      follow();
      return { ...entry.view };
    },
    dispose: () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
      subscriptions.length = 0;
      following = false;
    }
  };
}

/** The URI of a channel's view. */
export function resourceUri(channel: string): string {
  return `gesso://${encodeURIComponent(channel)}/view`;
}

function commandTool(entry: Entry, command: string, described: CommandSchema | null): AgentTool {
  const channel = entry.served.token.name;
  const destructive = described?.destructive === true;
  const lines = [described?.description ?? `Sends ${command} to the ${channel} channel.`];
  if (described === null) {
    lines.push(
      `This command was not described, so its arguments are a positional list. Read ${toolName(`${channel}_view`)} ` +
        'first to see what the channel holds.'
    );
  }
  if (described?.confirm === true) {
    lines.push('The person is asked to approve this before it is sent.');
  }
  lines.push('Returns the view after the command has taken effect.');
  return {
    name: toolName(`${channel}_${command}`),
    title: `${channel}: ${command}`,
    description: lines.join('\n\n'),
    inputSchema:
      described?.input ??
      ({
        type: 'object',
        properties: { arguments: { type: 'array', description: 'The arguments, in order.' } },
        additionalProperties: false
      } satisfies JsonSchema),
    ...(entry.viewSchema === undefined ? {} : { outputSchema: entry.viewSchema }),
    annotations: {
      readOnlyHint: false,
      ...(destructive ? { destructiveHint: true } : { destructiveHint: false }),
      ...(described?.idempotent === true ? { idempotentHint: true } : {}),
      openWorldHint: false
    }
  };
}

/**
 * A tool name MCP clients accept: letters, digits, underscores and
 * dashes, at most 64 characters. A channel name is the application's
 * own string, so anything else in it becomes an underscore, and one
 * too long is an error at startup rather than a tool a client drops.
 */
function toolName(raw: string): string {
  const name = raw.replace(/[^A-Za-z0-9_-]/g, '_');
  if (name.length > MAX_NAME) {
    throw new Error(`The tool name '${name}' is longer than ${MAX_NAME} characters. Shorten the channel's name.`);
  }
  return name;
}

function viewResult(entry: Entry, lead: string): AgentToolResult {
  const view = { ...entry.view };
  return {
    content: [{ type: 'text', text: `${lead}\n${JSON.stringify(view, null, 2)}` }],
    structuredContent: view,
    isError: false
  };
}

function failure(text: string): AgentToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}
