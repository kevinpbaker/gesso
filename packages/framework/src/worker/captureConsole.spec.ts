import { describe, expect, it, vi } from 'vitest';

import { captureConsole, formatConsoleArg, isConsoleEntryMessage, isConsoleForwardingMessage } from './captureConsole';

function fakeConsole() {
  const calls: string[] = [];
  const make = (level: string) => vi.fn((...args: unknown[]) => calls.push(`${level}:${args.join(' ')}`));
  const target = {
    log: make('log'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
    debug: make('debug')
  };
  return { target: target as unknown as Console, original: { ...target }, calls };
}

describe('captureConsole', () => {
  it('copies each call to the sink as strings and still makes the original call', () => {
    const { target, calls } = fakeConsole();
    const seen: unknown[] = [];
    captureConsole(entry => seen.push(entry), target);

    target.warn('careful', 3, { a: 1 });

    expect(calls).toEqual(['warn:careful 3 [object Object]']);
    expect(seen).toEqual([{ level: 'warn', args: ['careful', '3', '{"a":1}'], at: expect.any(Number) }]);
  });

  it('prints an Error as its stack, which is what a developer wants whole', () => {
    const error = new Error('boom');
    expect(formatConsoleArg(error)).toBe(error.stack);
    expect(formatConsoleArg('plain')).toBe('plain');
  });

  it('restores the original methods, and replaces the sink rather than nesting on a second capture', () => {
    const { target, original } = fakeConsole();
    const first: unknown[] = [];
    const second: unknown[] = [];
    const restore = captureConsole(entry => first.push(entry), target);
    captureConsole(entry => second.push(entry), target);

    target.log('once');
    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);

    restore();
    expect(target.log).toBe(original.log);
    target.log('after');
    expect(second).toHaveLength(1);
  });

  it('survives a sink that throws', () => {
    const { target, calls } = fakeConsole();
    captureConsole(() => {
      throw new Error('sink broke');
    }, target);

    expect(() => target.error('still logged')).not.toThrow();
    expect(calls).toEqual(['error:still logged']);
  });

  it('recognises the two messages and nothing else', () => {
    expect(isConsoleForwardingMessage({ type: 'gesso:console', enabled: true })).toBe(true);
    expect(isConsoleForwardingMessage({ type: 'gesso:console', entry: {} })).toBe(false);
    expect(isConsoleEntryMessage({ type: 'gesso:console', entry: { level: 'log', args: [], at: 0 } })).toBe(true);
    expect(isConsoleEntryMessage({ type: 'gesso:console', enabled: false })).toBe(false);
    expect(isConsoleEntryMessage(null)).toBe(false);
  });
});
