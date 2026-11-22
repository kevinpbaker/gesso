import type { AgentActivityEntry, AgentOutcome } from '../app/AgentActivityService';
import type { AgentSurfaceLike, AgentToolResult } from './AgentSurface';

/** The `_meta` key on a tool's result that says what came of it; see `AgentOutcome`. */
export const OUTCOME_META = 'gesso/outcome';

/** Where a surface's activity is written: an `AgentActivityService`, or anything with its `record`. */
export interface AgentActivitySink {
  record(entry: Omit<AgentActivityEntry, 'id'>): unknown;
}

/**
 * A surface that writes down each call an agent makes of a tool that
 * can change something, with who made it and what came of it, before
 * answering as the surface does. Reading tools (`readOnlyHint`) are not
 * written down.
 *
 *   const activity = new AgentActivityService();
 *   mcpHandler(recordAgentActivity(agentSurface(channels), activity), { name: 'notes' });
 *
 * The render worker does this itself, into the runtime's own
 * `AgentActivityService`.
 */
export function recordAgentActivity(
  surface: AgentSurfaceLike,
  sink: AgentActivitySink | (() => AgentActivitySink | undefined)
): AgentSurfaceLike {
  const known = new Map<string, { readonly readOnly: boolean; readonly title?: string }>();
  const list = async () => {
    const tools = await surface.tools();
    for (const tool of tools) {
      known.set(tool.name, {
        readOnly: tool.annotations.readOnlyHint,
        ...(tool.title === undefined ? {} : { title: tool.title })
      });
    }
    return tools;
  };
  return {
    ...surface,
    tools: list,
    resources: () => surface.resources(),
    read: uri => surface.read(uri),
    call: async (name, args, context) => {
      if (!known.has(name)) await list();
      const result = await surface.call(name, args, context);
      const tool = known.get(name);
      const target = typeof sink === 'function' ? sink() : sink;
      if (tool !== undefined && !tool.readOnly && target !== undefined) {
        target.record({
          at: Date.now(),
          ...(context?.agent === undefined || context.agent === '' ? {} : { agent: context.agent }),
          tool: name,
          ...(tool.title === undefined ? {} : { title: tool.title }),
          arguments: args ?? {},
          outcome: outcomeOf(result)
        });
      }
      return result;
    },
    ...(surface.dispose === undefined ? {} : { dispose: () => surface.dispose!() }),
    ...(surface.watch === undefined ? {} : { watch: listener => surface.watch!(listener) })
  };
}

/** What came of a call: what its result says in `_meta`, else changed, or failed for an error. */
export function outcomeOf(result: AgentToolResult): AgentOutcome {
  const said = result._meta?.[OUTCOME_META];
  if (said === 'changed' || said === 'unchanged' || said === 'declined' || said === 'unasked' || said === 'failed') {
    return said;
  }
  return result.isError ? 'failed' : 'changed';
}
