import { map } from 'rxjs/operators';

import { percent, type UiChild } from '@gesso/core';
import { createComponent, ShellService, type ComponentContext, type Inputs } from '@gesso/framework';

import { brandDarkTheme, brandLightTheme } from './brandTheme';

// #region theme
/**
 * The root every live example on this site is mounted inside.
 *
 * A canvas inherits nothing from the page: no stylesheet reaches it, so
 * an example that sets no colours would paint the default theme's black
 * text whatever appearance the page is in, which is invisible against a
 * dark one. This is the eight lines that fix that for every example at once,
 * and it is also the shape an application uses.
 *
 * `theme` is an environment value: provided here, inherited by
 * everything below, and, because it is an ordinary prop that accepts an
 * Observable, rebound rather than rebuilt when the appearance changes.
 * `lightTheme` and `darkTheme` ship with `@gesso/core`; this site maps
 * the signal onto a palette of its own instead, which is what any
 * application with a brand does. See `brandTheme.ts`.
 *
 * `textStyle` has to go with it. A theme's palette answers a colour
 * *token*, as in `backgroundColor="surface"`, but text that names no colour
 * at all takes it from the type scale in the environment, not from the
 * theme, so a root that provides only `theme` leaves every unstyled
 * line painting the default black.
 */
function ExampleRoot(inputs: Inputs<{ content: UiChild }>, ctx: ComponentContext) {
  const theme = ctx
    .inject(ShellService)
    .colorScheme.pipe(map(scheme => (scheme === 'dark' ? brandDarkTheme : brandLightTheme)));

  return (
    <box
      theme={theme}
      textStyle={theme.pipe(map(value => value.typography.body))}
      backgroundColor="background"
      width={percent(100)}
      height={percent(100)}>
      {inputs.content}
    </box>
  );
}
// #endregion theme

/** Wraps an example in the themed root, for a worker to render. */
export const exampleRoot = (content: UiChild) => createComponent(ExampleRoot, { content });
