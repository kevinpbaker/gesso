import type { Observable } from 'rxjs';

import { UiAnimationFrameClock } from '../ui/scheduler';
import { CanvasPreview } from './CanvasPreview';
import { WebGPUPreview } from './WebGPUPreview';
import { LayoutPlayground } from './LayoutPlayground';
import { mountPlaygroundShell, scrollStatsText } from './PlaygroundControls';
import { createDefinition } from './PlaygroundDefinition';
import { PlaygroundState } from './PlaygroundState';

/**
 * Side-by-side Canvas2D / WebGPU comparison route.
 *
 * Both previews consume the exact same UiGraph and LayoutEngine, so
 * any visual difference is attributable to the renderer itself.
 */
export function mountComparison(host: HTMLElement): () => void {
  const state = new PlaygroundState();
  const shell = mountPlaygroundShell(host, state);

  shell.preview.style.display = 'grid';
  shell.preview.style.gridTemplateColumns = '1fr 1fr';
  shell.preview.style.gap = '8px';

  const canvas2dHost = document.createElement('canvas');
  canvas2dHost.className = 'pg-canvas';
  shell.preview.appendChild(canvas2dHost);

  const webgpuHost = document.createElement('canvas');
  webgpuHost.className = 'pg-canvas';
  shell.preview.appendChild(webgpuHost);

  const canvasPreview = new CanvasPreview(canvas2dHost);
  const webgpuPreview = new WebGPUPreview(webgpuHost);

  const playground = new LayoutPlayground({
    clock: callback => new UiAnimationFrameClock(callback),
    textMeasurer: canvasPreview.textMeasurer
  });

  // The WebGPU preview needs its own text measurer; we use the same
  // canvas-backed measurer so layout and both renderers agree.
  const structural: Observable<unknown>[] = [state.fitPreview$, state.order$, state.stressCount$];
  for (const subject of structural) {
    subject.subscribe(() => {
      playground.rebuild(createDefinition(state));
    });
  }

  let webgpuReady = false;

  playground.setOnUpdate(refresh);
  playground.build(createDefinition(state));

  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        const half = width / 2 - 4;
        canvasPreview.setLogicalSize(half, height, window.devicePixelRatio);
        webgpuPreview.setLogicalSize(half, height, window.devicePixelRatio);
        playground.relayout(half, height);
      }
    }
  });
  resizeObserver.observe(shell.preview);

  webgpuPreview.initialize().then(() => {
    webgpuReady = true;
    refresh();
    shell.updateSelected('WebGPU initialized; compare both renderers.');
  });

  function refresh(): void {
    canvasPreview.render(playground.layoutRoot, playground.engine);
    if (webgpuReady) {
      webgpuPreview.render(playground.layoutRoot, playground.engine);
    }
    const info = playground.inspect();
    shell.updateMetrics(playground.metrics());
    shell.updateScrollStats(scrollStatsText(info));
  }

  shell.updateSelected('Canvas2D side ready; waiting for WebGPU...');

  return () => {
    resizeObserver.disconnect();
    webgpuPreview.dispose();
    playground.dispose();
  };
}
