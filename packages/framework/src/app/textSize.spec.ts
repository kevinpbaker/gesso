import { describe, expect, it } from 'vitest';

import { browserTextScale, observeTextScale } from './textSize';

/** A document whose `medium` resolves to `size`, and a window that can fire focus. */
function host(size: () => string) {
  const listeners = new Map<string, () => void>();
  const body = { appendChild: () => {} };
  const doc = {
    body,
    visibilityState: 'visible',
    createElement: () => ({ style: { cssText: '' }, remove: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {}
  } as unknown as Document;
  const view = {
    document: doc,
    getComputedStyle: () => ({ fontSize: size() }),
    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type)
  } as unknown as Window & typeof globalThis;
  (doc as unknown as { defaultView: unknown }).defaultView = view;
  return { doc, view, fire: (type: string) => listeners.get(type)?.() };
}

describe('browserTextScale', () => {
  it('is the size `medium` resolves to, over 16', () => {
    expect(browserTextScale(host(() => '20px').doc)).toBe(1.25);
    expect(browserTextScale(host(() => '16px').doc)).toBe(1);
  });

  it('is 1 where there is no document to ask', () => {
    expect(browserTextScale(undefined)).toBe(1);
  });
});

describe('observeTextScale', () => {
  it('reports at once, and again only when the window comes back with a different size', () => {
    let size = '16px';
    const { view, fire } = host(() => size);
    const seen: number[] = [];
    observeTextScale(scale => seen.push(scale), view);
    fire('focus');
    size = '24px';
    fire('focus');
    expect(seen).toEqual([1, 1.5]);
  });
});
