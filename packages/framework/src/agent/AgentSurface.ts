import { describeSharedMemory } from '../channel/plainData';
import type { Subscription } from 'rxjs';

import { channelSchema, type CommandSchema, type JsonSchema, type QuerySchema } from '../channel/ChannelSchema';
import type { ServedChannel } from '../channel/serveChannels';
import { OUTCOME_META } from './activity';
import { decodeBinary } from './binary';
import { validate, repairedArguments } from './validate';

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
 *     so the agent sees what its call did without a second round trip;
 *   - a tool per query, `<channel>_<query>`, marked read-only, whose
 *     answer is whatever the query returns. Nothing on the person's
 *     screen moves, so an agent reads what the view does not hold
 *     without changing what the person is looking at.
 *
 * The descriptions come from `channelSchema(token)`, which
 * `gesso-vite-plugin` writes from the contract's JSDoc. A command
 * marked `@hidden` is not offered, nor is a view key marked so, in
 * anything the agent reads, nor any of a channel whose token is; `@destructive` and `@idempotent`
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
  /**
   * MCP's own place for what is not in its schema. Gesso puts
   * `gesso/waitsUpToMs` here for a tool that waits on purpose (see
   * `AgentToolDefinition.waitsUpToMs`), so the bridges between the agent
   * and the thread give its calls that long.
   */
  readonly _meta?: Readonly<Record<string, unknown>>;
}

/** The `_meta` key a tool that waits on purpose says how long under, in milliseconds. */
export const WAITS_UP_TO = 'gesso/waitsUpToMs';

/**
 * The `_meta` key a tool says the scope it needs under, for a server
 * that grants agents some tools and not others (`mcpHandler`'s
 * `authorize`): `<channel>:read` for a view or a query, `<channel>:write`
 * for a command, `screen` for the screen tools, `design` for the design
 * tools, `app:read` or `app:write` for an application's own.
 */
export const SCOPE_META = 'gesso/scope';

/** A resource, in the shape MCP's `resources/list` returns. */
export interface AgentResource {
  readonly uri: string;
  readonly name: string;
  readonly description?: string;
  readonly mimeType: 'application/json';
  /** MCP's own place for what is not in its schema: `gesso/scope`, the scope reading it needs. */
  readonly _meta?: Readonly<Record<string, unknown>>;
}

/** One part of a tool's answer: text, or a picture, as `render_frame` returns. */
export type AgentContent =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly data: string; readonly mimeType: string };

