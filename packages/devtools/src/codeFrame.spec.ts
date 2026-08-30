import { describe, expect, it } from 'vitest';

import { codeFrame } from './codeFrame';

const SOURCE = ['const notes = [];', 'function first() {', '  return notes[0].title;', '}', ''].join('\n');

describe('codeFrame', () => {
  it('quotes the line the error was on, with context either side', () => {
    const frame = codeFrame(SOURCE, 3, 18);

    expect(frame?.lines.map(line => line.number)).toEqual([1, 2, 3, 4, 5]);
    expect(frame?.lines.find(line => line.target)?.text).toBe('  return notes[0].title;');
  });

  it('clamps the context to the file', () => {
    expect(codeFrame(SOURCE, 1, 1)?.lines.map(line => line.number)).toEqual([1, 2, 3]);
  });

  it('moves the caret column to where the tabs put the character', () => {
    // The line is rendered with tabs expanded, so a column counted in
    // source characters would point at the wrong one.
    const frame = codeFrame('\t\treturn x.y;', 1, 10);

    expect(frame?.lines[0].text).toBe('    return x.y;');
    expect(frame?.column).toBe(12);
  });

  it('has no answer for a line outside the file', () => {
    expect(codeFrame(SOURCE, 99, 1)).toBeNull();
  });
});
