import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Text } from 'gesso-core';
import { createShellHistory } from '../app/shellHistory';
import { route, to, type RouteDefinition } from './RouteDefinition';
import { RouterService } from './RouterService';

/**
 * A screen is a component, and every test here cares only about which
 * one the router picked, so one function stands in for all of them.
 */
const Screen = (): ReturnType<typeof Text> => Text({ text: 'screen' });

let signedIn = false;

const Home = route({ path: '/', component: Screen });
const Mail = route({ path: '/mail', component: Screen });
const MailItem = route({ path: '/mail/:folder/:id', component: Screen, parent: Mail });
const Settings = route({
  path: '/settings',
  component: Screen,
  guard: () => (signedIn ? true : to(SignIn))
});
const SignIn = route({ path: '/sign-in', component: Screen });
const Locked = route({ path: '/locked', component: Screen, guard: () => false });
const NotFound = route({ path: '/not-found', component: Screen });

const ROUTES: readonly RouteDefinition[] = [Home, Mail, MailItem, Settings, SignIn, Locked];

function history() {
  return {
    push: vi.fn<(url: string) => void>(),
    replace: vi.fn<(url: string) => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>()
  };
}

function router(): { router: RouterService; sink: ReturnType<typeof history> } {
  const sink = history();
  const service = new RouterService();
  service.setHistory(sink);
  service.setRoutes({ routes: ROUTES, notFound: NotFound });
  return { router: service, sink };
}

