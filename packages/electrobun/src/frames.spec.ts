import { describe, expect, it } from 'vitest';

import { FrameAssembler, frameData, isGessoFrame } from './frames';

describe('frameData', () => {
  it('sends a small message whole', () => {
    const frames = frameData(3, { type: 'channel:sync' });
    expect(frames).toEqual([{ kind: 'data', stream: 3, body: '{"type":"channel:sync"}' }]);
  });

  it('splits a message that would not survive the transport', () => {
    const value = { patches: 'x'.repeat(2500) };
    const frames = frameData(1, value, 1000);
    expect(frames).toHaveLength(3);
    expect(frames.every(frame => frame.kind === 'data' && frame.body.length <= 1000)).toBe(true);
    expect(frames.map(frame => (frame.kind === 'data' ? frame.part : null))).toEqual([0, 1, 2]);
  });

  it('refuses a value it cannot serialize, naming the rule that was broken', () => {
    expect(() => frameData(1, () => 'a function')).toThrow(/plain data/);
  });
});

describe('FrameAssembler', () => {
  it('returns a whole message as it arrives', () => {
    const assembler = new FrameAssembler();
    const [frame] = frameData(1, { a: 1 });
    expect(assembler.take(frame as never)).toEqual({ a: 1 });
  });

  it('holds a split message until its last part', () => {
    const assembler = new FrameAssembler();
    const value = { items: Array.from({ length: 200 }, (_, index) => `row ${index}`) };
    const frames = frameData(7, value, 64);
    expect(frames.length).toBeGreaterThan(3);
    const results = frames.map(frame => assembler.take(frame as never));
    expect(results.slice(0, -1).every(result => result === undefined)).toBe(true);
    expect(results[results.length - 1]).toEqual(value);
  });

  it('keeps two streams apart while both are split', () => {
    const assembler = new FrameAssembler();
    const one = frameData(1, { which: 'one', pad: 'a'.repeat(200) }, 64);
    const two = frameData(2, { which: 'two', pad: 'b'.repeat(200) }, 64);
    // Interleaved, which is what a busy transport does.
    const results: unknown[] = [];
    for (let index = 0; index < Math.max(one.length, two.length); index++) {
      if (one[index] !== undefined) {
        results.push(assembler.take(one[index] as never));
      }
      if (two[index] !== undefined) {
        results.push(assembler.take(two[index] as never));
      }
    }
    const completed = results.filter(result => result !== undefined);
    expect(completed).toHaveLength(2);
    expect(completed.map(result => (result as { which: string }).which).sort()).toEqual(['one', 'two']);
  });

  it('says so loudly when a part is missing rather than assembling a corrupt message', () => {
    const assembler = new FrameAssembler();
    const frames = frameData(4, { pad: 'a'.repeat(300) }, 64);
    assembler.take(frames[0] as never);
    expect(() => assembler.take(frames[2] as never)).toThrow(/part 1 was next/);
  });
});

describe('isGessoFrame', () => {
  it('recognises the three frames and nothing else', () => {
    expect(isGessoFrame({ kind: 'open', stream: 1, name: 'catalogue' })).toBe(true);
    expect(isGessoFrame({ kind: 'data', stream: 1, body: '{}' })).toBe(true);
    expect(isGessoFrame({ kind: 'close', stream: 1 })).toBe(true);
    expect(isGessoFrame({ type: 'channel:patch' })).toBe(false);
    expect(isGessoFrame(null)).toBe(false);
  });
});
