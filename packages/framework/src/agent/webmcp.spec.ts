import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { describeChannel } from '../channel/ChannelSchema';
import { defineChannel } from '../channel/ChannelToken';
import { serve } from '../channel/serveChannels';
import { agentSurface } from './AgentSurface';
import { registerWebMcpTools, type ModelContextLike } from './webmcp';

type Registered = Parameters<ModelContextLike['registerTool']>[0];

/**
 * A model context that behaves as the spec says: a name already taken
 * is rejected with InvalidStateError, and aborting the signal a tool
 * was registered with removes it.
 */
function fakeModelContext() {
  const tools = new Map<string, Registered>();
  const context: ModelContextLike = {
    registerTool: async (tool, options) => {
      if (tools.has(tool.name)) {
        throw new DOMException(`${tool.name} is taken`, 'InvalidStateError');
      }
      tools.set(tool.name, tool);
      options?.signal?.addEventListener('abort', () => tools.delete(tool.name));
    }
  };
  return { context, tools };
}

const Lists = defineChannel('lists', {
  view: { items: [] as readonly string[] },
  commands: {} as { add(item: string): void; clear(): void }
});
describeChannel(Lists, {
  description: 'A shopping list.',
  view: { type: 'object', properties: { items: { type: 'array', items: { type: 'string' } } } },
  commands: {
    add: {
      description: 'Adds an item.',
      parameters: ['item'],
      input: {
        type: 'object',
        properties: { item: { type: 'string' } },
        required: ['item'],
        additionalProperties: false
      }
    },
    clear: { parameters: [], input: { type: 'object', properties: {} }, destructive: true }
  }
});

function lists() {
  const items = new BehaviorSubject<readonly string[]>([]);
  const surface = agentSurface(
    [
      serve(Lists, {
        view: { items },
        commands: { add: (item: string) => items.next([...items.value, item]), clear: () => items.next([]) }
      })
    ],
    { quietMs: 1, settleMs: 50 }
  );
  return { surface, items };
}

describe('registering with WebMCP', () => {
  it('registers every tool, with the hints WebMCP has', async () => {
    const { context, tools } = fakeModelContext();
    await registerWebMcpTools(lists().surface, context);

    expect([...tools.keys()]).toEqual(['lists_view', 'lists_add', 'lists_clear']);
    expect(tools.get('lists_view')!.annotations).toEqual({ readOnlyHint: true, consequentialHint: false });
    expect(tools.get('lists_clear')!.annotations).toEqual({ readOnlyHint: false, consequentialHint: true });
    expect(tools.get('lists_add')!.inputSchema).toMatchObject({ required: ['item'] });
    expect(tools.get('lists_view')!.description).toContain('A shopping list.');
  });

  it('answers a call with the view it left', async () => {
    const { context, tools } = fakeModelContext();
    const app = lists();
    await registerWebMcpTools(app.surface, context);

    expect(await tools.get('lists_add')!.execute({ item: 'eggs' })).toEqual({ items: ['eggs'] });
    expect(app.items.value).toEqual(['eggs']);
  });

  it('rejects a call the contract refuses, with the sentence that says why', async () => {
    const { context, tools } = fakeModelContext();
    await registerWebMcpTools(lists().surface, context);
    await expect(tools.get('lists_add')!.execute({ item: 3 })).rejects.toThrow('input.item must be a string');
  });

  it('removes every tool it registered when asked', async () => {
    const { context, tools } = fakeModelContext();
    const unregister = await registerWebMcpTools(lists().surface, context);
    unregister();
    expect(tools.size).toBe(0);
  });

  it('skips a tool the page already registered, and keeps the rest', async () => {
    const { context, tools } = fakeModelContext();
    await context.registerTool({ name: 'lists_add', description: 'mine', execute: async () => null });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await registerWebMcpTools(lists().surface, context);

    expect(tools.get('lists_add')!.description).toBe('mine');
    expect([...tools.keys()]).toEqual(['lists_add', 'lists_view', 'lists_clear']);
    expect(warn).toHaveBeenCalledWith('[gesso] WebMCP refused the tool lists_add:', expect.any(DOMException));
    warn.mockRestore();
  });

  it('does nothing in a browser without WebMCP', async () => {
    const unregister = await registerWebMcpTools(lists().surface, undefined);
    expect(() => unregister()).not.toThrow();
  });
});