describe('RouterService', () => {
  beforeEach(() => {
    signedIn = false;
  });

  describe('declaring routes', () => {
    it('builds the chain from the parent pointers', () => {
      expect(MailItem.chain).toEqual([Mail, MailItem]);
      expect(Mail.chain).toEqual([Mail]);
    });

    it('refuses a child whose path does not extend its parent', () => {
      expect(() => route({ path: '/other/:id', component: Screen, parent: Mail })).toThrow(/does not extend it/);
    });

    it('refuses a child that only shares a string prefix', () => {
      expect(() => route({ path: '/mailbox', component: Screen, parent: Mail })).toThrow(/does not extend it/);
    });
  });

  describe('resolving', () => {
    it('matches a url to the first route that describes it, with its params', () => {
      const { router: service } = router();
      service.navigate('/mail/inbox/42');
      const match = service.match.value!;
      expect(match.route).toBe(MailItem);
      expect(match.params).toEqual({ folder: 'inbox', id: '42' });
      expect(match.chain).toEqual([Mail, MailItem]);
      expect(service.url.value).toBe('/mail/inbox/42');
    });

    it('carries the query alongside the params', () => {
      const { router: service } = router();
      service.navigate('/mail?unread=1');
      expect(service.match.value!.query).toEqual({ unread: '1' });
    });

    it('falls back to the notFound route, so an unknown url is still a screen', () => {
      const { router: service } = router();
      service.navigate('/nowhere');
      expect(service.match.value!.route).toBe(NotFound);
      expect(service.url.value).toBe('/nowhere');
    });

    it('resolves whatever url is current when routes arrive late', () => {
      const service = new RouterService();
      service.applyUrl('/mail/inbox/7');
      expect(service.match.value).toBeNull();
      service.setRoutes({ routes: ROUTES });
      expect(service.match.value!.route).toBe(MailItem);
    });
  });

  describe('typed navigation', () => {
    it('fills the path from the params', () => {
      const { router: service, sink } = router();
      service.go(MailItem, { folder: 'archive', id: '9' });
      expect(service.url.value).toBe('/mail/archive/9');
      expect(sink.push).toHaveBeenCalledWith('/mail/archive/9');
    });

    it('reads the current params back, typed, and only for a route in the chain', () => {
      const { router: service } = router();
      service.go(MailItem, { folder: 'inbox', id: '3' });
      expect(service.params(MailItem)).toEqual({ folder: 'inbox', id: '3' });
      // A layout is in the chain, so it sees the params too.
      expect(service.params(Mail)).toEqual({ folder: 'inbox', id: '3' });
      expect(service.params(Settings)).toBeNull();
    });

    it('reports a layout as active while any of its children shows', () => {
      const { router: service } = router();
      const active: boolean[] = [];
      service.isActive(Mail).subscribe(value => active.push(value));
      service.go(MailItem, { folder: 'inbox', id: '1' });
      service.navigate('/sign-in');
      expect(active).toEqual([false, true, false]);
    });
  });

  describe('history', () => {
    it('pushes what the app navigates to and replaces what it asks to replace', () => {
      const { router: service, sink } = router();
      service.navigate('/mail');
      service.navigate('/sign-in', { replace: true });
      expect(sink.push).toHaveBeenCalledWith('/mail');
      expect(sink.replace).toHaveBeenCalledWith('/sign-in');
    });

    it('writes nothing back for a url the shell itself reported', () => {
      const { router: service, sink } = router();
      service.applyUrl('/mail');
      expect(service.match.value!.route).toBe(Mail);
      expect(sink.push).not.toHaveBeenCalled();
      expect(sink.replace).not.toHaveBeenCalled();
    });

    it('hands back and forward to the shell, which owns the stack', () => {
      const { router: service, sink } = router();
      service.back();
      service.forward();
      expect(sink.back).toHaveBeenCalled();
      expect(sink.forward).toHaveBeenCalled();
    });
  });

  describe('guards', () => {
    it('redirects when the guard names somewhere else to be', () => {
      const { router: service } = router();
      service.navigate('/settings');
      expect(service.match.value!.route).toBe(SignIn);
      expect(service.url.value).toBe('/sign-in');
    });

    it('pushes a redirect of a navigation from inside the app', () => {
      const { router: service, sink } = router();
      service.navigate('/settings');
      // Pushed, not replaced. Nothing is written to the history until a
      // navigation settles, so the refused url was never an entry —
      // there is nothing to avoid leaving behind, and replacing would
      // overwrite the entry the person is standing on.
      expect(sink.push).toHaveBeenCalledWith('/sign-in');
      expect(sink.replace).not.toHaveBeenCalled();
    });

    it('replaces a redirect of a url the shell already committed to', () => {
      const { router: service, sink } = router();
      service.applyUrl('/settings');
      expect(service.match.value!.route).toBe(SignIn);
      // The address bar was already on the refused url before the guard
      // saw it, so it is corrected in place: Back must not land on a url
      // that will only be refused again.
      expect(sink.replace).toHaveBeenCalledWith('/sign-in');
      expect(sink.push).not.toHaveBeenCalled();
    });

    it('leaves Back on the screen the person was on when a guard redirects', () => {
      // The whole scenario, against a real history: the bug this pins
      // sent Back out of the app, because the redirect had overwritten
      // the entry Home was standing on.
      const history = createShellHistory({ mode: 'memory', initialUrl: '/' });
      const service = new RouterService();
      service.setHistory(history);
      history.onChange(url => service.applyUrl(url));
      service.setRoutes({ routes: ROUTES, notFound: NotFound });
      service.applyUrl(history.url);
      expect(service.match.value!.route).toBe(Home);

      service.go(Settings);
      expect(service.match.value!.route).toBe(SignIn);

      service.back();
      expect(service.match.value!.route).toBe(Home);
      expect(service.url.value).toBe('/');
    });

    it('lets the same url through once the guard is satisfied', () => {
      const { router: service } = router();
      signedIn = true;
      service.navigate('/settings');
      expect(service.match.value!.route).toBe(Settings);
    });

    it('leaves the app where it was when the guard simply refuses', () => {
      const { router: service } = router();
      service.navigate('/mail');
      service.navigate('/locked');
      expect(service.match.value!.route).toBe(Mail);
      expect(service.url.value).toBe('/mail');
    });

    it('corrects the address bar when the refused url came from it', () => {
      const { router: service, sink } = router();
      service.navigate('/mail');
      sink.replace.mockClear();
      service.applyUrl('/locked');
      expect(service.url.value).toBe('/mail');
      expect(sink.replace).toHaveBeenCalledWith('/mail');
    });

    it('runs a parent guard before its child, so a layout refuses for the whole branch', () => {
      const order: string[] = [];
      const layout = route({
        path: '/admin',
        component: Screen,
        guard: () => {
          order.push('layout');
          return true;
        }
      });
      const child = route({
        path: '/admin/users',
        component: Screen,
        parent: layout,
        guard: () => {
          order.push('child');
          return true;
        }
      });
      const service = new RouterService();
      service.setRoutes({ routes: [layout, child] });
      service.navigate('/admin/users');
      expect(order).toEqual(['layout', 'child']);
    });

    it('stops a redirect loop rather than hanging', () => {
      const ping: RouteDefinition = route({ path: '/ping', component: Screen, guard: () => to(pong) });
      const pong: RouteDefinition = route({ path: '/pong', component: Screen, guard: () => to(ping) });
      const service = new RouterService();
      service.setRoutes({ routes: [ping, pong] });
      expect(() => service.navigate('/ping')).toThrow(/redirected more than/);
    });
  });

  describe('emissions', () => {
    it('re-emits the match when the params change, so a screen can follow them', () => {
      const { router: service } = router();
      const seen: Array<Record<string, string> | null> = [];
      service.observeParams(MailItem).subscribe(params => seen.push(params));
      service.go(MailItem, { folder: 'inbox', id: '1' });
      service.go(MailItem, { folder: 'inbox', id: '2' });
      // The same params twice is not a change.
      service.go(MailItem, { folder: 'inbox', id: '2' });
      expect(seen).toEqual([null, { folder: 'inbox', id: '1' }, { folder: 'inbox', id: '2' }]);
    });
  });
});
