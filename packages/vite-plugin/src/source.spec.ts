import { describe, expect, it } from 'vitest';

import { blankLiterals, findCall, findCalls, firstArgumentName, importSources } from './source';

describe('blankLiterals', () => {
  it('keeps the length and the lines', () => {
    const code = "const a = 'one';\n// two\nconst b = `three`;\n";
    const blank = blankLiterals(code);
    expect(blank).toHaveLength(code.length);
    expect(blank.split('\n')).toHaveLength(code.split('\n').length);
  });

  it('blanks a string but keeps its quotes, so a specifier can still be found', () => {
    expect(blankLiterals("from '@gesso/framework';")).toBe("from '                ';");
  });

  it('hides a brace inside a string from a bracket match', () => {
    const code = "createApp({ label: ')' });";
    const call = findCall(code, 'createApp')!;
    expect(code.slice(call.argsStart, call.argsEnd)).toBe("{ label: ')' }");
  });

  it('blanks a line comment and a block comment', () => {
    expect(blankLiterals('a; // x\nb;').trim().split('\n')[0].trim()).toBe('a;');
    expect(blankLiterals('a; /* createApp( */ b;')).not.toContain('createApp');
  });

  it('treats a regular expression as a literal but division as division', () => {
    expect(blankLiterals('const r = /[\'"]/;\n')).not.toContain("'");
    // `a / b` and `c / d`: the slash is division, so nothing between
    // them is blanked and the identifiers survive.
    expect(blankLiterals('const x = a / b + c / d;')).toContain('b + c');
  });
});

describe('findCalls', () => {
  it('finds a call and its argument range', () => {
    const code = 'renderRoot(App).useRoutes(ROUTES);';
    const call = findCall(code, 'renderRoot')!;
    expect(code.slice(call.argsStart, call.argsEnd)).toBe('App');
    expect(code.slice(call.start, call.end)).toBe('renderRoot(App)');
  });

  it('ignores a name that is part of another name or a property', () => {
    expect(findCalls('myRenderRoot(A); thing.renderRoot(B);', 'renderRoot')).toHaveLength(0);
  });

  it('matches the closing bracket across nesting', () => {
    const code = 'createApp({ history: { mode: (1 + 2) } });';
    const call = findCall(code, 'createApp')!;
    expect(code.slice(call.argsStart, call.argsEnd)).toBe('{ history: { mode: (1 + 2) } }');
  });

  it('finds every call, in source order', () => {
    const sites = findCalls('renderRoot(App).useService(A).useService(B);', '.useService');
    expect(sites).toHaveLength(2);
  });
});

describe('firstArgumentName', () => {
  it('is the identifier when the argument is one', () => {
    const code = 'renderRoot(SegueApp);';
    expect(firstArgumentName(code, findCall(code, 'renderRoot')!)).toBe('SegueApp');
  });

  it('is null for anything more complicated', () => {
    for (const code of ['renderRoot(<App />);', 'renderRoot(make());', 'renderRoot();']) {
      expect(firstArgumentName(code, findCall(code, 'renderRoot')!)).toBeNull();
    }
  });

  it('ignores the arguments after the first', () => {
    const code = 'renderRoot(App, { extra: true });';
    expect(firstArgumentName(code, findCall(code, 'renderRoot')!)).toBe('App');
  });
});

describe('importSources', () => {
  it('maps named, aliased, default and namespace imports', () => {
    const code = [
      "import { renderRoot } from '@gesso/framework';",
      "import { ROUTES, SegueApp as Root } from './SegueApp';",
      "import Feed from './Feed';",
      "import * as data from './data/Contract';"
    ].join('\n');
    const sources = importSources(code);
    expect(sources.get('renderRoot')).toBe('@gesso/framework');
    expect(sources.get('ROUTES')).toBe('./SegueApp');
    expect(sources.get('Root')).toBe('./SegueApp');
    expect(sources.get('Feed')).toBe('./Feed');
    expect(sources.get('data')).toBe('./data/Contract');
  });

  it('reads a multi-line import clause', () => {
    const code = "import {\n  createApp,\n  type RendererChoice\n} from '@gesso/framework';";
    expect(importSources(code).get('createApp')).toBe('@gesso/framework');
  });

  it('is not fooled by the word import inside a comment or a string', () => {
    const code = "// import { createApp } from 'nowhere';\nconst s = \"import { x } from 'nope'\";";
    expect(importSources(code).size).toBe(0);
  });
});
