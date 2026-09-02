import { describe, expect, it, vi } from 'vitest';

import { createShellHistory } from '@gesso/framework';

import { embeddedAppOptions } from './embeddedApp';

/**
 * Just enough window for a shell history to run against: the address
 * of the documentation page an example is embedded in, and a
 * `pushState` that records rather than navigates.
 *
 * Same shape as the fake in `shellHistory`'s own spec, because the
 * question here is the same one: what a history built from these
 * options does to the window it is handed.
 */
function docsPage(pathname = '/structure/routing') {
  const pushed: string[] = [];
  const replaced: string[] = [];
  return {
    location: { pathname, search: '', hash: '' },
    history: {
      pushState: (_data: unknown, _title: string, url: string) => pushed.push(url),
      replaceState: (_data: unknown, _title: string, url: string) => replaced.push(url),
      back: vi.fn(),
      forward: vi.fn()
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    pushed,
    replaced
  };
}

function historyFor(page: ReturnType<typeof docsPage>) {
  const example = {
    renderWorker: () => ({}) as unknown as Worker,
    colorScheme: 'light' as const,
    onError: () => {}
  };
  return createShellHistory(embeddedAppOptions(example).history, page);
}

/**
 * A live example runs inside a page whose address bar belongs to
 * VitePress. The shell's default is `path`, so an example with routes
 * would be told the page's own url at start-up and would push the site
 * to a new address on every navigation. The harness is what stops
 * that, for every example, whoever writes it.
 */
describe('the live example harness', () => {
  it('starts a routed example at its own root, not at the page it is embedded in', () => {
    expect(historyFor(docsPage()).url).toBe('/');
  });

  it('navigates without touching the address bar of the page around it', () => {
    const page = docsPage();
    const history = historyFor(page);

    history.push('/notes/wrapping');
    history.replace('/notes/baselines');

    expect(history.url).toBe('/notes/baselines');
    expect(page.pushed).toEqual([]);
    expect(page.replaced).toEqual([]);
  });

  it('walks a back stack of its own rather than the reader browsing history', () => {
    const page = docsPage();
    const history = historyFor(page);
    const seen: string[] = [];
    history.onChange(url => seen.push(url));

    history.push('/notes/wrapping');
    history.push('/notes/baselines');
    history.back();

    expect(seen).toEqual(['/notes/wrapping']);
    expect(page.history.back).not.toHaveBeenCalled();
  });
});
