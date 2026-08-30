import { renderRoot } from '@gesso/framework';
import { ThemeApp } from './ThemeExampleApp';
import { AppearanceChannel } from './theme/ThemeContract';

/**
 * Render worker for the theme example. The screen lives here; the four
 * appearance choices live on the application worker, and the theme
 * itself is rebuilt from them on this side.
 */
renderRoot(ThemeApp).useChannel(AppearanceChannel);
