import type { Observable } from 'rxjs';

import { UiAnimationFrameClock } from 'gesso-core';
import { LayoutPlayground } from '../LayoutPlayground';
import { mountPlaygroundPanel } from '../PlaygroundPanel';
import { createDefinition } from '../PlaygroundDefinition';
import { PlaygroundState } from '../PlaygroundState';
import { rewireFocusableBoxes, wirePlaygroundInput } from '../PlaygroundInput';
import { scrollStatsText } from '../scrollStats';
import { WebGPUPreview } from '../WebGPUPreview';
import { createPreviewCanvas, observeSize } from '../shell/dom';

/**
 * Route that renders the playground through the WebGPU backend.
 *
 * It reuses the same LayoutPlayground, UiGraph and definition as the
 * Canvas2D route; only the preview object differs, which is the point
 * of the exercise. Input goes through the same renderer-agnostic
 * platform adapter, so nothing about the interaction layer knows
 * which backend is drawing.
 */
export function mountWebGPURoute(host: HTMLElement): () => void {
  const state = new PlaygroundState();
  const panel = mountPlaygroundPanel(host, 'webgpu', state);
  const canvas = createPreviewCanvas(panel.preview);

  const preview = new WebGPUPreview(canvas);
  const playground = new LayoutPlayground({
    clock: callback => new UiAnimationFrameClock(callback),
    textMeasurer: preview.textMeasurer
  });

  const structural: Observable<unknown>[] = [state.fitPreview$, state.order$, state.stressCount$];
  const subscriptions = structural.map(subject =>
    subject.subscribe(() => {
      playground.rebuild(createDefinition(state));
      rewireFocusableBoxes(playground.layoutRoot);
    })
  );

  let initialized = false;

  playground.setOnUpdate(refresh);
  playground.build(createDefinition(state));
  rewireFocusableBoxes(playground.layoutRoot);

  const detachInput = wirePlaygroundInput(playground, state, canvas, panel);

  const size = observeSize(panel.preview, (width, height) => {
    preview.setLogicalSize(width, height, window.devicePixelRatio);
    playground.relayout(width, height);
  });

  panel.updateSelected('Requesting a WebGPU adapter…');
  preview
    .initialize()
    .then(() => {
      initialized = true;
      // The observer already delivered a size, but it arrived while
      // there was no device to apply it to. Re-apply it now so the
      // very first painted frame is at the right size.
      size.remeasure();
      refresh();
      panel.updateSelected('WebGPU initialized. Hover, press and wheel-scroll are wired.');
    })
    .catch((error: unknown) => {
      panel.updateSelected(`WebGPU unavailable: ${error instanceof Error ? error.message : String(error)}`);
    });

  function refresh(): void {
    // Frames can be scheduled before the adapter resolves; drawing
    // then would touch a device that does not exist yet.
    if (!initialized) {
      return;
    }
    preview.render(playground.layoutRoot, playground.engine);
    panel.updateMetrics(playground.metrics());
    panel.updateScrollStats(scrollStatsText(playground.inspect()));
  }

  return () => {
    detachInput();
    size.stop();
    for (const subscription of subscriptions) {
      subscription.unsubscribe();
    }
    preview.dispose();
    playground.dispose();
    panel.dispose();
  };
}
