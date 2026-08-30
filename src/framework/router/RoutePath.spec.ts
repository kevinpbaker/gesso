import { describe, expect, it } from 'vitest';

import { buildPath, formatUrl, matchPattern, parsePattern, parseUrl, pathSegments } from './RoutePath';

describe('RoutePath', () => {
  describe('parsePattern', () => {
    it('reads static, param and rest segments', () => {
      expect(parsePattern('/mail/:folder/:id')).toEqual([
        { kind: 'static', text: 'mail' },
        { kind: 'param', name: 'folder' },
        { kind: 'param', name: 'id' }
      ]);
      expect(parsePattern('/files/*')).toEqual([{ kind: 'static', text: 'files' }, { kind: 'rest' }]);
    });

    it('treats leading, trailing and doubled slashes as one path', () => {
      expect(pathSegments('//mail//inbox/')).toEqual(['mail', 'inbox']);
    });

    it('rejects a rest that is not last, and an unnamed param', () => {
      expect(() => parsePattern('/files/*/name')).toThrow(/only end a pattern/);
      expect(() => parsePattern('/mail/:')).toThrow(/unnamed/);
    });
  });

  describe('matchPattern', () => {
    const mailItem = parsePattern('/mail/:folder/:id');

    it('captures params when every segment lines up', () => {
      expect(matchPattern(mailItem, pathSegments('/mail/inbox/42'))).toEqual({ folder: 'inbox', id: '42' });
    });

    it('requires an exact length, so a longer path is a different route', () => {
      expect(matchPattern(mailItem, pathSegments('/mail/inbox'))).toBeNull();
      expect(matchPattern(mailItem, pathSegments('/mail/inbox/42/reply'))).toBeNull();
    });

    it('does not match a different static segment', () => {
      expect(matchPattern(parsePattern('/mail'), pathSegments('/mailbox'))).toBeNull();
    });

    it('decodes a param, so a url-encoded id arrives as it was written', () => {
      expect(matchPattern(parsePattern('/tag/:name'), pathSegments('/tag/two%20words'))).toEqual({
        name: 'two words'
      });
    });

    it('gives a rest everything left, including nothing', () => {
      const files = parsePattern('/files/*');
      expect(matchPattern(files, pathSegments('/files/a/b/c'))).toEqual({ rest: 'a/b/c' });
      expect(matchPattern(files, pathSegments('/files'))).toEqual({ rest: '' });
    });
  });

  describe('buildPath', () => {
    it('is the inverse of matching', () => {
      expect(buildPath('/mail/:folder/:id', { folder: 'inbox', id: '42' })).toBe('/mail/inbox/42');
    });

    it('encodes a param that would otherwise change the path', () => {
      expect(buildPath('/tag/:name', { name: 'a/b' })).toBe('/tag/a%2Fb');
    });

    it('names the param it was not given', () => {
      expect(() => buildPath('/mail/:id')).toThrow(/needs a 'id' param/);
    });
  });

  describe('urls', () => {
    it('splits path from query and decodes both', () => {
      expect(parseUrl('/search?q=two+words&page=2')).toEqual({
        path: '/search',
        query: { q: 'two words', page: '2' }
      });
    });

    it('drops a fragment, which belongs to the shell rather than the router', () => {
      expect(parseUrl('/mail/1#anchor').path).toBe('/mail/1');
    });

    it('round-trips through formatUrl', () => {
      const { path, query } = parseUrl('/search?q=gesso');
      expect(formatUrl(path, query)).toBe('/search?q=gesso');
    });

    it('normalizes an empty path to the root', () => {
      expect(formatUrl('')).toBe('/');
      expect(parseUrl('').path).toBe('/');
    });
  });
});
