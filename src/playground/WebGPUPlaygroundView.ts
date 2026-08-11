import type { Observable } from 'rxjs';

import { UiAnimationFrameClock } from '../ui/scheduler';
import { WebGPUPreview } from './WebGPUPreview';
import { LayoutPlayground } from './LayoutPlayground';
import { mountPlaygroundShell, scrollStatsText } from './PlaygroundControls';
import { createDefinition } from './PlaygroundDefinition';
import { PlaygroundState } from './PlaygroundState';
import { rewireFocusableBoxes, wirePlaygroundInput } from './PlaygroundInput';

/**
 * Route that renders the playground through the WebGPU backend.
 *
 * It reuses the same LayoutPlayground, UiGraph and definition as the
 * Canvas2D route; only the preview object changes. If WebGPU is
 * unavailable, the canvas is replaced with a fallback message.
 *
 * Input is wired through the same renderer-agnostic platform adapter
 * used by the Canvas2D route.
 */
export function mountWebGPUPlayground(host: HTMLElement): () => void {
  const state = new PlaygroundState();
  const shell = mountPlaygroundShell(host, state);

  const canvas = document.createElement('canvas');
  canvas.className = 'pg-canvas';
  canvas.tabIndex = 0;
  canvas.style.touchAction = 'none';
  shell.preview.appendChild(canvas);

  const preview = new WebGPUPreview(canvas);
  const playground = new LayoutPlayground({
    clock: callback => new UiAnimationFrameClock(callback),
    textMeasurer: preview.textMeasurer
  });

  const structural: Observable<unknown>[] = [state.fitPreview$, state.order$, state.stressCount$];
  for (const subject of structural) {
    subject.subscribe(() => {
      playground.rebuild(createDefinition(state));
      rewireFocusableBoxes(playground.layoutRoot);
    });
  }

  let initialized = false;

  playground.setOnUpdate(refresh);
  playground.build(createDefinition(state));
  rewireFocusableBoxes(playground.layoutRoot);

  // -------------------------------------------------------------------------
  // Input layer wiring (shared with Canvas2D route)
  // -------------------------------------------------------------------------
  const detachInput = wirePlaygroundInput(playground, state, canvas, shell);

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

  preview
    .initialize()
    .then(() => {
      initialized = true;
      refresh();
      shell.updateSelected('WebGPU initialized with input.');
    })
    .catch(error => {
      shell.updateSelected(`WebGPU unavailable: ${error instanceof Error ? error.message : String(error)}`);
    });

  function refresh(): void {
    if (!initialized) {
      return;
    }
    preview.render(playground.layoutRoot, playground.engine);
    const info = playground.inspect();
    shell.updateMetrics(playground.metrics());
    shell.updateScrollStats(scrollStatsText(info));
  }

  return () => {
    detachInput();
    resizeObserver.disconnect();
    preview.dispose();
    playground.dispose();
  };
}
