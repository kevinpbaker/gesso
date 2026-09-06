import { afterEach, describe, expect, it, vi } from 'vitest';

import { isStill, STILL, STILL_EPOCH, stillNow, workerName } from './still';

/**
 * A documentation page: a `document`, so the flag is read from the url
 * rather than from a worker's name.
 *
 * Only the two properties the module touches, because a fuller fake
 * would be a claim about what else it reads.
 */
function page(search: string): void {
  vi.stubGlobal('document', {});
  vi.stubGlobal('location', { search });
}

/** A render worker: no `document`, and a name whoever spawned it chose. */
function worker(name: string | undefined): void {
  vi.stubGlobal('document', undefined);
  vi.stubGlobal('self', name === undefined ? {} : { name });
}

afterEach(() => vi.unstubAllGlobals());

/**
 * The flag is one word read in two places, and the two have to agree:
 * a page that thinks it is still while the worker painting its example
 * does not is exactly the screenshot the gate cannot use.
 *
 * The node environment these specs run in has no `document` and no
 * `self`, which is the worker reading with nobody naming it, so the
 * page cases stub both globals in and the worker cases stub only
 * `self`.
 */
describe('still mode', () => {
  it('reads the flag off the page url', () => {
    page('?still');
    expect(isStill()).toBe(true);
  });

  it('takes the bare flag and an assigned one alike, since presence is the whole question', () => {
    page('?renderer=webgpu&still=1');
    expect(isStill()).toBe(true);
  });

  it('is off for an ordinary reader', () => {
    page('');
    expect(isStill()).toBe(false);
    page('?renderer=webgpu');
    expect(isStill()).toBe(false);
  });

  it('is off rather than throwing where a page has no readable address', () => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('location', {
      get search(): string {
        throw new Error('no location here');
      }
    });
    expect(isStill()).toBe(false);
  });

  it('reads its own name in a worker, which has no url to read', () => {
    worker(STILL);
    expect(isStill()).toBe(true);
  });

  it('is off in a worker nobody named', () => {
    worker(undefined);
    expect(isStill()).toBe(false);
    worker('example');
    expect(isStill()).toBe(false);
  });

  it('hands a worker the name that makes it read the same as the page it was spawned from', () => {
    page('?still');
    const name = workerName();

    worker(name);
    expect(isStill()).toBe(true);
  });

  it('names nothing when the page is not still, so an ordinary worker keeps the default name', () => {
    page('');
    expect(workerName()).toBeUndefined();
  });

  it('freezes the clock at one instant, and otherwise leaves it alone', () => {
    page('?still');
    expect(stillNow()).toBe(STILL_EPOCH);

    const before = Date.now();
    page('');
    expect(stillNow()).toBeGreaterThanOrEqual(before);
  });
});
