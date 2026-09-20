import { distinctUntilChanged, map, type Observable } from 'rxjs';

import { themeTokens, type UiModifier, type UiThemeExtension } from 'gesso-core';
import { InternalState } from './InternalState';

/**
 * A theme extension's tokens, as a cell, with the modifier that fills
 * it.
 *
 * The same shape as `ctx.bounds()`, and for the same reason: the value
 * lives on a node and a component body has no node yet, so the cell is
 * the value and the modifier is how it gets filled.
 *
 *   const tokens = themeTokenCell(controlTokens);
 *   return Button(
 *     {
 *       modifiers: [tokens.modifier, ...],
 *       paddingX: tokens.select(t => t.button.medium.paddingX),
 *       borderRadius: tokens.select(t => t.button.medium.radius)
 *     },
 *     Text({ text: label, color: tokens.select(t => t.button.filled.foreground) })
 *   );
 *
 * It starts holding the extension's declared defaults, which is the
 * honest value for a node that is not in a tree: it is what
 * `themeExtension` would answer for a theme carrying nothing. The
 * modifier replaces it at attach, before the first frame is drawn, so
 * a component that is never restyled draws its defaults and never
 * flickers through them.
 *
 * Bind with `select`, not with `value`. The cell publishes a whole
 * group, so every binding taken straight off it would recompute when
 * any token in the group changed; `select` projects one token and
 * drops a repeat, which is what keeps a theme change that moved a
 * colour from re-writing every padding on the element.
 */
export class ThemeTokenCell<T extends object> extends InternalState<T> {
  /** Put this on the element whose inherited theme the cell should read. */
  readonly modifier: UiModifier;

  constructor(extension: UiThemeExtension<T>) {
    super(extension.defaults);
    this.modifier = themeTokens<T>({ extension, sink: this });
  }

  /** One token, as an Observable that drops a repeat. */
  select<R>(pick: (tokens: T) => R): Observable<R> {
    return this.pipe(map(pick), distinctUntilChanged());
  }
}

/**
 * A token cell outside a component, for a class component or a test.
 * Inside a function component this is the same thing, and it completes
 * with the component.
 */
export function themeTokenCell<T extends object>(extension: UiThemeExtension<T>, label?: string): ThemeTokenCell<T> {
  const cell = new ThemeTokenCell(extension);
  if (label !== undefined) {
    cell.label = label;
  }
  return cell;
}
