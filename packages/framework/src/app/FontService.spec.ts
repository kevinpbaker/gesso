import { afterEach, describe, expect, it } from 'vitest';
import { clearFontStacks, fontStackFor } from 'gesso-core';

import { FontService, type FontFaceLike, type FontHost } from './FontService';

/** A font set that remembers what was added, with faces whose loads the test settles. */
function fakeHost(): FontHost & { added: FontFaceLike[]; settle: (family: string, ok?: boolean) => void } {
  const added: FontFaceLike[] = [];
  const settlers = new Map<string, Array<(ok: boolean) => void>>();
  return {
    added,
    fonts: { add: face => added.push(face) },
    createFace: family => ({
      family,
      load: () =>
        new Promise((resolve, reject) => {
          const list = settlers.get(family) ?? [];
          list.push(ok => (ok ? resolve(undefined) : reject(new Error('no such font'))));
          settlers.set(family, list);
        })
    }),
    settle: (family, ok = true) => {
      for (const settle of settlers.get(family) ?? []) {
        settle(ok);
      }
      settlers.set(family, []);
    }
  };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('FontService', () => {
  afterEach(() => {
    clearFontStacks();
  });

  it('registers the fallback stack at declaration, before anything loads', () => {
    const service = new FontService();
    service.declare(
      [{ family: 'Inter', faces: [{ source: 'https://x/inter.woff2' }], fallback: ['system-ui'] }],
      fakeHost()
    );
    expect(fontStackFor('Inter')).toBe('Inter, system-ui');
    expect(service.statusOf('Inter')).toBe('loading');
  });

  it('adds a face per declaration to the font set and reports the family loaded once all settle', async () => {
    const service = new FontService();
    const host = fakeHost();
    const changes: string[] = [];
    service.setListener(family => changes.push(family));
    service.declare(
      [
        {
          family: 'Inter',
          faces: [
            { source: 'https://x/inter-400.woff2', weight: 400 },
            { source: 'https://x/inter-700.woff2', weight: 700 }
          ]
        }
      ],
      host
    );
    expect(host.added).toHaveLength(2);
    host.settle('Inter');
    await service.ready;
    expect(service.statusOf('Inter')).toBe('loaded');
    expect(changes).toEqual(['Inter', 'Inter']);
  });

  it('reports error when a face fails and still settles', async () => {
    const service = new FontService();
    const host = fakeHost();
    service.declare([{ family: 'Broken', faces: [{ source: 'https://x/missing.woff2' }] }], host);
    host.settle('Broken', false);
    await service.ready;
    expect(service.statusOf('Broken')).toBe('error');
  });

  it('is unavailable, but still registers the stack, on a thread without a font set', () => {
    const service = new FontService();
    service.declare([{ family: 'Inter', faces: [{ source: 'https://x/inter.woff2' }] }], {
      fonts: undefined,
      createFace: () => {
        throw new Error('should not be called');
      }
    });
    expect(service.statusOf('Inter')).toBe('unavailable');
    expect(fontStackFor('Inter')).toBe('Inter, sans-serif');
    expect(service.statusOf('Other')).toBe('undeclared');
  });

  it('reuses one face for the same URL across services on a thread', () => {
    const host = fakeHost();
    const a = new FontService();
    const b = new FontService();
    const source = `https://x/shared-${Math.random()}.woff2`;
    a.declare([{ family: 'Shared', faces: [{ source }] }], host);
    b.declare([{ family: 'Shared', faces: [{ source }] }], host);
    expect(host.added[0]).toBe(host.added[1]);
  });

  it('stops notifying after dispose', async () => {
    const service = new FontService();
    const host = fakeHost();
    const changes: string[] = [];
    service.setListener(family => changes.push(family));
    service.declare([{ family: 'Late', faces: [{ source: 'https://x/late.woff2' }] }], host);
    service.dispose();
    host.settle('Late');
    await service.ready;
    await tick();
    expect(changes).toEqual([]);
  });
});
