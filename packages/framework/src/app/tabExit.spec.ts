import { describe, expect, it } from 'vitest';

import { tabbableBeside } from './tabExit';

/**
 * Where Tab goes when it leaves an embedded app: the control beside the
 * host in document order, skipping what a page's Tab skips. The DOM is
 * a double that knows document order and nothing else, which is all
 * the function asks of it.
 */
interface FakeElement {
  name: string;
  order: number;
  tabIndex: number;
  inHost?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  getClientRects(): { length: number };
}

function element(name: string, order: number, extra: Partial<FakeElement> = {}): FakeElement {
  const made: FakeElement = {
    name,
    order,
    tabIndex: 0,
    ...extra,
    getClientRects: () => ({ length: made.hidden === true ? 0 : 1 })
  };
  return made;
}

function page(elements: FakeElement[], hostOrder: number): { host: Element; doc: Document } {
  const host = {
    contains: (other: FakeElement) => other.inHost === true,
    compareDocumentPosition: (other: FakeElement) => (other.order > hostOrder ? 4 : 2)
  } as unknown as Element;
  const doc = { querySelectorAll: () => elements } as unknown as Document;
  return { host, doc };
}

const nameOf = (found: HTMLElement | null): string | null => (found as unknown as FakeElement | null)?.name ?? null;

describe('tabbableBeside', () => {
  const elements = [
    element('search', 1),
    element('skipped', 2, { tabIndex: -1 }),
    element('back', 3),
    element('canvas', 5, { inHost: true }),
    element('off', 6, { disabled: true }),
    element('gone', 7, { hidden: true }),
    element('save', 8),
    element('help', 9)
  ];

  it('goes to the first control after the host going forward', () => {
    const { host, doc } = page(elements, 4);

    expect(nameOf(tabbableBeside(host, 1, doc))).toBe('save');
  });

  it('goes to the last control before the host going back', () => {
    const { host, doc } = page(elements, 4);

    expect(nameOf(tabbableBeside(host, -1, doc))).toBe('back');
  });

  it('finds nothing past the end of the page, so the browser takes the next Tab', () => {
    const { host, doc } = page([element('search', 1)], 4);

    expect(tabbableBeside(host, 1, doc)).toBeNull();
    expect(nameOf(tabbableBeside(host, -1, doc))).toBe('search');
  });
});
