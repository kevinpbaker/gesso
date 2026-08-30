import { describe, expect, it } from 'vitest';

import { SourceMapStore } from './sourceMap';
import { formatFrame, mapStack, parseStack, primaryFrame, shortenPath } from './stackTrace';

/** A V8 stack, as a render worker throwing in a component writes it. */
const CHROME_STACK = [
  'Error: Cannot read properties of undefined (reading length)',
  '    at NoteRow.render (http://localhost:5173/src/examples/NotesExampleApp.tsx?t=17249:154:11)',
  '    at ComponentHost.build (http://localhost:5173/packages/framework/src/ComponentHost.ts:88:24)',
  '    at http://localhost:5173/packages/core/src/graph/UiGraph.ts:210:9',
  '    at new UiGraph (http://localhost:5173/packages/core/src/graph/UiGraph.ts:44:5)'
].join('\n');

describe('parseStack', () => {
  it('reads V8 frames, named, anonymous and constructor alike', () => {
    const frames = parseStack(CHROME_STACK);

    expect(frames).toHaveLength(4);
    expect(frames[0].fn).toBe('NoteRow.render');
    expect(frames[0].location).toEqual({
      url: 'http://localhost:5173/src/examples/NotesExampleApp.tsx?t=17249',
      line: 154,
      column: 11
    });
    expect(frames[2].fn).toBeNull();
    expect(frames[3].fn).toBe('new UiGraph');
  });

  it('drops the message lines above the frames, which the caller already has', () => {
    expect(parseStack(CHROME_STACK)[0].fn).toBe('NoteRow.render');
    expect(parseStack(CHROME_STACK).some(frame => frame.raw.startsWith('Error:'))).toBe(false);
  });

  it('reads the fn@url form Firefox and Safari write', () => {
    const frames = parseStack('render@http://host/src/App.tsx:154:11\n@http://host/src/main.ts:3:1');

    expect(frames[0]).toMatchObject({ fn: 'render', location: { url: 'http://host/src/App.tsx', line: 154 } });
    expect(frames[1].fn).toBeNull();
  });

  it('keeps a frame it cannot parse rather than dropping the evidence', () => {
    const frames = parseStack('Error: x\n    at foo (http://host/a.js:1:2)\n    at Array.map (<anonymous>)');

    expect(frames).toHaveLength(2);
    expect(frames[1]).toMatchObject({ location: null, raw: 'at Array.map (<anonymous>)' });
  });
});

describe('mapStack', () => {
  it('replaces compiled positions with the ones somebody wrote', async () => {
    const map = JSON.stringify({
      version: 3,
      sources: ['src/App.tsx'],
      // One mapping at the generated file's 1:1, pointing at the
      // 0-based 153:10 — which is the 154:11 a person would say.
      mappings: 'AAyJU'
    });
    const store = new SourceMapStore(async () => `//# sourceMappingURL=data:application/json;base64,${btoa(map)}`);

    const [frame] = await mapStack(parseStack('Error: x\n    at render (http://host/a.js:1:1)'), store);

    expect(frame.original).toEqual({ source: 'src/App.tsx', line: 154, column: 11 });
    expect(formatFrame(frame)).toBe('src/App.tsx:154:11');
  });

  it('leaves a frame alone when its script has no map', async () => {
    const store = new SourceMapStore(async () => 'code');

    const [frame] = await mapStack(parseStack('Error: x\n    at render (http://host/a.js:7:3)'), store);

    expect(frame.original).toBeNull();
    expect(formatFrame(frame, 'http://host')).toBe('/a.js:7:3');
  });
});

describe('primaryFrame', () => {
  it('skips the framework while any application frame is left', () => {
    const frames = parseStack(
      [
        'Error: x',
        '    at ComponentHost.build (http://host/packages/framework/src/ComponentHost.ts:88:24)',
        '    at NoteRow.render (http://host/src/NotesExampleApp.tsx:154:11)'
      ].join('\n')
    );

    // An error thrown from a component surfaces through several layers
    // of runtime, and the runtime is almost never the answer.
    expect(primaryFrame(frames)?.fn).toBe('NoteRow.render');
  });

  it('takes the first frame when every frame is the framework', () => {
    const frames = parseStack('Error: x\n    at build (http://host/packages/framework/src/ComponentHost.ts:88:24)');

    expect(primaryFrame(frames)?.fn).toBe('build');
  });

  it('has no answer for a stack with no locations', () => {
    expect(primaryFrame([])).toBeNull();
  });
});

describe('shortenPath', () => {
  it('drops the origin and the dev server’s cache-busting query', () => {
    expect(shortenPath('http://localhost:5173/src/App.tsx?t=1724965201', 'http://localhost:5173')).toBe('/src/App.tsx');
  });

  it('collapses node_modules to the package that owns the file', () => {
    expect(shortenPath('http://host/node_modules/@gesso/core/dist/index.js', 'http://host')).toBe(
      '@gesso/core/dist/index.js'
    );
  });

  it('leaves a path from another origin whole', () => {
    expect(shortenPath('http://other/a.js', 'http://host')).toBe('http://other/a.js');
  });
});
