import { describe, expect, it } from 'vitest';

import { combineSurfaces } from './remote';
import { agentImages, agentText, toolSurface, type AgentToolDefinition } from './tools';

const measure: AgentToolDefinition = {
  name: 'board_measure',
  description: 'How wide a screen is.',
  inputSchema: {
    type: 'object',
    properties: { screen: { type: 'string' } },
    required: ['screen'],
    additionalProperties: false
  },
  readOnly: true,
  run: ({ screen }) => agentText(`${String(screen)} is 390 wide.`, { width: 390 })
};

describe("an application's own agent tools", () => {
  it('are listed with their schema and hints, and answer with what run returns', async () => {
    const surface = toolSurface(() => [measure]);
    expect(await surface.tools()).toEqual([
      {
        name: 'board_measure',
        description: 'How wide a screen is.',
        inputSchema: measure.inputSchema,
        annotations: { readOnlyHint: true, openWorldHint: false }
      }
    ]);
    expect(await surface.call('board_measure', { screen: 'SignIn' })).toEqual({
      content: [{ type: 'text', text: 'SignIn is 390 wide.' }],
      structuredContent: { width: 390 },
      isError: false
    });
  });

  it('check the arguments first, and turn a throw into a failure the agent reads', async () => {
    const failing: AgentToolDefinition = {
      ...measure,
      name: 'board_fail',
      run: () => Promise.reject(new Error('No such screen.'))
    };
    const surface = toolSurface(() => [measure, failing]);
    expect(await surface.call('board_measure', {})).toEqual({
      content: [{ type: 'text', text: expect.stringContaining('board_measure: input') }],
      isError: true
    });
    expect(await surface.call('board_fail', { screen: 'X' })).toEqual({
      content: [{ type: 'text', text: 'board_fail failed: No such screen.' }],
      isError: true
    });
  });

  it('answer with pictures as PNG data', () => {
    expect(agentImages('Two.', [new Uint8Array([137, 80, 78, 71])]).content).toEqual([
      { type: 'text', text: 'Two.' },
      { type: 'image', data: 'iVBORw==', mimeType: 'image/png' }
    ]);
  });

  it('are offered beside the rest, and a name taken first keeps its tool', async () => {
    const other = toolSurface(() => [{ ...measure, description: 'Another.' }]);
    const combined = combineSurfaces([toolSurface(() => [measure]), other]);
    const tools = await combined.tools();
    expect(tools.map(tool => tool.description)).toEqual(['How wide a screen is.']);
  });
});
