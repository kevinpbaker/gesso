import { describe, expect, it } from 'vitest';

import { channelSchema, describeChannel, type ChannelSchema } from './ChannelSchema';
import { defineChannel } from './ChannelToken';

const Notes = defineChannel('notes', {
  view: { rows: [] as readonly string[] },
  commands: {} as { remove(id: string): void }
});

const SCHEMA: ChannelSchema = {
  view: { type: 'object', properties: { rows: { type: 'array', items: { type: 'string' } } } },
  commands: {
    remove: {
      parameters: ['id'],
      input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      destructive: true
    }
  }
};

describe('a described channel', () => {
  it('has no schema until something describes it', () => {
    expect(channelSchema(defineChannel('bare', { view: {} }))).toBeUndefined();
  });

  it('hands back what it was described with, without touching the token', () => {
    describeChannel(Notes, SCHEMA);
    expect(channelSchema(Notes)).toBe(SCHEMA);
    expect(Object.keys(Notes)).toEqual(['name', 'initial']);
  });

  it('takes the latest description, as a hot-replaced contract gives it', () => {
    const next = { ...SCHEMA, description: 'The notes.' };
    describeChannel(Notes, next);
    expect(channelSchema(Notes)).toBe(next);
  });
});
