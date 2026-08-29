import type { Observable } from 'rxjs';

import { UiAnimationFrameClock } from '../../ui/scheduler';
import { CanvasPreview } from '../CanvasPreview';
import { LayoutPlayground } from '../LayoutPlayground';
import { mountPlaygroundPanel } from '../PlaygroundPanel';
import { createDefinition } from '../PlaygroundDefinition';
import { PlaygroundState } from '../PlaygroundState';
import { scrollStatsText } from '../scrollStats';
import { WebGPUPreview } from '../WebGPUPreview';
import { createDemoBitmap } from '../demoBitmap';
import { createPreviewCanvas, observeSize } from '../shell/dom';

/** Half the gap between the two panes, in CSS pixels. */
const HALF_GUTTER = 6;

/**
 * Per-channel difference below which two pixels count as the same.
 * Text is rasterised into a texture on WebGPU and drawn directly on
 * Canvas2D, so glyph edges differ by sub-pixel anti-aliasing; boxes,
 * clips and images should not differ at all.
 */
const CHANNEL_TOLERANCE = 48;

/**
 * Per-channel difference above which a pixel is *grossly* different:
 * covered on one backend and empty on the other, as a shifted edge
 * produces. Anti-aliasing disagreements stay well below it, so this
 * count is what a one-pixel geometry change moves.
 */
const GROSS_TOLERANCE = 160;

export interface ParityResult {
  /** Pixels whose channels differ by more than the tolerance. */
  differing: number;
  /** Pixels compared, excluding masked ones. */
  total: number;
  /** Pixels excluded from the comparison (text runs). */
  masked: number;
  /** Pixels differing by more than GROSS_TOLERANCE: geometry, not anti-aliasing. */
  gross: number;
  /** Painted (non-transparent) pixels in the Canvas2D pane; a diagnostic for a blank pane. */
  leftPainted: number;
  /** Painted pixels in the WebGPU pane. */
  rightPainted: number;
}

/**
 * Premultiplies a straight-alpha RGBA buffer in place, so a Canvas2D
 * `getImageData` readback compares with the GPU's premultiplied frame.
 */
export function premultiply(data: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    if (alpha < 1) {
      data[i] = Math.round(data[i] * alpha);
      data[i + 1] = Math.round(data[i + 1] * alpha);
      data[i + 2] = Math.round(data[i + 2] * alpha);
    }
  }
  return data;
}

/**
 * Diagnostics for tuning the gate: how many unmasked pixels differ by
 * more than each tolerance, and the 40-pixel cells holding the most
 * differing pixels at the base tolerance.
 */
