import { internalState, type InternalState } from '../InternalState';
import type { RouteDefinition } from './RouteDefinition';

/**
 * What a route remembers while its screen is not there.
 *
 * A screen is built when its route matches and destroyed when it stops
 * matching, so everything a screen keeps in its body goes with it: the
 * scroll offset of the list, which row the keyboard was on, the text in
 * the filter field. Coming back lands at the top of the list, which is
 * the wrong place, and it also breaks a shared element, because a morph
 * is measured from where the element is *seen* and a list at the top is
 * not where it was left.
 *
 * Both applications solved this by putting those cells in module scope,
 * with the same comment on each explaining why (`decisions/0079`). This
 * is that store, with an owner. What it buys over a module:
 *
 *   - **A lifetime that is stated.** A cell here lives as long as the
 *     router does and is dropped by `forget`, rather than as long as the
 *     module registry, which is until the tab closes.
 *   - **One store per runtime.** A module's cells are shared by every
 *     runtime in the process, which two windows of the same desktop app
 *     and two tests in the same file both are.
 *   - **Names that cannot collide.** A key is scoped to a route, so two
 *     screens may both remember `scroll` and mean different lists.
 *
 * It is a facility and not an architecture. The framework does not own
 * an application's data (`decisions/0030`): anything that matters after
 * a reload, or that another part of the application acts on, is still
 * application state on a channel. What belongs here is the small,
 * screen-shaped remainder that only exists to put a screen back where it
 * was.
 */
export class RouteState {
  /**
   * `null` is the router's own scope: what belongs to the navigation
   * rather than to one screen. A `Map` keyed on the route object needs
   * no ids and no path strings, and a route that is redeclared is a
   * different route.
   */
  private readonly byRoute = new Map<RouteDefinition | null, Map<string, InternalState<unknown>>>();

  /**
   * The cell a route keeps under `key`, created with `initial` the first
   * time it is asked for and handed back unchanged afterwards.
   *
   * `initial` is therefore read once. A screen built a second time gets
   * the value the first one left, which is the whole point.
   */
  cell<T>(route: RouteDefinition | null, key: string, initial: T): InternalState<T> {
    let keys = this.byRoute.get(route);
    if (keys === undefined) {
      keys = new Map<string, InternalState<unknown>>();
      this.byRoute.set(route, keys);
    }
    const held = keys.get(key);
    if (held !== undefined) {
      return held as InternalState<T>;
    }
    const cell = internalState(initial, `${route === null ? 'router' : route.path}.${key}`);
    keys.set(key, cell as InternalState<unknown>);
    return cell;
  }

  /** Whether a route has remembered anything under this key yet. */
  has(route: RouteDefinition | null, key: string): boolean {
    return this.byRoute.get(route)?.has(key) ?? false;
  }

  /**
   * Drops everything a route remembered, so the next screen starts as
   * the first one did: signing out, or a list whose contents are no
   * longer the ones the offset was measured against.
   */
  forget(route: RouteDefinition | null): void {
    this.byRoute.delete(route);
  }

  /** Drops every route's memory. */
  clear(): void {
    this.byRoute.clear();
  }
}
