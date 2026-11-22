import { describe, expect, it } from 'vitest';

import type { ChannelSchemaOut } from './contracts.ts';
import { agentReadiness } from './readiness.ts';

const empty = { type: 'object', properties: {}, additionalProperties: false };

/** The issue tracker's contract, cut down to what it showed an agent. */
const issues: ChannelSchemaOut = {
  view: { type: 'object' },
  commands: {
    setQuery: { parameters: ['query'], input: empty },
    update: {
      parameters: ['request'],
      input: {
        type: 'object',
        properties: {
          request: {
            type: 'object',
            properties: {
              patch: { $ref: '#/$defs/Issue' },
              label: { type: 'string' }
            }
          }
        },
        $defs: {
          Issue: { type: 'object', properties: { priority: { enum: [0, 1, 2, 3, 4] }, title: { type: 'string' } } }
        }
      }
    },
    updateSelected: {
      description: 'One patch to every selected issue, as one transaction.',
      parameters: ['request'],
      input: {
        type: 'object',
        properties: { request: { type: 'object', properties: { patch: { $ref: '#/$defs/Issue' } } } },
        $defs: { Issue: { type: 'object', properties: { priority: { enum: [0, 1, 2, 3, 4] } } } }
      }
    },
    clearSelection: { parameters: [], input: empty },
    reset: { parameters: [], input: empty },
    removeView: { description: 'Deletes a saved view.', parameters: [], input: empty },
    debug: { parameters: [], input: empty, hidden: true }
  }
};

describe('agentReadiness', () => {
  it('says, in one message for the channel, what an agent would have to guess', () => {
    const [message, ...rest] = agentReadiness(new Map([['Issues', issues]]), 'src/issues/IssuesContract.ts');
    expect(rest).toEqual([]);
    expect(message).toBe(
      [
        'The channel Issues in src/issues/IssuesContract.ts is hard for an AI agent to use:',
        '  - 4 of its 6 commands have no JSDoc, so an agent reads only their names: setQuery, update, ' +
          'clearSelection, reset. Write a sentence on each, for someone who has never seen the code.',
        '  - reset has no JSDoc, and its name says it may not be undone, so agents are offered it with no confirm. ' +
          'Mark it `@destructive @confirm`, or `@hidden` to keep it from agents.',
        '  - update(request).patch.priority is one of 0, 1, 2, 3, 4, with nothing saying what each number means. ' +
          'Say so in a JSDoc on the field.'
      ].join('\n')
    );
  });

  it('leaves a contract written for agents alone', () => {
    const written: ChannelSchemaOut = {
      view: { type: 'object' },
      commands: {
        reset: { description: 'Puts the board back.', parameters: [], input: empty, destructive: true, confirm: true },
        setPriority: {
          description: 'Sets the priority.',
          parameters: ['level'],
          input: {
            type: 'object',
            properties: { level: { enum: [0, 1, 2], description: '0 none, 1 urgent, 2 high.' } }
          }
        }
      }
    };
    expect(agentReadiness(new Map([['Board', written]]), 'src/board.ts')).toEqual([]);
  });

  it('does not look at a channel kept from agents', () => {
    expect(agentReadiness(new Map([['Barrier', { ...issues, internal: true }]]), 'src/barrier.ts')).toEqual([]);
  });

  it('leaves an undescribed command alone once it is marked as needing a person', () => {
    const marked: ChannelSchemaOut = {
      view: { type: 'object' },
      commands: { remove: { parameters: [], input: empty, destructive: true, confirm: true } }
    };
    const [message] = agentReadiness(new Map([['Notes', marked]]), 'src/notes.ts');
    expect(message).toContain(
      'Its one command has no JSDoc, so an agent reads only its name: remove. Write a sentence on it,'
    );
    expect(message).not.toContain('may not be undone');
  });

  it('lists eight names and counts the rest', () => {
    const commands = Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [`c${i}`, { parameters: [], input: empty }])
    );
    const [message] = agentReadiness(new Map([['Many', { view: { type: 'object' }, commands }]]), 'src/many.ts');
    expect(message).toContain(
      'None of its 11 commands has JSDoc, so an agent reads only their names: c0, c1, c2, c3, c4, c5, c6, c7 and 3 more.'
    );
  });

  it('counts an undescribed query with the commands, and never asks to confirm one', () => {
    const schema: ChannelSchemaOut = {
      view: { type: 'object' },
      commands: { add: { description: 'Adds one.', parameters: [], input: empty } },
      queries: {
        removed: { parameters: [], input: empty },
        find: { description: 'Finds some.', parameters: [], input: empty },
        internal: { parameters: [], input: empty, hidden: true }
      }
    };
    const [message] = agentReadiness(new Map([['Shelf', schema]]), 'src/shelf.ts');
    expect(message).toContain(
      '1 of its 3 commands and queries has no JSDoc, so an agent reads only its name: removed.'
    );
    expect(message).not.toContain('may not be undone');
  });
});
