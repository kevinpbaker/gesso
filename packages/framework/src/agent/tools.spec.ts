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

  it('take an object or array an agent sent as JSON text as the object or array', async () => {
    const seen: unknown[] = [];
    const place: AgentToolDefinition = {
      name: 'part_place',
      description: 'Places a part.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          at: { type: 'array', items: { type: 'number' } },
          profile: { type: ['object', 'null'], properties: { id: { type: 'string' } } },
          holes: {
            type: 'array',
            items: { type: 'object', properties: { shape: { type: 'object', properties: { d: { type: 'number' } } } } }
          },
          note: { anyOf: [{ type: 'string' }, { type: 'object' }] }
        }
      },
      run: args => {
        seen.push(args);
        return agentText('placed');
      }
    };
    const surface = toolSurface(() => [place]);
    await surface.call('part_place', {
      name: '{not parsed: a string may be any text}',
      at: '[10, 20]',
      profile: ' {"id": "sendcutsend"} ',
      holes: [{ shape: '{"d": 6}' }],
      note: '{"left": "as it came"}'
    });
    expect(seen[0]).toEqual({
      name: '{not parsed: a string may be any text}',
      at: [10, 20],
      profile: { id: 'sendcutsend' },
      holes: [{ shape: { d: 6 } }],
      note: '{"left": "as it came"}'
    });
  });

  it('take JSON text with a line break left raw in a string, as a file written out', async () => {
    const seen: unknown[] = [];
    const surface = toolSurface(() => [
      {
        name: 'files_write',
        description: 'Writes files.',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'object', properties: { path: { type: 'string' }, contents: { type: 'string' } } }
            }
          }
        },
        run: args => {
          seen.push(args);
          return agentText('written');
        }
      }
    ]);
    await surface.call('files_write', {
      files: '[{"path": "a.tsx", "contents": "line one\n\tline two \\"quoted\\""}]'
    });
    expect(seen[0]).toEqual({ files: [{ path: 'a.tsx', contents: 'line one\n\tline two "quoted"' }] });
  });

  it('leave out an optional value an agent sent as null, where null is not taken', async () => {
    const seen: unknown[] = [];
    const surface = toolSurface(() => [
      {
        name: 'comment_add',
        description: 'Adds a comment.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            thread: { type: 'string' },
            at: { type: 'object', properties: { x: { type: 'number' } } },
            status: { type: ['string', 'null'] }
          },
          required: ['text', 'at'],
          additionalProperties: false
        },
        run: args => {
          seen.push(args);
          return agentText('added');
        }
      }
    ]);
    await surface.call('comment_add', { text: 'Hi', thread: null, at: { x: 1 }, status: null });
    expect(seen[0]).toEqual({ text: 'Hi', at: { x: 1 }, status: null });
    const missing = await surface.call('comment_add', { text: 'Hi', at: null });
    expect(JSON.stringify(missing)).toContain('input.at must be an object');
    await surface.call('comment_add', { text: 'Hi', at: { x: 1 }, thread: 'null' });
    expect(seen[1]).toEqual({ text: 'Hi', at: { x: 1 }, thread: 'null' });
  });

  it('leave out an optional id or word an agent sent as "", which names nothing', async () => {
    const seen: unknown[] = [];
    const surface = toolSurface(() => [
      {
        name: 'region_add',
        description: 'Adds a region.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            note: { type: 'string' },
            after: { type: 'string', pattern: '^r[0-9]+$' },
            kind: { type: 'string', enum: ['math', 'text'] },
            id: { type: 'string', pattern: '^r[0-9]+$' }
          },
          required: ['text', 'id'],
          additionalProperties: false
        },
        run: args => {
          seen.push(args);
          return agentText('added');
        }
      }
    ]);
    await surface.call('region_add', { text: 'x', note: '', after: '', kind: '', id: 'r1' });
    // Free text keeps its "": it is a value there.
    expect(seen[0]).toEqual({ text: 'x', note: '', id: 'r1' });
    // A required one is not guessed at.
    await surface.call('region_add', { text: 'x', id: '' });
    expect(seen[1]).toEqual({ text: 'x', id: '' });
  });

  it('leave text that is not the JSON the schema wants for the checks to refuse', async () => {
    const surface = toolSurface(() => [
      {
        name: 'list_take',
        description: 'Takes a list.',
        inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } } },
        run: () => agentText('taken')
      }
    ]);
    const broken = await surface.call('list_take', { ids: '[1, 2' });
    expect(broken).toMatchObject({ isError: true });
    expect(JSON.stringify(broken)).toContain('input.ids must be an array');
    const wrongKind = await surface.call('list_take', { ids: '{"a": 1}' });
    expect(JSON.stringify(wrongKind)).toContain('input.ids must be an array');
  });

  it('take a number or a boolean an agent sent as a string as the number or boolean', async () => {
    const seen: unknown[] = [];
    const surface = toolSurface(() => [
      {
        name: 'box_make',
        description: 'Makes a box.',
        inputSchema: {
          type: 'object',
          properties: {
            width: { type: 'number' },
            count: { type: 'integer' },
            lid: { type: 'boolean' },
            label: { type: 'string' },
            depth: { type: ['number', 'string'] },
            at: {
              anyOf: [
                { type: 'array', items: { type: 'number' } },
                { type: 'string', enum: ['center'] }
              ]
            },
            side: { type: 'string', enum: ['left', 'right'] }
          }
        },
        run: args => {
          seen.push(args);
          return agentText('made');
        }
      }
    ]);
    await surface.call('box_make', {
      width: ' 120.5 ',
      count: '6',
      lid: 'false',
      label: '42',
      depth: '30',
      at: '[10, 20]',
      side: 'left'
    });
    expect(seen[0]).toEqual({
      width: 120.5,
      count: 6,
      lid: false,
      label: '42',
      depth: '30',
      at: [10, 20],
      side: 'left'
    });
    await surface.call('box_make', { at: 'center' });
    expect(seen[1]).toEqual({ at: 'center' });
    const half = await surface.call('box_make', { count: '2.5' });
    expect(JSON.stringify(half)).toContain('input.count must be an integer');
  });

  it('say how to send JSON that would not parse', async () => {
    const surface = toolSurface(() => [
      {
        name: 'list_take',
        description: 'Takes a list.',
        inputSchema: { type: 'object', properties: { add: { type: 'array', items: { type: 'object' } } } },
        run: () => agentText('taken')
      }
    ]);
    const r = await surface.call('list_take', { add: "[{id: 'vent'}]" });
    expect(JSON.stringify(r)).toContain('Send the array itself, not text, and as JSON');
  });
  it('say what is wrong with the option of a tagged union a value was meant as', async () => {
    const seen: unknown[] = [];
    const shape = {
      anyOf: [
        {
          type: 'object',
          properties: { kind: { const: 'circle' }, x: { type: 'number' }, d: { type: 'number' } },
          required: ['kind', 'x', 'd'],
          additionalProperties: false
        },
        {
          type: 'object',
          properties: { kind: { const: 'rect' }, w: { type: 'number' }, h: { type: 'number' } },
          required: ['kind', 'w', 'h'],
          additionalProperties: false
        }
      ]
    };
    const surface = toolSurface(() => [
      {
        name: 'shape_add',
        description: 'Adds a shape.',
        inputSchema: { type: 'object', properties: { shape: { $ref: '#/$defs/shape' } }, $defs: { shape } },
        run: args => {
          seen.push(args);
          return agentText('added');
        }
      }
    ]);
    const said = async (shape: unknown) => JSON.stringify(await surface.call('shape_add', { shape }));
    expect(await said({ kind: 'circle', x: 1, w: 4 })).toContain('input.shape.d is required.');
    expect(await said({ kind: 'circle', x: 1, d: 4, w: 4 })).toContain(
      'input.shape.w is not expected; the fields are kind, x, d.'
    );
    expect(await said({ x: 1, d: 4 })).toContain('input.shape.kind must be one of \\"circle\\", \\"rect\\".');
    expect(await said({ kind: 'square', w: 4 })).toContain('input.shape.kind must be one of \\"circle\\", \\"rect\\".');
    // The option a value was meant as is followed for repairs too: "4" is a number in a rect.
    expect(await said({ kind: 'rect', w: '4', h: 2 })).toContain('added');
    expect(seen.at(-1)).toEqual({ shape: { kind: 'rect', w: 4, h: 2 } });
  });

  it('says what a key it does not take was likely meant as: a field it nearly names, or the object it belongs in', async () => {
    const surface = toolSurface(() => [
      {
        name: 'sheet_add',
        description: 'Adds regions.',
        inputSchema: {
          type: 'object',
          properties: {
            regions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  beam: { type: 'object', properties: { length: { type: 'string' } }, additionalProperties: false }
                },
                additionalProperties: false
              }
            },
            expression: { type: 'string' },
            unitSystem: { type: 'string' }
          },
          required: ['regions'],
          additionalProperties: false
        },
        run: () => agentText('added')
      }
    ]);
    const said = async (args: Record<string, unknown>) => JSON.stringify(await surface.call('sheet_add', args));
    expect(await said({ region: [] })).toContain('input.regions is required. Send it as regions, not region.');
    expect(await said({ regions: [], expr: 'x' })).toContain(
      'input.expr is not expected; the fields are regions, expression, unitSystem. Did you mean expression?'
    );
    expect(await said({ regions: [], units: 'SI' })).toContain('Did you mean unitSystem?');
    expect(await said({ regions: [{ length: '6m' }] })).toContain(
      'input.regions[0].length is not expected; the fields are text, beam. length belongs inside beam: {beam: {length: …}}.'
    );
    // A short name is never taken for another: x is not y.
    expect(await said({ regions: [], q: 1 })).toContain('the fields are regions, expression, unitSystem.\"');
  });
});
