import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShellService, type ShellRequest } from './ShellService';
import { redirectTarget, redirectWith, type RedirectLocation } from './shellRedirect';

/**
 * `ShellService.redirect` replaces the page, so what these pin is the
 * one thing that could make that dangerous: a url that is not a place
 * to go. `location.assign('javascript:…')` runs script in the page
 * rather than leaving it, and the shell is the last thing between a
 * url a component built from data and that call.
 */
describe('ShellService.redirect', () => {
  it('asks the shell to replace the page, with the url as given', () => {
    const service = new ShellService();
    const requests: ShellRequest[] = [];
    service.setHandler(request => requests.push(request));

    service.redirect('/api/auth/login');

    expect(requests).toEqual([{ type: 'redirect', url: '/api/auth/login' }]);
  });

  it('does nothing when no shell is listening', () => {
    // A headless runtime has no page to replace; there is no answer
    // to settle, so nothing is owed.
    expect(() => new ShellService().redirect('/api/auth/logout')).not.toThrow();
  });
});

describe('redirectTarget', () => {
  const page = 'https://app.example.test/settings?tab=account';

  it('resolves a relative url against the page', () => {
    expect(redirectTarget('/api/auth/login', page)).toBe('https://app.example.test/api/auth/login');
    expect(redirectTarget('logout', page)).toBe('https://app.example.test/logout');
  });

  it('follows an absolute http or https url to another origin', () => {
    expect(redirectTarget('https://id.example.test/authorize?client=1', page)).toBe(
      'https://id.example.test/authorize?client=1'
    );
    expect(redirectTarget('http://localhost:5173/', page)).toBe('http://localhost:5173/');
  });

  it('refuses a javascript url, however it is spelled', () => {
    expect(redirectTarget('javascript:alert(1)', page)).toBeNull();
    expect(redirectTarget('JavaScript:alert(1)', page)).toBeNull();
    expect(redirectTarget(' javascript:alert(1)', page)).toBeNull();
    expect(redirectTarget('java\tscript:alert(1)', page)).toBeNull();
  });

  it('refuses the other schemes that are not a place to go', () => {
    expect(redirectTarget('data:text/html,<script>alert(1)</script>', page)).toBeNull();
    expect(redirectTarget('blob:https://app.example.test/1', page)).toBeNull();
    expect(redirectTarget('file:///etc/passwd', page)).toBeNull();
    expect(redirectTarget('mailto:someone@example.test', page)).toBeNull();
  });

  it("admits the page's own scheme, for a window that is not served over http", () => {
    // An Electrobun window loads from `views://`, and a relative url
    // there is the bundled app's own.
    expect(redirectTarget('/index.html', 'views://mainview/index.html')).toBe('views://mainview/index.html');
  });

  it("does not let a page's own data: scheme admit a data url", () => {
    expect(redirectTarget('data:text/html,hi', 'data:text/html,page')).toBeNull();
  });

  it('refuses what does not parse', () => {
    expect(redirectTarget('https://[bad', page)).toBeNull();
    expect(redirectTarget('/x', 'not a url')).toBeNull();
  });
});

describe('redirectWith', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const fakeLocation = (href: string): RedirectLocation & { assigned: string[] } => {
    const assigned: string[] = [];
    return { href, assigned, assign: url => assigned.push(url) };
  };

  it('replaces the page when nothing else will', () => {
    const location = fakeLocation('https://app.example.test/');

    expect(redirectWith(undefined, '/api/auth/logout', location)).toBe(true);

    expect(location.assigned).toEqual(['https://app.example.test/api/auth/logout']);
  });

  it('hands the resolved url to the host when it has a handler, and leaves the page alone', () => {
    const location = fakeLocation('https://app.example.test/');
    const handled: string[] = [];

    redirectWith(url => handled.push(url), '/api/auth/login', location);

    expect(handled).toEqual(['https://app.example.test/api/auth/login']);
    expect(location.assigned).toEqual([]);
  });

  it('refuses a javascript url before the handler or the page sees it, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const location = fakeLocation('https://app.example.test/');
    const handled: string[] = [];

    expect(redirectWith(url => handled.push(url), 'javascript:alert(1)', location)).toBe(false);
    expect(redirectWith(undefined, 'javascript:alert(1)', location)).toBe(false);

    expect(handled).toEqual([]);
    expect(location.assigned).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
