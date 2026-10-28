import type { JsonSchema } from '../channel/ChannelSchema';
import {
  WAITS_UP_TO,
  type AgentContent,
  type AgentSurfaceLike,
  type AgentTool,
  type AgentToolResult
} from './AgentSurface';
import { validate } from './validate';

/**
 * Tools an application offers an agent of its own accord, beside the
 * ones its channels and its screen give it.
 *
 * A channel command answers with the view, which is right for "do this
 * and show me the state": the agent sees what its call did. Some tools
 * answer with something else: a measurement, a list of problems, a
 * picture composed for the occasion. Those an application writes here,
 * and the render worker serves them with the rest:
 *
 *   renderRoot(App).useAgentTools([{
 *     name: 'board_check',
 *     description: 'What is wrong with a screen, by element.',
 *     inputSchema: { type: 'object', properties: { screen: { type: 'string' } }, required: ['screen'] },
 *     readOnly: true,
 *     run: async ({ screen }) => agentText(await check(screen as string))
 *   }]);
 *
 * Arguments are checked against `inputSchema` before `run` is called,
 * and a thrown error becomes a result the agent reads, as every Gesso
 * tool's does: an agent corrects a call it can read the failure of.
 */
export interface AgentToolDefinition {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  /** An object schema: the tool's arguments, by name. */
  readonly inputSchema: JsonSchema;
  /** It changes nothing. */
  readonly readOnly?: boolean;
  /** It may undo or overwrite something a person made. */
  readonly destructive?: boolean;
  /** Calling it twice with the same arguments does what calling it once did. */
  readonly idempotent?: boolean;
  /**
   * How long a call may take, in milliseconds, for a tool that waits on
   * purpose: for a person to answer, or for something to happen (a tool
   * an agent calls to wait for its next task). The bridges between the
   * agent and this thread give it that long, where they would give up on
   * any other call after two minutes.
   */
  readonly waitsUpToMs?: number;
  run(args: Readonly<Record<string, unknown>>): AgentToolResult | Promise<AgentToolResult>;
}

/** A tool's answer as text, and, given, the same as data. */
export function agentText(text: string, structured?: Record<string, unknown>): AgentToolResult {
  return {
    content: [{ type: 'text', text }],
    ...(structured === undefined ? {} : { structuredContent: structured }),
    isError: false
  };
}

/** A tool's failure, written for the agent to correct its call by. */
export function agentError(text: string): AgentToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** A tool's answer as text and pictures, each a PNG's bytes. */
export function agentImages(
  text: string,
  pictures: readonly Uint8Array[],
  structured?: Record<string, unknown>
): AgentToolResult {
  const content: AgentContent[] = [{ type: 'text', text }];
  for (const png of pictures) {
    content.push({ type: 'image', data: base64(png), mimeType: 'image/png' });
  }
  return { content, ...(structured === undefined ? {} : { structuredContent: structured }), isError: false };
}

/** Serves a list of tool definitions as a surface, read afresh each time so a list may change. */
export function toolSurface(definitions: () => readonly AgentToolDefinition[]): AgentSurfaceLike {
  const listed = (definition: AgentToolDefinition): AgentTool => ({
    name: definition.name,
    ...(definition.title === undefined ? {} : { title: definition.title }),
    description: definition.description,
    inputSchema: definition.inputSchema,
    annotations: {
      ...(definition.title === undefined ? {} : { title: definition.title }),
      readOnlyHint: definition.readOnly === true,
      ...(definition.destructive === undefined ? {} : { destructiveHint: definition.destructive }),
      ...(definition.idempotent === undefined ? {} : { idempotentHint: definition.idempotent }),
      openWorldHint: false
    },
    ...(definition.waitsUpToMs === undefined ? {} : { _meta: { [WAITS_UP_TO]: definition.waitsUpToMs } })
  });
  return {
    tools: () => definitions().map(listed),
    resources: () => [],
    read: () => undefined,
    call: async (name, args) => {
      const definition = definitions().find(each => each.name === name);
      if (definition === undefined) {
        return agentError(`There is no tool called ${name}.`);
      }
      const input = args ?? {};
      const problem = validate(definition.inputSchema, input);
      if (problem !== null) {
        return agentError(`${name}: ${problem}`);
      }
      try {
        return await definition.run(input);
      } catch (error) {
        return agentError(`${name} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let at = 0; at < bytes.length; at += chunk) {
    binary += String.fromCharCode(...bytes.subarray(at, at + chunk));
  }
  return btoa(binary);
}