/** A result's text parts, joined: what a reader that shows no pictures shows. */
export function resultText(result: AgentToolResult): string {
  return result.content
    .map(part => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

/** What a tool call returned, in the shape MCP's `tools/call` returns. */
export interface AgentToolResult {
  readonly content: readonly AgentContent[];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError: boolean;
  /**
   * MCP's own place for what is not in its schema. Gesso puts
   * `gesso/outcome` here, what came of the call (`AgentOutcome`), for
   * the activity the person is shown.
   */
  readonly _meta?: Readonly<Record<string, unknown>>;
}

/**
 * What the person is asked, in their own words: the question, what it
 * is about, and the word on the button that says yes.
 *
 *   { title: 'Delete this expense?', detail: '$3.35 Transport, Bus fare', action: 'Delete' }
 */
export interface AgentQuestion {
  readonly title: string;
  readonly detail?: string;
  /** The word on the button that approves. Default `Allow`. */
  readonly action?: string;
}

/** A command an agent wants to send that its contract says a person should approve. */
export interface AgentConfirmation {
  readonly channel: string;
  readonly command: string;
  readonly description?: string;
  /** The arguments, by parameter name. */
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly destructive: boolean;
  /**
   * What to ask the person, already worded: from the application's own
   * `confirm` for the command in `serve`, else from the question after
   * its `@confirm` tag with the arguments put in, else written from the
   * command's name. Show this rather than the command and its arguments.
   */
  readonly question: AgentQuestion;
  /** The agent asking, as its client names itself (`Claude Code`), when the transport knows. */
  readonly agent?: string;
}

/**
 * How the person answered: yes, no, or nobody could be asked. A
 * boolean is taken too, true for approved and false for declined.
 *
 * `unavailable` is not a no. The agent is told that nobody saw the
 * question, and why, so it can ask the person to bring the window
 * forward rather than take a decision nobody made. `{ unavailable }`
 * says the why: "the app's window is hidden".
 */
export type AgentAnswer = 'approved' | 'declined' | 'unavailable' | { readonly unavailable: string };

/** What a `confirm` may return: an answer, a boolean, or a promise of either. */
export type AgentConfirmResult = AgentAnswer | boolean | Promise<AgentAnswer | boolean>;

/** A `confirm` answer as one of the three, with the reason a person could not be asked, if one was given. */
export function agentAnswer(answer: AgentAnswer | boolean): AgentAnswer {
  return answer === true ? 'approved' : answer === false ? 'declined' : answer;
}

/**
 * Who is calling a tool, as far as the transport knows. Passed to
 * `call` by whatever speaks MCP; a surface that is given none treats
 * the caller as unknown.
 */
export interface AgentCallContext {
  /** The client's own name for itself, from MCP's `clientInfo`: `Claude Code`. */
  readonly agent?: string;
}

export interface AgentSurfaceOptions {
  /**
   * Asks the person whether a `@confirm` command may be sent. Answer
   * `approved` (or true) to send it. Without this, such a command is
   * refused, which is the safe reading of a contract that asked for a
   * person.
   */
  confirm?: (request: AgentConfirmation) => AgentConfirmResult;
  /**
   * How long the view must be quiet after a command before the call
   * returns it, in milliseconds (default 50). A command whose effect is
   * synchronous settles at once; one that waits on a request settles
   * when the patch lands, or at `settleMs`. A command that changes
   * nothing in the view returns at `settleMs`.
   */
  quietMs?: number;
  /** The longest a call waits for the view to settle (default 1000). */
  settleMs?: number;
}

/**
 * Any surface an MCP server can speak for: one in this thread, or one
 * across a port whose every answer is a promise.
 */
export interface AgentSurfaceLike {
  tools(): readonly AgentTool[] | Promise<readonly AgentTool[]>;
  call(
    name: string,
    args: Readonly<Record<string, unknown>> | undefined,
    context?: AgentCallContext
  ): Promise<AgentToolResult>;
  resources(): readonly AgentResource[] | Promise<readonly AgentResource[]>;
  read(uri: string): Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>;
  dispose?(): void;
}

export interface AgentSurface extends AgentSurfaceLike {
  tools(): readonly AgentTool[];
  /** Calls a tool by name. Never throws: a failure is a result with `isError`, which an agent can read and correct. */
  call(
    name: string,
    args: Readonly<Record<string, unknown>> | undefined,
    context?: AgentCallContext
  ): Promise<AgentToolResult>;
  resources(): readonly AgentResource[];
  /** The current view of the channel a resource names, or undefined for a URI this surface does not hold. */
  read(uri: string): Record<string, unknown> | undefined;
  /** Stops following every view. */
  dispose(): void;
}

/** The longest tool name MCP clients accept. */
const MAX_NAME = 64;

/** How long a query may take to answer before the agent is told it did not, in milliseconds. */
const QUERY_MS = 30_000;

interface Entry {
  readonly served: ServedChannel;
  readonly name: string;
  readonly description?: string;
  readonly viewSchema?: JsonSchema;
  readonly view: Record<string, unknown>;
  /** View keys kept from the agent. */
  readonly hidden: ReadonlySet<string>;
  readonly commands: ReadonlyMap<string, CommandSchema | null>;
  readonly queries: ReadonlyMap<string, QuerySchema | null>;
  /** What its scopes are named after: `@scope` on the token, else the channel's name. */
  readonly scope: string;
  /**
   * Every change this channel's view has seen, and when the last was,
   * so a command can tell its own effect from what came before it.
   * Counted per channel: a call returns its own channel's view, and
   * another channel that never goes quiet (a clock, a status that
   * follows the person's typing) must not hold it up.
   */
  changes: number;
  lastChange: number;
}

type Handler = (
  request: Readonly<Record<string, unknown>> | undefined,
  context: AgentCallContext
) => Promise<AgentToolResult>;

export function agentSurface(channels: readonly ServedChannel[], options: AgentSurfaceOptions = {}): AgentSurface {
  const quietMs = options.quietMs ?? 50;
  const settleMs = options.settleMs ?? 1000;
  const subscriptions: Subscription[] = [];
  const entries: Entry[] = [];
  const tools: AgentTool[] = [];
  const handlers = new Map<string, Handler>();
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
            entry.lastChange = Date.now();
            entry.changes++;
          })
        );
      }
    }
  };

  /**
   * Waits for what a command sent when its channel's view had seen
   * `before` changes to reach that view.
   *
   * Quiet counts only once the view has changed since the command: a
   * command that answers after a request has changed nothing yet when
   * the first quiet window ends, and returning then would hand the
   * agent the view from before it. A command that changes nothing at
   * all waits out `settleMs`, which is the price of not being able to
   * tell it from one that is still working.
   */
  const settle = async (entry: Entry, before: number) => {
    const start = Date.now();
    for (;;) {
      await new Promise(resolve => setTimeout(resolve, quietMs));
      const now = Date.now();
      const changed = entry.changes > before;
      if ((changed && now - entry.lastChange >= quietMs) || now - start >= settleMs) {
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
    if (schema?.internal === true) {
      continue;
    }
    const name = toolName(served.token.name);
    const commands = new Map<string, CommandSchema | null>();
    for (const command of Object.keys(served.source.commands ?? {})) {
      const described = schema?.commands[command];
      if (described?.hidden !== true) {
        commands.set(command, described ?? null);
      }
    }
    const queries = new Map<string, QuerySchema | null>();
    for (const query of Object.keys(served.source.queries ?? {})) {
      const described = schema?.queries?.[query];
      if (described?.hidden !== true) {
        queries.set(query, described ?? null);
      }
    }
    const entry: Entry = {
      served,
      name,
      description: schema?.description,
      viewSchema: schema === undefined ? undefined : withoutKeys(schema.view, schema.hidden ?? []),
      view: { ...(served.token.initial as Record<string, unknown>) },
      hidden: new Set(schema?.hidden ?? []),
      commands,
      queries,
      scope: schema?.scope ?? served.token.name,
      changes: 0,
      lastChange: 0
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
        annotations: { readOnlyHint: true, openWorldHint: false },
        _meta: { [SCOPE_META]: `${entry.scope}:read` }
      },
      async () => {
        follow();
        return viewResult(entry, `The ${served.token.name} view.`);
      }
    );

    for (const [command, described] of commands) {
      add(commandTool(entry, command, described), (args, context) => send(entry, command, described, args, context));
    }
    for (const [query, described] of queries) {
      add(queryTool(entry, query, described), args => ask(entry, query, described, args));
    }
  }

  /** Answers a query: its arguments checked as a command's are, and what it returns handed back as it is. */
  const ask = async (
    entry: Entry,
    query: string,
    described: QuerySchema | null,
    args: Readonly<Record<string, unknown>> | undefined
  ): Promise<AgentToolResult> => {
    const channel = entry.served.token.name;
    const positional = positionalArguments(described, args);
    if (!Array.isArray(positional)) {
      return positional;
    }
    const handler = entry.served.source.queries?.[query] as ((...values: unknown[]) => unknown) | undefined;
    if (handler === undefined) {
      return failure(`${channel} has no query ${query}.`);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const late = Symbol('late');
      const answer = await Promise.race([
        Promise.resolve(handler(...positional)),
        new Promise<typeof late>(resolve => {
          timer = setTimeout(() => resolve(late), QUERY_MS);
        })
      ]);
      if (answer === late) {
        return failure(`${channel}.${query} did not answer within ${QUERY_MS / 1000} seconds.`);
      }
      const value = describeSharedMemory(answer === undefined ? null : answer);
      return {
        content: [{ type: 'text', text: `${channel}.${query} answered:\n${JSON.stringify(value)}` }],
        structuredContent: isRecord(value) ? value : { result: value },
        isError: false
      };
    } catch (error) {
      return failure(`${channel}.${query} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  };

  const send = async (
    entry: Entry,
    command: string,
    described: CommandSchema | null,
    args: Readonly<Record<string, unknown>> | undefined,
    context: AgentCallContext
  ): Promise<AgentToolResult> => {
    follow();
    const channel = entry.served.token.name;
    const positional = positionalArguments(described, args);
    if (!Array.isArray(positional)) {
      return positional;
    }
    if (described?.confirm === true) {
      if (options.confirm === undefined) {
        return failure(
          `${channel}.${command} asks for a person to approve it, and this application has given agents no way ` +
            'to ask. Ask the person to do it themselves.'
        );
      }
      const input = repairedArguments(described.input, args ?? {}) as Readonly<Record<string, unknown>>;
      let answer: AgentAnswer;
      try {
        answer = agentAnswer(
          await options.confirm({
            channel,
            command,
            ...(described.description === undefined ? {} : { description: described.description }),
            arguments: input,
            destructive: described.destructive === true,
            question: questionFor(entry, command, described, input, positional),
            ...(context.agent === undefined || context.agent === '' ? {} : { agent: context.agent })
          })
        );
      } catch (error) {
        answer = { unavailable: `asking failed: ${error instanceof Error ? error.message : String(error)}` };
      }
      const refused = refusal(answer, `${channel}.${command}`);
      if (refused !== null) {
        return refused;
      }
    }
    const handler = entry.served.source.commands?.[command] as ((...values: unknown[]) => void) | undefined;
    if (handler === undefined) {
      return failure(`${channel} has no command ${command}.`);
    }
    const before = entry.changes;
    // What the agent last could have seen, to tell it when a command left it as it was: commands return
    // nothing, so a view that did not move is the only sign that one had nothing to act on. Compared as
    // text, because a source that sends an equal value again counts as a change.
    const was = JSON.stringify(shown(entry));
    try {
      handler(...positional);
    } catch (error) {
      return failure(`${channel}.${command} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await settle(entry, before);
    if (JSON.stringify(shown(entry)) === was) {
      return viewResult(
        entry,
        `Sent ${command} to ${channel}, and the view is the same as before. Either the command had nothing to act on ` +
          '(an id that matches nothing, a value it already had), or what it changed is not in this view, or it is ' +
          `still working after ${settleMs} ms. The view:`,
        'unchanged'
      );
    }
    return viewResult(entry, `Sent ${command} to ${channel}. The view afterwards:`, 'changed');
  };

  return {
    tools: () => tools,
    call: async (name, args, context = {}) => {
      const handler = handlers.get(name);
      if (handler === undefined) {
        return failure(`There is no tool called ${name}. The tools are ${[...handlers.keys()].join(', ')}.`);
      }
      return handler(args, context);
    },
    resources: () =>
      entries.map(entry => ({
        uri: resourceUri(entry.served.token.name),
        name: entry.served.token.name,
        ...(entry.description === undefined ? {} : { description: entry.description }),
        mimeType: 'application/json' as const,
        _meta: { [SCOPE_META]: `${entry.scope}:read` }
      })),
    read: uri => {
      const entry = entries.find(candidate => resourceUri(candidate.served.token.name) === uri);
      if (entry === undefined) {
        return undefined;
      }
      follow();
      return shown(entry);
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

/**
 * What the person is asked before a `@confirm` command: the
 * application's own wording for it in `serve`, given the arguments as
 * the command takes them; else the question written after the tag, with
 * each `{parameter}` (or `{parameter.field}`) put in; else a question
 * written from the command's name, with its description and arguments
 * as the detail. Wording that throws is passed over for the next.
 */
function questionFor(
  entry: Entry,
  command: string,
  described: CommandSchema,
  input: Readonly<Record<string, unknown>>,
  positional: readonly unknown[]
): AgentQuestion {
  const own = entry.served.source.confirm?.[command] as ((...values: unknown[]) => string | AgentQuestion) | undefined;
  if (own !== undefined) {
    try {
      const worded = own(...positional);
      if (typeof worded === 'string' && worded.trim() !== '') return { title: worded };
      if (typeof worded === 'object' && worded !== null && typeof worded.title === 'string') return worded;
    } catch {
      // The wording failed, not the command: ask in the contract's words instead.
    }
  }
  if (described.question !== undefined && described.question.trim() !== '') {
    return { title: fillQuestion(described.question, input) };
  }
  const shownArguments = Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join('\n');
  const detail = [described.description, shownArguments].filter(part => part !== undefined && part !== '').join('\n\n');
  return {
    title: `Allow ${command} in ${entry.served.token.name}?`,
    ...(detail === '' ? {} : { detail })
  };
}

/** A `@confirm` question with each `{name}` or `{name.field}` replaced by that argument, and the rest left as written. */
export function fillQuestion(template: string, input: Readonly<Record<string, unknown>>): string {
  return template.replace(/\{\s*([\w$]+(?:\.[\w$]+)*)\s*\}/g, (whole, path: string) => {
    let value: unknown = input;
    for (const key of path.split('.')) {
      value = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
    }
    if (value === undefined) return whole;
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

/**
 * A tool call's named arguments as the positional list a command or a
 * query takes, or the failure that says why they do not fit.
 */
function positionalArguments(
  described: { readonly parameters: readonly string[]; readonly rest?: true; readonly input: JsonSchema } | null,
  args: Readonly<Record<string, unknown>> | undefined
): unknown[] | AgentToolResult {
  if (described === null) {
    const list = (args ?? {}).arguments ?? [];
    return Array.isArray(list) ? list : failure('arguments must be an array of the values it takes, in order.');
  }
  const input = repairedArguments(described.input, args ?? {}) as Readonly<Record<string, unknown>>;
  const problem = validate(described.input, input);
  if (problem !== null) {
    return failure(problem);
  }
  // Bytes arrive as base64, which is all JSON can carry, and leave
  // as the typed array or buffer the command was written to take.
  const properties = (described.input.properties as Record<string, JsonSchema> | undefined) ?? {};
  const positional = described.parameters.map(parameter =>
    decodeBinary(properties[parameter], input[parameter], described.input)
  );
  if (described.rest === true) {
    const spread = positional.pop();
    positional.push(...(Array.isArray(spread) ? spread : []));
  }
  while (positional.length > 0 && positional[positional.length - 1] === undefined) {
    positional.pop();
  }
  return positional;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

/**
 * What the agent is told when the person did not approve what it asked
 * for (`what`: `expenses.remove`), or null when they did: a no, which it
 * must not ask again, or nobody asked, which it may once the window is
 * in front of them.
 */
export function refusal(answer: AgentAnswer, what: string): AgentToolResult | null {
  if (answer === 'approved') {
    return null;
  }
  if (answer === 'declined') {
    return {
      ...failure(`The person declined ${what}. Do not send it again unless they ask.`),
      _meta: { [OUTCOME_META]: 'declined' }
    };
  }
  const why = answer === 'unavailable' ? 'there was no way to show them the question' : answer.unavailable;
  return {
    ...failure(
      `Nobody could be asked to approve ${what}: ${why}. The person did not decline it. Ask them ` +
        "to bring the app's window forward and call it again, or to do it themselves."
    ),
    _meta: { [OUTCOME_META]: 'unasked' }
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
  lines.push(`Returns the view after the command has taken effect, in the shape ${toolName(`${channel}_view`)} gives.`);
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
    // No `outputSchema`, though a command returns the view: it is the view tool's already, and repeating a
    // whole view's schema on every command made a real application's tool list about 200 KB, which an agent
    // pays for in context before its first call. The result still carries the view as `structuredContent`.
    annotations: {
      readOnlyHint: false,
      ...(destructive ? { destructiveHint: true } : { destructiveHint: false }),
      ...(described?.idempotent === true ? { idempotentHint: true } : {}),
      openWorldHint: false
    },
    _meta: { [SCOPE_META]: described?.scope ?? `${entry.scope}:write` }
  };
}

function queryTool(entry: Entry, query: string, described: QuerySchema | null): AgentTool {
  const channel = entry.served.token.name;
  const lines = [described?.description ?? `Asks the ${channel} channel ${query}.`];
  if (described?.returns !== undefined) {
    lines.push(`Returns ${described.returns}`);
  }
  if (described === null) {
    lines.push('This query was not described, so its arguments are a positional list.');
  }
  lines.push("It changes nothing, and nothing on the person's screen moves.");
  return {
    name: toolName(`${channel}_${query}`),
    title: `${channel}: ${query}`,
    description: lines.join('\n\n'),
    inputSchema:
      described?.input ??
      ({
        type: 'object',
        properties: { arguments: { type: 'array', description: 'The arguments, in order.' } },
        additionalProperties: false
      } satisfies JsonSchema),
    // No `outputSchema`, as for a command: a row type repeated on every query is what made tool lists heavy.
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    _meta: { [SCOPE_META]: described?.scope ?? `${entry.scope}:read` }
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

/** The view as an agent is given it: without its hidden keys. */
function shown(entry: Entry): Record<string, unknown> {
  const view: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry.view)) {
    // Shared memory is a handle the agent can do nothing with, and JSON
    // would show it as `{}`; it is described instead.
    if (!entry.hidden.has(key)) view[key] = describeSharedMemory(value);
  }
  return view;
}

/** An object schema without some of its properties. */
function withoutKeys(schema: JsonSchema, keys: readonly string[]): JsonSchema {
  if (keys.length === 0) return schema;
  const properties = { ...(schema.properties as Record<string, JsonSchema> | undefined) };
  for (const key of keys) delete properties[key];
  const required = Array.isArray(schema.required)
    ? (schema.required as string[]).filter(key => !keys.includes(key))
    : undefined;
  return { ...schema, properties, ...(required === undefined ? {} : { required }) };
}

function viewResult(entry: Entry, lead: string, outcome?: 'changed' | 'unchanged'): AgentToolResult {
  const view = shown(entry);
  return {
    // Compact: the same view is in structuredContent, and indenting a
    // large one doubles what the agent reads for nothing.
    content: [{ type: 'text', text: `${lead}\n${JSON.stringify(view)}` }],
    structuredContent: view,
    isError: false,
    ...(outcome === undefined ? {} : { _meta: { [OUTCOME_META]: outcome } })
  };
}

function failure(text: string): AgentToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}
