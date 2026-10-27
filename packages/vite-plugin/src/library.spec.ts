import { describe, expect, it } from 'vitest';

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
