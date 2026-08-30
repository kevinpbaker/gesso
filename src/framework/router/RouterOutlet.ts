import { distinctUntilChanged, map, type Observable } from 'rxjs';

import type { UiChild } from '../../ui/composition/UiElement';
import { Component } from '../Component';
import { createComponent } from '../createComponent';
import { Define, Inject } from '../decorators';
import type { RouteDefinition } from './RouteDefinition';
import { RouterService, type RouteMatch } from './RouterService';

/**
 * Where the current route's screen appears.
 *
 * This is `FRAMEWORK_DESIGN.md` §7.6 made real, and it is the one
 * component in the framework whose `render()` returns an Observable:
 * a route change is a structural change, not a change to a prop, and
 * observable render is the mechanism that exists for exactly that.
 *
 *   Column(header(), createComponent(RouterOutlet))
 *
 * It cannot be the app root — a root definition may not be an
 * Observable, since the layout root needs a box — so it goes inside
 * whatever the root renders, which is where an app wants it anyway.
 *
 * **Nesting.** The outlet renders the whole matched chain, not just
 * the leaf: a route with a `parent` is built inside its parent's
 * screen, which receives it as an `outlet` prop (`OutletProps`) and
 * places it wherever it belongs. So there is one `RouterOutlet` in an
 * app; depth comes from the routes, not from where outlets are
 * scattered. That also means a layout screen is mounted once and stays
 * mounted while its children come and go — its sidebar keeps its
 * scroll position, and its state survives.
 *
 * A navigation that changes only params re-emits nothing at all: the
 * chain is the same objects, so the screens stay mounted and read the
 * new params from `router.observeParams(route)`.
 */
@Define('gesso-router-outlet')
export class RouterOutlet extends Component {
  @Inject(RouterService) router!: RouterService;

  override render(): UiChild {
    return this.router.match.pipe(
      map(match => chainOf(match)),
      distinctUntilChanged(sameChain),
      map(chain => buildChain(chain))
    ) as Observable<UiChild | readonly UiChild[]>;
  }
}

function chainOf(match: RouteMatch | null): readonly RouteDefinition[] {
  return match === null ? [] : match.chain;
}

/**
 * Builds the chain from the inside out, each screen becoming the
 * `outlet` of the one above it.
 *
 * Keyed by path so reconciliation keeps a layout's host when only the
 * leaf below it changed: same component, same key, same slot, so the
 * host is reused and only its `outlet` input is pushed a new value.
 */
function buildChain(chain: readonly RouteDefinition[]): readonly UiChild[] {
  if (chain.length === 0) {
    return [];
  }
  // The leaf's own outlet: an empty list, which an observable child
  // reconciles to no children at all. It is what lets a screen place
  // `props.outlet` unconditionally, whether or not anything nests in
  // it on this url.
  let outlet = EMPTY_OUTLET;
  for (let index = chain.length - 1; index >= 0; index--) {
    const route = chain[index]!;
    outlet = createComponent(route.component as never, { outlet } as never, route.path);
  }
  return [outlet];
}

const EMPTY_OUTLET = [] as unknown as UiChild;

function sameChain(a: readonly RouteDefinition[], b: readonly RouteDefinition[]): boolean {
  return a.length === b.length && a.every((route, index) => route === b[index]);
}
