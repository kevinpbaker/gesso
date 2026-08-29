import { renderRoot } from '../../framework/app/worker/renderRoot';
import { ThemeApp, ThemeStore } from './ThemeExampleApp';

/**
 * Render worker for the theming example: the theme is built here, next
 * to the tree it themes. The main thread only forwards input.
 */
renderRoot(ThemeApp).useStore(ThemeStore);
