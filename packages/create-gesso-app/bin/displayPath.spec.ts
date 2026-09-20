import { describe, expect, it } from 'vitest';

import { displayPath } from './displayPath.ts';

describe('displayPath', () => {
  it('keeps the whole name of a sibling whose name extends this one', () => {
    // The bug this exists for: a string `startsWith` treated
    // /work/gessosheet as though it sat inside /work/gesso and printed
    // "heet".
    expect(displayPath('/work/gesso', '/work/gessosheet')).toBe('../gessosheet');
  });

  it('says a child relatively, as the caller typed it', () => {
    expect(displayPath('/work/gesso', '/work/gesso/my-app')).toBe('my-app');
  });

  it('says a nested child relatively', () => {
    expect(displayPath('/work/gesso', '/work/gesso/apps/my-app')).toBe('apps/my-app');
  });

  it('prefers the absolute path when climbing out costs more than saying it', () => {
    expect(displayPath('/home/someone/work/gesso', '/tmp/scratch')).toBe('/tmp/scratch');
  });

  it('falls back to the target when it is the directory itself', () => {
    expect(displayPath('/work/gesso', '/work/gesso')).toBe('/work/gesso');
  });
});
