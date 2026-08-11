import { BehaviorSubject } from 'rxjs';

import { Box, Column, Row, Text } from '../ui/composition';
import type { UiElement, UiProps } from '../ui/composition';
import { darkTheme, lightTheme, type UiTheme } from '../ui/environment/UiTheme';

/**
 * Reactive state for the theme playground.
 */
export class ThemePlaygroundState {
  readonly theme$ = new BehaviorSubject<UiTheme>(lightTheme);
  readonly headline$ = new BehaviorSubject('Theme Playground');
  readonly body$ = new BehaviorSubject(
    'This card inherits its text color and style from the scoped theme environment. Toggle the theme to see reactive inheritance flow through the UI graph.'
  );
}

/**
 * Builds a small scene that exercises property inheritance and
 * renderer-independent value types.
 */
export function createThemeDefinition(state: ThemePlaygroundState): UiElement {
  const theme = state.theme$.getValue();
  const rootProps: UiProps = {
    theme: state.theme$,
    padding: 32,
    gap: 16,
    width: 480,
    height: 320,
    backgroundColor: '#f8fafc'
  };

  return Column(
    rootProps,
    Text({
      text: state.headline$,
      fontSize: 24,
      fontWeight: 700,
      color: theme.colors.primary
    }),
    Row(
      { gap: 12, selfX: 'stretch' },
      Box({
        width: 80,
        height: 80,
        borderRadius: theme.shapes.large,
        backgroundColor: theme.colors.primary,
        boxShadows: theme.shadows.medium
      }),
      Box({
        width: 80,
        height: 80,
        borderRadius: theme.shapes.large,
        backgroundColor: theme.colors.secondary,
        boxShadows: theme.shadows.large
      }),
      Box({
        flexGrow: 1,
        height: 80,
        borderRadius: theme.shapes.medium,
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderWidth: 1
      })
    ),
    Column(
      {
        gap: 8,
        padding: 16,
        selfX: 'stretch',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.shapes.medium,
        boxShadows: theme.shadows.small
      },
      Text({ text: state.body$, fontSize: 14, lineHeight: 20 }),
      Text({
        text: 'This line inherits color from the theme via the environment.',
        fontSize: 12
      })
    )
  );
}

export function toggleTheme(state: ThemePlaygroundState): void {
  const current = state.theme$.getValue();
  state.theme$.next(current === lightTheme ? darkTheme : lightTheme);
}
