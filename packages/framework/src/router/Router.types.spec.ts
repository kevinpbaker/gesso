import { describe, expect, expectTypeOf, it } from 'vitest';

import { Text } from '@gesso/core';
import { route, to } from './RouteDefinition';
import type { RouteParams } from './RoutePath';
import { RouterService } from './RouterService';

/**
 * The params of a route are its path, read by the compiler.
 *
 * As in `createComponent.types.spec`, the `@ts-expect-error` lines are
 * compile-time assertions: `tsc` fails if any of them stops being an
 * error, which is what keeps typed routing from quietly becoming
 * stringly-typed routing.
 */
const Screen = (): ReturnType<typeof Text> => Text({ text: 'screen' });

const Home = route({ path: '/', component: Screen });
const MailItem = route({ path: '/mail/:folder/:id', component: Screen });

/**
 * The calls that must not compile.
 *
 * In a function nothing calls: `@ts-expect-error` is checked by `tsc`
 * whether or not the line runs, and every one of these would throw at
 * runtime for the very reason the compiler rejects it.
 */
function rejected(router: RouterService): void {
  // @ts-expect-error 'id' is missing
  router.go(MailItem, { folder: 'inbox' });
  // @ts-expect-error 'folder' is not spelled 'floder'
  router.go(MailItem, { floder: 'inbox', id: '1' });
  // @ts-expect-error a param is a url segment, so a string
  router.go(MailItem, { folder: 'inbox', id: 1 });
  // @ts-expect-error a route with no params takes none; only options
  router.go(Home, { id: '1' });
  // @ts-expect-error and `to` refuses them for the same reason
  to(Home, { id: '1' });
  // @ts-expect-error 'id' is missing here too
  to(MailItem, { folder: 'inbox' });
}

describe('route types', () => {
  it('rejects the calls that should not compile', () => {
    expect(typeof rejected).toBe('function');
  });

  it('derives the params from the path', () => {
    expectTypeOf<RouteParams<'/mail/:folder/:id'>>().toEqualTypeOf<{ folder: string; id: string }>();
    expectTypeOf<RouteParams<'/settings'>>().toEqualTypeOf<{}>();
    expectTypeOf<RouteParams<'/files/*'>>().toEqualTypeOf<{ rest: string }>();
  });

  it('checks the params a navigation supplies', () => {
    const router = new RouterService();
    router.setRoutes({ routes: [Home, MailItem] });

    router.go(MailItem, { folder: 'inbox', id: '1' });
    router.go(Home);
    expect(router.url.value).toBe('/');
  });

  it('checks the params a redirect supplies', () => {
    expect(to(MailItem, { folder: 'inbox', id: '1' }).params).toEqual({ folder: 'inbox', id: '1' });
  });

  it('types the params a guard is given', () => {
    route({
      path: '/mail/:id',
      component: Screen,
      guard: context => {
        expectTypeOf(context.params).toEqualTypeOf<{ id: string }>();
        return true;
      }
    });
  });

  it('types what reading the current params gives back', () => {
    const router = new RouterService();
    expectTypeOf(router.params(MailItem)).toEqualTypeOf<{ folder: string; id: string } | null>();
    expect(router.params(MailItem)).toBeNull();
  });
});
