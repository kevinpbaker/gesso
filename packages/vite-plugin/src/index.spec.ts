import { describe, expect, it } from 'vitest';

import { gesso } from './index.ts';

/** The plugin's `config` hook, called the way Vite calls it. */
function configOf(plugin: ReturnType<typeof gesso>): unknown {
  const hook = plugin.config as unknown as (config: object, env: object) => unknown;
  return hook({}, { command: 'serve', mode: 'development' });
}

describe('the conditions dependencies resolve with', () => {
  it("prefers a dependency's worker build to its browser one", () => {
    // decode-named-character-reference's browser build reaches for
    // `document`, and a render worker that imported a markdown parser
    // died on start. Its worker build is listed first.
    const conditions = (configOf(gesso()) as { resolve: { conditions: string[] } }).resolve.conditions;
    expect(conditions[0]).toBe('worker');
    expect(conditions).toContain('browser');
  });

  it('leaves them alone when asked to', () => {
    expect((configOf(gesso({ workerConditions: false })) as { resolve?: unknown }).resolve).toBeUndefined();
  });
});

describe('the format workers are built in', () => {
  it('is ES modules, so a worker can load a chunk on demand', () => {
    // Vite's default is IIFE, which cannot split: a dynamic import in
    // the render worker was inlined into it.
    expect((configOf(gesso()) as { worker: { format: string } }).worker.format).toBe('es');
  });

  it("is the application's when it chose one", () => {
    const hook = gesso().config as unknown as (config: object, env: object) => { worker?: unknown };
    expect(hook({ worker: { format: 'iife' } }, { command: 'build', mode: 'production' }).worker).toBeUndefined();
  });
});
