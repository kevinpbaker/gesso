import { ThemeDebugView } from './ThemeDebugView';
import { ThemePlayground } from './ThemePlayground';
import { createThemeDefinition, ThemePlaygroundState, toggleTheme } from './ThemePlaygroundDefinition';
import { UiAnimationFrameClock } from '../ui/scheduler';

/**
 * Mounts the theme playground into the supplied host element.
 *
 * Renders a DOM-box debug visualization of the layout records and
 * a simple toggle button that switches between light and dark themes.
 */
export function mountThemePlayground(host: HTMLElement): () => void {
  host.innerHTML = '';
  host.style.display = 'flex';
  host.style.flexDirection = 'column';
  host.style.height = '100%';

  const toolbar = document.createElement('div');
  toolbar.className = 'pg-toolbar';
  toolbar.style.flex = 'none';
  toolbar.style.padding = '0.75rem 1rem';
  toolbar.style.background = '#ffffff';
  toolbar.style.borderBottom = '1px solid #d1d5db';
  host.appendChild(toolbar);

  const toggle = document.createElement('button');
  toggle.textContent = 'Toggle theme';
  toolbar.appendChild(toggle);

  const preview = document.createElement('div');
  preview.className = 'pg-preview';
  preview.style.flex = '1';
  preview.style.minHeight = '0';
  host.appendChild(preview);

  const canvas = document.createElement('div');
  canvas.className = 'pg-canvas';
  preview.appendChild(canvas);

  const state = new ThemePlaygroundState();
  const playground = new ThemePlayground({
    clock: callback => new UiAnimationFrameClock(callback)
  });

  const debugView = new ThemeDebugView(canvas);

  playground.setOnUpdate(() => {
    debugView.render(playground.inspect());
  });
  playground.build(createThemeDefinition(state));

  const onToggle = (): void => {
    toggleTheme(state);
    playground.rebuild(createThemeDefinition(state));
  };
  toggle.addEventListener('click', onToggle);

  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        playground.relayout(width, height);
      }
    }
  });
  resizeObserver.observe(preview);

  return () => {
    resizeObserver.disconnect();
    toggle.removeEventListener('click', onToggle);
    playground.dispose();
  };
}
