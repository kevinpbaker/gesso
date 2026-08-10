import type { Observable } from 'rxjs';

/**
 * Properties supplied to a declarative UI element.
 *
 * A property may be:
 * - a plain value
 * - an RxJS Observable
 *
 * Observable values are converted into UiGraph bindings
 * by UiGraphBuilder.
 */
export type UiPropValue = unknown | Observable<unknown>;

export type UiProps = Record<string, UiPropValue>;
