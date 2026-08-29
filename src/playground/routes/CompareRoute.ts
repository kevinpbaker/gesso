import type { Observable } from 'rxjs';

import { UiAnimationFrameClock } from '../../ui/scheduler';
import { CanvasPreview } from '../CanvasPreview';
import { LayoutPlayground } from '../LayoutPlayground';
import { mountPlaygroundPanel } from '../PlaygroundPanel';
import { createDefinition } from '../PlaygroundDefinition';
import { PlaygroundState } from '../PlaygroundState';
import { scrollStatsText } from '../scrollStats';
import { WebGPUPreview } from '../WebGPUPreview';
import { createPreviewCanvas, observeSize } from '../shell/dom';

/** Half the gap between the two panes, in CSS pixels. */
const HALF_GUTTER = 6;

/**
 * Side-by-side Canvas2D and WebGPU comparison.
 *
 * Both previews consume the same UiGraph and the same LayoutEngine —
 * including one shared text measurer, so the two backends cannot
 * disagree about how wide a string is. Any visible difference is
 * therefore attributable to the renderer itself.
 */
export function mountCompareRoute(host: HTMLElement): () => void {
  const state = new PlaygroundState();
  const panel = mountPlaygroundPanel(host, 'compare', state);
  panel.preview.classList.add('pg-preview-split');

  const canvasPreview = new CanvasPreview(createPreviewCanvas(panel.preview, { focusable: false }));
  const webgpuPreview = new WebGPUPreview(createPreviewCanvas(panel.preview, { focusable: false }));

  const playground = new LayoutPlayground({
    clock: callback => new UiAnimationFrameClock(callback),
    textMeasurer: canvasPreview.textMeasurer
  });

  const structural: Observable<unknown>[] = [state.fitPreview$, state.order$, state.stressCount$];
  const subscriptions = structural.map(subject =>
    subject.subscribe(() => {
      playground.rebuild(createDefinition(state));
    })
  );

  let webgpuReady = false;

  playground.setOnUpdate(refresh);
  playground.build(createDefinition(state));

  const size = observeSize(panel.preview, (width, height) => {
    // Each pane gets half the preview minus the gutter between them,
    // and the tree is laid out once at that width because both
    // renderers draw the very same records.
    const paneWidth = width / 2 - HALF_GUTTER;
    canvasPreview.setLogicalSize(paneWidth, height, window.devicePixelRatio);
    webgpuPreview.setLogicalSize(paneWidth, height, window.devicePixelRatio);
    playground.relayout(paneWidth, height);
  });

  panel.updateSelected('Canvas2D on the left, WebGPU on the right. Waiting for an adapter…');
  webgpuPreview
    .initialize()
    .then(() => {
      webgpuReady = true;
      // Re-apply the current size now that there is a device to
      // receive it; see SizeObservation.remeasure.
      size.remeasure();
      refresh();
      panel.updateSelected('Canvas2D on the left, WebGPU on the right, from one graph and one layout pass.');
    })
    .catch((error: unknown) => {
      panel.updateSelected(
        `Canvas2D on the left. WebGPU unavailable: ${error instanceof Error ? error.message : String(error)}`
      );
    });

  function refresh(): void {
    canvasPreview.render(playground.layoutRoot, playground.engine);
    if (webgpuReady) {
      webgpuPreview.render(playground.layoutRoot, playground.engine);
    }
    panel.updateMetrics(playground.metrics());
    panel.updateScrollStats(scrollStatsText(playground.inspect()));
  }

  return () => {
    size.stop();
    for (const subscription of subscriptions) {
      subscription.unsubscribe();
    }
    webgpuPreview.dispose();
    playground.dispose();
    panel.dispose();
  };
}
