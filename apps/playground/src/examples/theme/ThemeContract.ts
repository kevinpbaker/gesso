import { channel } from '@gesso/framework';
import type { AppearanceView } from '../ThemeExampleApp';

/**
 * The appearance barrier: four choices, and four ways to change them.
 *
 * `UiTheme` is deliberately not here. It is derived from these choices
 * by a pure function, so the render side rebuilds it rather than
 * receiving it — only what cannot be recomputed should travel.
 */
export interface AppearanceCommands {
  setPalette(palette: string): void;
  setAccent(accent: string): void;
  setCorners(corners: string): void;
  setTextSize(textSize: string): void;
}

export const AppearanceChannel = channel<{ view: AppearanceView }, AppearanceCommands>('appearance', {
  view: { palette: 'daylight', accent: 'blue', corners: 'soft', textSize: 'regular', dark: false }
});
