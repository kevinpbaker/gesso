import { describe, expect, it } from 'vitest';

import {
  decodeMappings,
  parseSourceMappingUrl,
  SourceMapConsumer,
  SourceMapStore,
  type SourceMapV3
} from './sourceMap';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * A VLQ *encoder*, written independently of the decoder under test.
 *
 * Hand-written `mappings` strings are unreadable and easy to write
 * wrong in the same way the decoder is wrong, which would make the
 * suite agree with the bug. Encoding from absolute positions also lets
 * each case below say what it means.
 */
function vlq(value: number): string {
  let rest = value < 0 ? (-value << 1) | 1 : value << 1;
  let out = '';
  do {
    let digit = rest & 31;
    rest >>>= 5;
    if (rest > 0) {
      digit |= 32;
    }
    out += BASE64[digit];
  } while (rest > 0);
  return out;
}

/** Absolute segments per generated line → a `mappings` string. */
function encodeMappings(lines: number[][][]): string {
  let sourceIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  return lines
    .map(segments => {
      let generatedColumn = 0;
      return segments
        .map(([column, source, line, sourceCol]) => {
          const encoded =
            vlq(column - generatedColumn) +
            vlq(source - sourceIndex) +
            vlq(line - sourceLine) +
            vlq(sourceCol - sourceColumn);
          generatedColumn = column;
          sourceIndex = source;
          sourceLine = line;
          sourceColumn = sourceCol;
          return encoded;
        })
        .join(',');
    })
    .join(';');
}

function mapOf(lines: number[][][], overrides: Partial<SourceMapV3> = {}): SourceMapV3 {
  return {
    version: 3,
    sources: ['src/App.ts'],
    mappings: encodeMappings(lines),
    ...overrides
  };
}

describe('decodeMappings', () => {
  it('decodes the smallest possible mapping', () => {
    expect(decodeMappings('AAAA')).toEqual([[[0, 0, 0, 0]]]);
  });

  it('accumulates deltas across segments and lines', () => {
    const lines = [
      [
        [0, 0, 0, 0],
        [12, 0, 0, 8]
      ],
      [[4, 0, 3, 2]]
    ];
    expect(decodeMappings(encodeMappings(lines))).toEqual(lines);
  });

  it('carries values wider than five bits, and negative ones', () => {
    // A minified bundle puts everything on one line, so generated
    // columns run into the tens of thousands; a source position moving
    // backwards is what a hoisted helper looks like.
    const lines = [
      [
        [0, 0, 400, 0],
        [65_536, 0, 12, 4000]
      ]
    ];
    expect(decodeMappings(encodeMappings(lines))).toEqual(lines);
  });

  it('drops one-field segments, which name no original position', () => {
    expect(decodeMappings('AAAA,C')).toEqual([[[0, 0, 0, 0]]]);
  });

  it('keeps empty lines, so line numbers stay aligned', () => {
    expect(decodeMappings('AAAA;;AACA')).toEqual([[[0, 0, 0, 0]], [], [[0, 0, 1, 0]]]);
  });

  it('stops at the first character that is not base64 rather than throwing', () => {
    // This runs inside an error reporter. A corrupt map costs the
    // frames after the corruption, not the report.
    expect(decodeMappings('AAAA;%%%')).toEqual([[[0, 0, 0, 0]]]);
  });
});

describe('SourceMapConsumer', () => {
  const consumer = new SourceMapConsumer(
    mapOf([
      [
        [0, 0, 9, 0],
        [20, 0, 9, 14]
      ]
    ])
  );

  it('answers in the 1-based coordinates a stack is written in', () => {
    expect(consumer.lookup(1, 1)).toEqual({ source: 'src/App.ts', line: 10, column: 1, content: null });
  });

  it('holds a mapping until the next one starts', () => {
    expect(consumer.lookup(1, 15)).toEqual({ source: 'src/App.ts', line: 10, column: 1, content: null });
    expect(consumer.lookup(1, 21)).toEqual({ source: 'src/App.ts', line: 10, column: 15, content: null });
  });

  it('has no answer for a line with no mappings', () => {
    expect(consumer.lookup(4, 1)).toBeNull();
  });

  it('applies sourceRoot to source names', () => {
    const rooted = new SourceMapConsumer(mapOf([[[0, 0, 0, 0]]], { sourceRoot: '/project' }));
    expect(rooted.lookup(1, 1)?.source).toBe('/project/src/App.ts');
  });

  it('returns the inlined original text', () => {
    const withContent = new SourceMapConsumer(mapOf([[[0, 0, 0, 0]]], { sourcesContent: ['const a = 1;\n'] }));
    expect(withContent.contentFor('src/App.ts')).toBe('const a = 1;\n');
    expect(withContent.contentFor('src/Other.ts')).toBeNull();
  });
});

describe('parseSourceMappingUrl', () => {
  it('reads the comment a bundler writes last', () => {
    const script = 'const a = 1;\n//# sourceMappingURL=app.js.map\n';
    expect(parseSourceMappingUrl(script)).toBe('app.js.map');
  });

  it('takes the last one, which is the one the engine takes', () => {
    const script = '//# sourceMappingURL=stale.map\ncode\n//# sourceMappingURL=fresh.map';
    expect(parseSourceMappingUrl(script)).toBe('fresh.map');
  });

  it('has no answer for a script without one', () => {
    expect(parseSourceMappingUrl('const a = 1;\n')).toBeNull();
  });
});

describe('SourceMapStore', () => {
  const map = JSON.stringify(mapOf([[[0, 0, 41, 4]]], { sourcesContent: ['x\n'] }));

  it('reads a map inlined as a base64 data url, which is what a dev server serves', async () => {
    const inline = `//# sourceMappingURL=data:application/json;base64,${btoa(map)}`;
    const store = new SourceMapStore(async () => `code\n${inline}`);

    const consumer = await store.consumerFor('http://host/src/App.ts');

    expect(consumer?.lookup(1, 1)).toEqual({ source: 'src/App.ts', line: 42, column: 5, content: 'x\n' });
  });

  it('fetches a map named relative to its script', async () => {
    const requested: string[] = [];
    const store = new SourceMapStore(async url => {
      requested.push(url);
      return url.endsWith('.map') ? map : 'code\n//# sourceMappingURL=app.js.map';
    });

    expect(await store.consumerFor('http://host/build/app.js')).not.toBeNull();
    expect(requested).toEqual(['http://host/build/app.js', 'http://host/build/app.js.map']);
  });

  it('fetches each script once however many frames name it', async () => {
    let loads = 0;
    const store = new SourceMapStore(async () => {
      loads++;
      return `//# sourceMappingURL=data:application/json;base64,${btoa(map)}`;
    });

    await Promise.all([store.consumerFor('http://host/a.js'), store.consumerFor('http://host/a.js')]);
    await store.consumerFor('http://host/a.js');

    expect(loads).toBe(1);
  });

  it('answers null rather than throwing when there is no map to be had', async () => {
    // The overlay is already reporting a failure; a failure to explain
    // it must not become a second one.
    const missing = new SourceMapStore(async () => 'code with no comment');
    const unreachable = new SourceMapStore(async () => {
      throw new Error('404');
    });
    const corrupt = new SourceMapStore(async () => '//# sourceMappingURL=data:application/json;base64,bm90IGpzb24=');

    expect(await missing.consumerFor('http://host/a.js')).toBeNull();
    expect(await unreachable.consumerFor('http://host/a.js')).toBeNull();
    expect(await corrupt.consumerFor('http://host/a.js')).toBeNull();
  });
});