export function parityHistogram(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  mask: Uint8Array | null
): { byTolerance: Record<string, number>; hotCells: string[] } {
  const tolerances = [32, 48, 64, 96, 128, 160];
  const counts = tolerances.map(() => 0);
  const cells = new Map<string, number>();
  const pixels = Math.min(a.length, b.length) / 4;
  for (let p = 0; p < pixels; p++) {
    if (mask !== null && mask[p] !== 0) {
      continue;
    }
    const i = p * 4;
    const delta = Math.max(
      Math.abs(a[i] - b[i]),
      Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2]),
      Math.abs(a[i + 3] - b[i + 3])
    );
    tolerances.forEach((t, k) => {
      if (delta > t) {
        counts[k]++;
      }
    });
    if (delta > CHANNEL_TOLERANCE) {
      const key = `${Math.floor((p % width) / 40) * 40},${Math.floor(p / width / 40) * 40}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }
  }
  const byTolerance: Record<string, number> = {};
  tolerances.forEach((t, k) => (byTolerance[String(t)] = counts[k]));
  const hotCells = [...cells.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 8)
    .map(([key, count]) => `${key}:${count}`);
  return { byTolerance, hotCells };
}

/**
 * Compares two same-sized RGBA buffers pixel by pixel. Pixels set in
 * `mask` (one byte per pixel) are left out of the comparison: text is
 * rasterised into a texture at a snapped origin on WebGPU and drawn at
 * fractional positions on Canvas2D, so glyph edges differ by design;
 * their placement is pinned by RendererParity.spec instead.
 */
export function countDifferingPixels(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  tolerance = CHANNEL_TOLERANCE,
  mask: Uint8Array | null = null
): ParityResult {
  const pixels = Math.min(a.length, b.length) / 4;
  let differing = 0;
  let gross = 0;
  let masked = 0;
  let leftPainted = 0;
  let rightPainted = 0;
  for (let i = 0; i < pixels * 4; i += 4) {
    if (a[i + 3] !== 0) {
      leftPainted++;
    }
    if (b[i + 3] !== 0) {
      rightPainted++;
    }
    if (mask !== null && mask[i >> 2] !== 0) {
      masked++;
      continue;
    }
    const delta = Math.max(
      Math.abs(a[i] - b[i]),
      Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2]),
      Math.abs(a[i + 3] - b[i + 3])
    );
    if (delta > tolerance) {
      differing++;
    }
    if (delta > GROSS_TOLERANCE) {
      gross++;
    }
  }
  return { differing, gross, total: pixels - masked, masked, leftPainted, rightPainted };
}

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

  const canvasElement = createPreviewCanvas(panel.preview, { focusable: false });
  const webgpuElement = createPreviewCanvas(panel.preview, { focusable: false });
  const canvasPreview = new CanvasPreview(canvasElement);
  const webgpuPreview = new WebGPUPreview(webgpuElement);
  // Where the parity check reads its result; see scripts/check-webgpu-parity.ts.
  panel.preview.dataset.parityStatus = 'pending';
  void createDemoBitmap().then(bitmap => state.image$.next(bitmap));

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
  let lastParity: ParityResult | null = null;

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
      const message = error instanceof Error ? error.message : String(error);
      panel.preview.dataset.parityStatus = `webgpu unavailable: ${message}`;
      panel.updateSelected(`Canvas2D on the left. WebGPU unavailable: ${message}`);
    });

  function refresh(): void {
    canvasPreview.render(playground.layoutRoot, playground.engine);
    if (webgpuReady) {
      // The frame is read back from the GPU as it is drawn, so the diff
      // compares this frame with this frame and never waits on the
      // compositor to present the canvas.
      const capture = webgpuPreview.renderer.capture();
      webgpuPreview.render(playground.layoutRoot, playground.engine);
      const left = readCanvas2D();
      capture.then(frame => publishDiff(left, frame)).catch(() => {});
    }
    panel.updateMetrics(playground.metrics());
    panel.updateScrollStats(scrollStatsText(playground.inspect()));
  }

  /**
   * One byte per physical pixel, set where a text node is visible:
   * its `visibleBox` from the engine — the projection renderers and hit
   * testing share — grown by a pixel for the run's snapping.
   */
  function textMask(width: number, height: number): Uint8Array {
    const mask = new Uint8Array(width * height);
    const dpr = canvasPreview.surface.dpr;
    for (const entry of playground.inspect()) {
      if (entry.record === undefined || typeof entry.node.properties.get('text') !== 'string') {
        continue;
      }
      const box = playground.engine.visibleBox(entry.node);
      if (box.width <= 0 || box.height <= 0) {
        continue;
      }
      const x0 = Math.max(0, Math.floor(box.x * dpr) - 1);
      const y0 = Math.max(0, Math.floor(box.y * dpr) - 1);
      const x1 = Math.min(width, Math.ceil((box.x + box.width) * dpr) + 1);
      const y1 = Math.min(height, Math.ceil((box.y + box.height) * dpr) + 1);
      for (let y = y0; y < y1; y++) {
        mask.fill(1, y * width + x0, y * width + x1);
      }
    }
    return mask;
  }

  function readCanvas2D(): ImageData | null {
    const width = canvasElement.width;
    const height = canvasElement.height;
    if (width === 0 || height === 0) {
      return null;
    }
    return canvasElement.getContext('2d')?.getImageData(0, 0, width, height) ?? null;
  }

  function publishDiff(
    left: ImageData | null,
    right: { width: number; height: number; data: Uint8ClampedArray }
  ): void {
    if (left === null || left.width !== right.width || left.height !== right.height) {
      return;
    }
    const leftData = premultiply(left.data);
    const mask = textMask(left.width, left.height);
    const result = countDifferingPixels(leftData, right.data, CHANNEL_TOLERANCE, mask);
    lastParity = result;
    panel.preview.dataset.parityStatus = 'ok';
    panel.preview.dataset.parityDiff = String(result.differing);
    panel.preview.dataset.parityPixels = String(result.total);
    panel.preview.dataset.parityMasked = String(result.masked);
    panel.preview.dataset.parityGross = String(result.gross);
    panel.preview.dataset.parityHistogram = JSON.stringify(parityHistogram(leftData, right.data, left.width, mask));
    panel.preview.dataset.parityLeftPainted = String(result.leftPainted);
    panel.preview.dataset.parityRightPainted = String(result.rightPainted);
    const percent = result.total > 0 ? ((result.differing / result.total) * 100).toFixed(3) : '0';
    panel.updateSelected(
      `Canvas2D on the left, WebGPU on the right, from one graph and one layout pass. ` +
        `Pixel diff: ${result.differing.toLocaleString()} of ${result.total.toLocaleString()} (${percent}%), ` +
        `${result.gross.toLocaleString()} gross, ${result.masked.toLocaleString()} text pixels excluded.`
    );
  }

  return () => {
    void lastParity;
    size.stop();
    for (const subscription of subscriptions) {
      subscription.unsubscribe();
    }
    webgpuPreview.dispose();
    playground.dispose();
    panel.dispose();
  };
}
