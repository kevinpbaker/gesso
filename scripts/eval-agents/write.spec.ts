import { describe, expect, it } from 'vitest';

import { checksOf, summariseWrite, type WriteRun } from './write.ts';

const line = (event: object) => JSON.stringify(event);
const bash = (id: string, command: string) =>
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } });
const result = (id: string, isError: boolean) =>
  line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError }] } });

describe('the write eval', () => {
  it("counts the agent's typecheck and build runs, and the ones that failed as its wrong guesses", () => {
    const lines = [
      bash('a', 'npm run typecheck'),
      result('a', true),
      bash('b', 'npm run typecheck 2>&1 | head'),
      result('b', true),
      bash('c', 'npm run typecheck'),
      result('c', false),
      bash('d', 'ls src'),
      result('d', true),
      bash('e', 'npm run build'),
      result('e', false),
      'not json'
    ];
    expect(checksOf(lines)).toEqual({ checks: 4, wrongGuesses: 2 });
  });

  it('writes a table per arm, and a row per run, with a harness error said as one', () => {
    const run = (arm: 'gesso' | 'react', operable: boolean): WriteRun => ({
      arm,
      repeat: 1,
      typecheck: true,
      typeErrors: 0,
      build: true,
      checks: 3,
      wrongGuesses: 1,
      toolErrors: 0,
      toolCalls: 20,
      files: 3,
      linesAdded: 250,
      linesRemoved: 20,
      appTools: arm === 'gesso' ? ['expenses_view', 'expenses_add'] : [],
      operable,
      operateCalls: 2,
      operateTools: {},
      costUsd: 0.5,
      durationMs: 60_000,
      answer: 'Done.'
    });
    const summary = summariseWrite(
      [run('gesso', true), run('react', true), { ...run('react', false), repeat: 2, harnessError: 'no | Chrome' }],
      { date: '2026-11-22', model: 'sonnet' }
    );
    expect(summary).toContain('| gesso | 1 of 1 | 1 of 1 | 1 | 3 | 3 | 250 | 2 | 1 of 1 | $0.50 |');
    expect(summary).toContain('| react | 1 of 1 | 1 of 1 | 1 | 3 | 3 | 250 | 0 | 1 of 1 | $0.50 |');
    expect(summary).toContain('| gesso | 1 | green | ok | 1 of 3 | 3 | 250 | expenses_view, expenses_add | yes | 2 |');
    expect(summary).toContain('| react | 2 | harness error: no / Chrome |');
  });
});
