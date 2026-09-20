import type { Subject } from 'rxjs';

import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import { themeExtension, type UiThemeExtension } from '../environment/UiThemeExtension';
import { defineModifier, type UiModifier } from './UiModifier';

/**
 * What the modifier needs: which group to read, and where to put it.
 *
 * A plain object, so `sameArgs` compares it structurally and the same
 * extension with the same sink is the same argument. The sink is a
 * class instance and the extension's `equals` is a function, so both
 * compare by identity, which is what makes a cell built once per
 * component instance stable for that instance's life.
 */
export interface ThemeTokenTarget<T extends object> {
  readonly extension: UiThemeExtension<T>;
  readonly sink: Subject<T>;
}

/**
 * Publishes a theme extension's tokens into a cell, and keeps
 * publishing them as the theme above the element changes.
 *
 * This is the answer to the thing `Button`'s docstring has said all
 * along: a component's body runs once, before its node is
 * in a tree, so it cannot read the environment and anything it
 * computes from the theme is frozen at the default. A colour escapes
 * that by being a name resolved at paint, and a radius now does too
 * — but a padding, a gap, a variant's choice of
 * token and an interaction's opacity have nowhere to be resolved late.
 *
 * A modifier does have the environment, so it reads the group there
 * and feeds a cell the component already bound its properties to. The
 * shape is `measure` and `ctx.bounds()`: a cell, and the modifier that
 * fills it.
 *
 *   const tokens = themeTokenCell(controlTokens);
 *   Box({ modifiers: [tokens.modifier], paddingX: tokens.select(t => t.pad) });
 *
 * The cell is seeded with the extension's declared defaults, so the
 * first read is a real value rather than an empty one, and attach
 * replaces it with whatever the element actually inherits before the
 * first frame is drawn.
 *
 * Unlike `host.set`, this reaches a *child*: the cell is an ordinary
 * Observable, so a component may bind its label's colour to it as
 * easily as its own padding. That matters because most controls are a
 * box with something inside it, and `color` does not cascade from a
 * parent node the way it would in CSS.
 */
const themeTokensKind = defineModifier<ThemeTokenTarget<object>>({
  name: 'themeTokens',
  attach(host, target) {
    const publish = (): void => {
      target.sink.next(themeExtension(host.environment(UiEnvironmentKeys.theme), target.extension));
    };
    publish();
    host.onEnvironment(publish);
  }
});

export function themeTokens<T extends object>(target: ThemeTokenTarget<T>): UiModifier<ThemeTokenTarget<T>> {
  // The kind is declared over `object` because a modifier kind is one
  // value for every use of it, and an extension's `equals` takes `T`
  // in argument position, so `UiThemeExtension<ControlTokens>` is not
  // assignable to `UiThemeExtension<object>`. The cast is sound in the
  // only direction that runs: `attach` reads the sink and the
  // extension and hands one to the other, never mixing two groups.
  return themeTokensKind(target as unknown as ThemeTokenTarget<object>) as unknown as UiModifier<ThemeTokenTarget<T>>;
}

/** The kind itself, for a test or an inspector that matches on it. */
themeTokens.kind = themeTokensKind.kind;
