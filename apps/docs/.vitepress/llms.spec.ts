import { describe, expect, it } from 'vitest';

import {
  collectPages,
  extractRegion,
  llmsIndex,
  llmsSections,
  pageMarkdown,
  resolvePath,
  SECTION_LIMIT,
  SITE,
  sourceOf,
  splitFrontMatter
} from './llms';
import config from './config';

const srcDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** Reads a file the way the spec's own bundler does, so the spec needs no Node types. */
const readRaw = async (path: string): Promise<string> =>
  ((await import(/* @vite-ignore */ `${path}?raw`)) as { default: string }).default;

describe('the llms.txt pages', () => {
  it('reads the description out of front matter, quoted or not', () => {
    expect(splitFrontMatter('---\ndescription: Plain words.\n---\n# T\n')).toEqual({
      description: 'Plain words.',
      body: '# T\n'
    });
    expect(splitFrontMatter("---\ndescription: 'engine.explain: it''s why'\n---\nbody").description).toBe(
      "engine.explain: it's why"
    );
  });

  it('cuts a region the way VitePress does, dropping nested markers and dedenting', () => {
    const code = [
      'x',
      '  // #region outer',
      '  a',
      '  // #region inner',
      '    b',
      '  // #endregion inner',
      '  // #endregion outer'
    ];
    expect(extractRegion(code.join('\n'), 'outer')).toBe('a\n  b');
    expect(extractRegion(code.join('\n'), 'missing')).toBeNull();
  });

  it('expands snippets, drops live canvases, and leaves fenced code alone', async () => {
    const files: Record<string, string> = {
      [`${srcDir}/src/A.tsx`]: 'skip\n// #region one\nconst a = 1;\n// #endregion one\n'
    };
    const body = [
      '# Page',
      '',
      '<LiveExample id="a" height="200" />',
      '',
      '<<< @/src/A.tsx#one',
      '',
      'See [the guide](/guide/counter).',
      '',
      '```tsx',
      '<Button label="kept" />',
      '```'
    ].join('\n');
    const markdown = await pageMarkdown(body, srcDir, async path => files[path]);

    expect(markdown).not.toContain('LiveExample');
    expect(markdown).toContain('```tsx\nconst a = 1;\n```');
    expect(markdown).toContain(`[the guide](${SITE}/guide/counter)`);
    expect(markdown).toContain('<Button label="kept" />');
  });

  it('says which region is missing rather than quoting nothing', async () => {
    await expect(pageMarkdown('<<< @/src/A.ts#gone', srcDir, async () => 'no regions')).rejects.toThrow(
      'src/A.ts has no region named gone'
    );
  });

  it('resolves a path that climbs out of the site', () => {
    expect(resolvePath('/a/docs', '../playground/x.ts')).toBe('/a/playground/x.ts');
    expect(resolvePath('/a/docs', './src/y.ts')).toBe('/a/docs/src/y.ts');
  });

  it('maps a section index to its index.md', () => {
    expect(sourceOf('/components/')).toBe('components/index.md');
    expect(sourceOf('/guide/counter')).toBe('guide/counter.md');
  });

  it('builds from the real sidebar, every page with its code and its description', async () => {
    const pages = await collectPages(config.themeConfig!.sidebar as never, srcDir, readRaw);
    const counter = pages.find(page => page.link === '/guide/counter')!;

    expect(pages.length).toBeGreaterThan(80);
    expect(pages.every(page => page.description !== '')).toBe(true);
    expect(counter.markdown).toContain('internalState(0)');
    expect(pages.some(page => page.markdown.includes('<<<'))).toBe(false);

    const index = llmsIndex(pages);
    expect(index).toContain(`- [Your first component](${SITE}/guide/counter.md): `);
    expect(index).toContain('## Components');

    // Every section a file a model can hold, the guide first, and every page in one of them.
    const sections = llmsSections(pages);
    expect(sections[0]!.fileName).toBe('llms-guide.txt');
    expect(sections.every(section => section.text.length <= SECTION_LIMIT + 50_000)).toBe(true);
    expect(sections.reduce((n, section) => n + section.text.split('\n<!-- https://').length - 1, 0)).toBe(pages.length);
    expect(index).toContain(`## Whole sections\n\n- [Guide](${SITE}/llms-guide.txt): about `);
  });

  it('splits a section larger than the limit between pages, into numbered parts', () => {
    const page = (n: number, section: string) => ({
      section,
      title: `Page ${n}`,
      link: `/x/${n}`,
      description: '',
      markdown: 'x'.repeat(40) + '\n'
    });
    const sections = llmsSections([page(1, 'Guide'), page(2, 'Big'), page(3, 'Big'), page(4, 'Big')], 200);

    expect(sections.map(section => [section.fileName, section.title])).toEqual([
      ['llms-guide.txt', 'Guide'],
      ['llms-big-1.txt', 'Big, part 1 of 2'],
      ['llms-big-2.txt', 'Big, part 2 of 2']
    ]);
    expect(sections[1]!.text).toContain(`<!-- ${SITE}/x/2 -->`);
    expect(sections[1]!.text).toContain(`<!-- ${SITE}/x/3 -->`);
    expect(sections[2]!.text).toContain(`<!-- ${SITE}/x/4 -->`);
  });
});
