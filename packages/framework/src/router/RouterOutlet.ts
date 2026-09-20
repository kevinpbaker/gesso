import { distinctUntilChanged, map, type Observable } from 'rxjs';

import type { MotionStateInput, MotionTiming, UiChild } from 'gesso-core';
import { Component } from '../Component';
import { createComponent } from '../createComponent';
import { Define, Inject, Input } from '../decorators';
import { input, InputCell } from '../Input';
import { Presence } from '../Presence';
import type { RouteDefinition } from './RouteDefinition';
import { RouterService, type RouteMatch } from './RouterService';

/**
 * How one screen gives way to the next.
 *
 * Every field is optional and the default is nothing at all, so an
 * outlet with no `transition` swaps screens on the frame the url
 * changes, exactly as it did before this existed. A shared-element
 * morph needs no entry here: `sharedElement` pairs elements by name
 * across whatever tree change is happening, and a route change is one.
 *
 * **Do not combine `enter`/`exit` with shared elements.** A screen's
 * opacity multiplies onto everything inside it, morphing elements
 * included — so during a cross-fade the departing copy has already
 * handed over and the arriving one is at a fraction of its opacity,
 * and for those frames neither is on screen and whatever is behind
 * them shows through. It is very visible, and it is not a bug that can
 * be fixed here: a browser's View Transitions API only composes the
 * two because it lifts its named elements out of the page snapshot
 * into layers of their own, which is a whole architecture rather than
 * a flag.
 *
 * So they are alternatives. Either the screens cross-fade — right when
 * nothing is shared and the two are simply different — or the shared
 * elements carry the change, in which case they *are* the transition
 * and the screens should swap under them. `example-transitions` is the
 * second kind and passes no transition at all.
 */
export interface RouteTransition {
  /** Where the arriving screen starts. */
  enter?: MotionStateInput;
  /** Where the departing screen goes. */
  exit?: MotionStateInput;
  /**
   * `together` (the default) — the screens overlap while they cross.
   * Required for a shared element, which is measured off the departing
   * screen while it is still standing there.
   *
   * `wait` — the departing screen finishes leaving first.
   */
  mode?: 'together' | 'wait';
  timing?: MotionTiming;
}

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
 *
 * **Transitions.** Given a `transition`, the chain is rendered through
 * `Presence`, which keeps the departing screen mounted until its exit
 * animation is over. That is the only reason a screen transition needs
 * anything from the router at all — the animation itself is
 * `gesso-core`'s `motion`, and a shared-element morph across the
 * change is `sharedElement`, which the outlet knows nothing about.
 */
@Define('gesso-router-outlet')
export class RouterOutlet extends Component {
  @Inject(RouterService) router!: RouterService;
  @Input() transition = input<RouteTransition | undefined>(undefined);

  override render(): UiChild {
    const chain = this.router.match.pipe(
      map(match => chainOf(match)),
      distinctUntilChanged(sameChain),
      map(routes => buildChain(routes))
    );
    return withTransition(chain, this.transition);
  }
}

/**
 * Wraps the chain in a `Presence` when a transition is asked for, and
 * hands it back untouched when one is not.
 *
 * Untouched rather than "a Presence with no enter and no exit",
 * because the two are not the same thing: `Presence` positions its
 * children absolutely inside a container that fills its parent, and an
 * app that never asked for a transition should not have its layout
 * changed by an outlet that decided to add one.
 *
 * The transition is read once, here, rather than followed. `render()`
 * runs exactly once per instance and this decides the *shape* of what
 * it returns; an outlet is configured when it is placed, the same way
 * an `Image`'s source is, and an outlet whose transition should change
 * gets a `key`.
 */
function withTransition(
  chain: Observable<readonly UiChild[]>,
  transition: InputCell<RouteTransition | undefined>
): UiChild {
  const settings = transition.value;
  if (settings === undefined) {
    return chain as Observable<UiChild | readonly UiChild[]> as unknown as UiChild;
  }
  return createComponent(Presence, {
    children: chain as unknown as UiChild | readonly UiChild[],
    enter: settings.enter,
    exit: settings.exit,
    mode: settings.mode,
    timing: settings.timing
  }) as unknown as UiChild;
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
 * The key is also what `Presence` identifies a departing screen by,
 * which is why a route change that keeps the same outermost route
 * — walking from one message to the next — is not a transition at all.
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
