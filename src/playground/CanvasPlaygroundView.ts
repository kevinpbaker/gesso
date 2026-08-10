import type { Observable } from 'rxjs';

import { UiAnimationFrameClock } from '../ui/scheduler';
import { CanvasPreview } from './CanvasPreview';
import { LayoutPlayground } from './LayoutPlayground';
import { mountPlaygroundShell, scrollStatsText } from './PlaygroundControls';
import { createDefinition } from './PlaygroundDefinition';
import { PlaygroundState } from './PlaygroundState';

/**
 * Route that proves the runtime works end-to-end: the same
 * playground scenes the DOM-box route shows are painted by the real
 * library renderer (Canvas2DRenderer) onto a canvas, sharing a
 * canvas-backed text measurer with the layout engine.
 *
 * Returns a dispose function so the hash router can swap routes.
 */
export function mountCanvasPlayground(host: HTMLElement): () => void {
  const state = new PlaygroundState();
  const shell = mountPlaygroundShell(host, state);

  const canvas = document.createElement('canvas');
  canvas.className = 'pg-canvas';
  shell.preview.appendChild(canvas);

  const preview = new CanvasPreview(canvas);
  const playground = new LayoutPlayground({
    clock: callback => new UiAnimationFrameClock(callback),
    textMeasurer: preview.textMeasurer
  });

  const structural: Observable<unknown>[] = [state.fitPreview$, state.order$, state.stressCount$];
  for (const subject of structural) {
    subject.subscribe(() => {
      playground.rebuild(createDefinition(state));
    });
  }

  playground.setOnUpdate(refresh);
  playground.build(createDefinition(state));

  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        preview.setLogicalSize(width, height, window.devicePixelRatio);
        playground.relayout(width, height);
      }
    }
  });
  resizeObserver.observe(shell.preview);

  function refresh(): void {
    preview.render(playground.layoutRoot, playground.engine);
    const info = playground.inspect();
    shell.updateMetrics(playground.metrics());
    shell.updateScrollStats(scrollStatsText(info));
    shell.updateSelected('Rendered by Canvas2DRenderer. Click-to-inspect is not wired on this route.');
  }

  return () => {
    resizeObserver.disconnect();
    playground.dispose();
  };
}
