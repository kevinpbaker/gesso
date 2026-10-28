import { darkTheme, lightTheme, type UiTheme } from 'gesso-core';

/** A theme an agent asks for: the application's own, or the light or dark one it designs in. */
export type AgentThemeName = 'app' | 'light' | 'dark';

/**
 * The themes an application designs in, when they are not the ones it
 * is drawn in: a design editor's are the project's, and its own chrome
 * is no business of an agent designing that project.
 */
export interface DesignThemes {
  readonly light?: UiTheme;
  readonly dark?: UiTheme;
}

/**
 * The theme an agent's `theme` names, and what to call it back.
 *
 * `light` and `dark` are the application's design themes, or Gesso's
 * where it has none. `app` is the theme the running application is
 * drawn in. Asked for nothing, an application that has design themes
 * means them, its light one before its dark, since what it is drawn in
 * is not what is being designed; one without them means itself.
 */
export function designedTheme(
  asked: AgentThemeName | undefined,
  themes: DesignThemes,
  appTheme: () => UiTheme | undefined
): { readonly theme: UiTheme; readonly name: AgentThemeName } {
  const name = asked ?? (themes.light !== undefined ? 'light' : themes.dark !== undefined ? 'dark' : 'app');
  if (name === 'dark') {
    return { theme: themes.dark ?? darkTheme, name };
  }
  if (name === 'light') {
    return { theme: themes.light ?? lightTheme, name };
  }
  return { theme: appTheme() ?? lightTheme, name };
}
