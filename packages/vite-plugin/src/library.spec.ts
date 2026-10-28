import { describe, expect, it } from 'vitest';

import { ComponentCatalog } from './catalog.ts';
import { ContractReader, type TypeScriptApi } from './contracts.ts';

import { openCatalog, watchCatalog, type CatalogFs } from './library.ts';

/**
 * The catalog outside a dev server: opened on a real project on disk,
 * as a desktop application's main process opens it, and kept current
 * by a watcher instead of Vite.
 */

const components = new URL('../../components', import.meta.url).pathname.replace(/\/$/, '');

describe('openCatalog', () => {
  it("reads a project's components from disk and answers as agent tools", async () => {
    const catalog = await openCatalog({ root: components });
    expect(catalog).not.toBeNull();
    try {
      const overview = await catalog!.call('library_overview', {});
      const badge = await catalog!.call('library_get', { name: 'Badge' });

      expect(catalog!.tools().map(tool => tool.name)).toEqual(['library_overview', 'library_search', 'library_get']);
      expect(catalog!.instructions).toContain('library_overview');
      expect(overview.content[0]!.text).toMatch(/^\d+ components in this project\./);
      expect(overview.content[0]!.text).toContain('  Badge: A badge: a count or a short status marker');
      expect(badge.content[0]!.text).toContain('Badge, from src/Badge');
    } finally {
      catalog!.dispose();
    }
  });
});

describe('a project whose own tsconfig goes while the catalog is open', () => {
  it('reads it through the catalog’s tsconfig, and keeps answering once the project’s own is deleted', async () => {
    // The plugin has no Node types of its own: the few file calls this needs, by shape.
    const { mkdirSync, rmSync, writeFileSync } = (await import('node:fs' as string)) as {
      mkdirSync(path: string, options: { recursive: boolean }): void;
      rmSync(path: string, options?: { recursive: boolean; force: boolean }): void;
      writeFileSync(path: string, text: string): void;
    };
    // Inside the components package, so `gesso-framework` resolves as it would in a project.
    const folder = `${components}/.catalog-spec-${Date.now().toString(36)}`;
    const project = `${folder}/project`;
    mkdirSync(project, { recursive: true });
    const base = '../../../../tsconfig.base.json';
    writeFileSync(`${project}/tsconfig.json`, JSON.stringify({ extends: base, include: ['.'] }));
    writeFileSync(
      `${folder}/catalog.json`,
      JSON.stringify({ extends: '../../../tsconfig.base.json', include: ['project'] })
    );
    writeFileSync(
      `${project}/Card.tsx`,
      "import type { Inputs } from 'gesso-framework';\nimport type { UiChild } from 'gesso-core';\n\n/** Card: a title over its words. */\nexport function Card(inputs: Inputs<{ title: string }>): UiChild {\n  return <text text={inputs.title} />;\n}\n"
    );
    const ts = (await import('typescript/unstable/sync')) as TypeScriptApi;
    const reader = new ContractReader(ts, project);
    const catalog = new ComponentCatalog(async () => reader, project, { tsconfig: `${folder}/catalog.json` });
    try {
      const before = await catalog.call('library_get', { name: 'Card' });
      expect(before.content[0]!.text).toContain('title');

      // The project's own tsconfig, which the checker had seen, goes.
      rmSync(`${project}/tsconfig.json`);
      reader.invalidate(`${project}/tsconfig.json`, 'delete');
      catalog.invalidate();

      const after = await catalog.call('library_get', { name: 'Card' });
      expect(after.content[0]!.text).toContain('title');
    } finally {
      reader.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('watchCatalog', () => {
  /** An `fs` whose watcher is fired by hand, with the files that exist named. */
  function fakeFs(existing: readonly string[]) {
    let fire: ((event: string, filename: string | null) => void) | undefined;
    let closed = false;
    const fs: CatalogFs = {
      watch: (_path, options, listener) => {
        expect(options.recursive).toBe(true);
        fire = listener;
        return { close: () => (closed = true) };
      },
      existsSync: path => existing.includes(path)
    };
    return { fs, fire: (event: string, filename: string | null) => fire!(event, filename), closed: () => closed };
  }

  it('tells the reader what kind of change each was, and the catalog to read again', () => {
    const { fs, fire, closed } = fakeFs(['/app/src/New.tsx']);
    const told: [string, string][] = [];
    let invalidated = 0;
    const stop = watchCatalog(
      fs,
      '/app',
      { invalidate: (file, event = 'update') => told.push([file, event]) },
      { invalidate: () => invalidated++ }
    );

    fire('change', 'src/Old.tsx');
    fire('rename', 'src/New.tsx');
    fire('rename', 'src/Gone.tsx');
    fire('change', 'node_modules/pkg/index.js');
    fire('change', null);
    stop();

    expect(told).toEqual([
      ['/app/src/Old.tsx', 'update'],
      ['/app/src/New.tsx', 'create'],
      ['/app/src/Gone.tsx', 'delete']
    ]);
    expect(invalidated).toBe(3);
    expect(closed()).toBe(true);
  });
});
