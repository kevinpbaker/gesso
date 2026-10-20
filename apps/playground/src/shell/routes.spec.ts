import { describe, expect, it } from 'vitest';

import { allViews, findView, redirectFor, REDIRECTS, ROUTES } from './routes';

describe('playground routes', () => {
  it('resolves a route with modes to its first mode when none is named', () => {
    expect(findView('#renderers')?.id).toBe('renderers/dom');
    expect(findView('#renderers/compare')?.id).toBe('renderers/compare');
    expect(findView('#renderers/nonsense')?.id).toBe('renderers/dom');
    expect(findView('#framework')?.id).toBe('framework/worker');
  });

  it('leaves the rest of the fragment to a route without modes', () => {
    expect(findView('#example-router/mail/inbox/2')?.id).toBe('example-router');
    expect(findView('#workbench/button')?.id).toBe('workbench');
    expect(redirectFor('#workbench/button')).toBeUndefined();
  });

  it('names no view for a hash that names no route', () => {
    expect(findView('#nowhere')).toBeUndefined();
    expect(findView('')).toBeUndefined();
  });

  it('titles a view by its mode', () => {
    expect(findView('renderers/webgpu')?.title).toBe('WebGPU renderer');
  });

  it('lists every mode as a view of its own', () => {
    const ids = allViews().map(view => view.id);
    expect(ids).toContain('renderers/canvas');
    expect(ids).toContain('framework/main-thread');
    expect(ids).not.toContain('renderers');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('redirects every retired hash to a view that exists', () => {
    for (const [from, to] of Object.entries(REDIRECTS)) {
      expect(
        ROUTES.find(route => route.id === from),
        `${from} is still a route`
      ).toBeUndefined();
      expect(findView(to)?.id, `${from} → ${to}`).toBe(to);
    }
    expect(redirectFor('#compare')).toBe('#renderers/compare');
    expect(redirectFor('#renderers/compare')).toBeUndefined();
  });

  it('keeps the nav to the pages worth browsing', () => {
    const nav = ROUTES.filter(route => route.parent === undefined && route.hidden !== true).map(route => route.id);
    expect(nav).toEqual(['workbench', 'examples', 'renderers']);
  });
});
