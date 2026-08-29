import { UiAnimationFrameClock } from '../../ui/scheduler';
import { darkTheme } from '../../ui/environment/UiTheme';
import { ThemeDebugView } from '../ThemeDebugView';
import { ThemePlayground } from '../ThemePlayground';
import { createThemeDefinition, ThemePlaygroundState, toggleTheme } from '../ThemePlaygroundDefinition';
import { mountShell } from '../shell/AppShell';
import { createElement, observeSize } from '../shell/dom';

/**
 * Route that shows theme values propagating through the environment.
 *
 * The debug view draws paint properties as well as geometry, so
 * flipping the theme visibly repaints a tree that was never rebuilt
 * for appearance's sake — the environment change alone reaches every
 * node that reads from it.
 *
 * This route used to build its own toolbar with inline light-mode
 * colors, which is exactly the kind of thing the shared shell exists
 * to prevent.
 */
export function mountThemeRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'theme' });

  const canvas = createElement('div', { className: 'pg-canvas' });
  shell.preview.appendChild(canvas);

  const state = new ThemePlaygroundState();
  const playground = new ThemePlayground({
    clock: callback => new UiAnimationFrameClock(callback)
  });
  const debugView = new ThemeDebugView(canvas);

  playground.setOnUpdate(() => {
    debugView.render(playground.inspect());
  });
  playground.build(createThemeDefinition(state));

  const size = observeSize(shell.preview, (width, height) => {
    playground.relayout(width, height);
  });

  shell.addAction('Toggle theme', () => {
    toggleTheme(state);
    playground.rebuild(createThemeDefinition(state));
    reportTheme();
  });

  function reportTheme(): void {
    shell.setStatus(
      `Environment resolves against the ${state.theme$.getValue() === darkTheme ? 'dark' : 'light'} theme.`
    );
  }

  reportTheme();
  shell.setDetail('Boxes are drawn from resolved paint properties, not from the debug view’s own styling.');

  return () => {
    size.stop();
    playground.dispose();
    shell.dispose();
  };
}
