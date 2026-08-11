import { Box, Column } from '../ui/composition';
import type { UiElement } from '../ui/composition';
import { UiAnimationFrameClock } from '../ui/scheduler';
import { LayoutPlayground } from './LayoutPlayground';
import { WebGPUPreview } from './WebGPUPreview';

interface BenchmarkResult {
  nodeCount: number;
  prepareMs: number;
  uploadMs: number;
  encodeMs: number;
  frameMs: number;
}

const SIZES = [100, 1000, 10000, 50000];
const WARMUP_FRAMES = 3;
const SAMPLE_FRAMES = 10;

function buildScene(count: number): UiElement {
  const perRow = Math.ceil(Math.sqrt(count));
  const rows: UiElement[] = [];
  let remaining = count;
  while (remaining > 0) {
    const inRow = Math.min(perRow, remaining);
    const boxes: UiElement[] = [];
    for (let i = 0; i < inRow; i++) {
      boxes.push(
        Box({
          width: 4,
          height: 4,
          backgroundColor: `hsl(${(i * 30) % 360}, 70%, 50%)`,
          borderRadius: 1
        })
      );
    }
    rows.push(Column({ gap: 1 }, ...boxes));
    remaining -= inRow;
  }
  return Column({ gap: 1 }, ...rows);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Benchmarks the WebGPU renderer against increasingly large flat
 * scenes. Results are printed to the page and the console.
 */
export function mountWebGPUBenchmark(host: HTMLElement): () => void {
  host.innerHTML = `
    <div class="pg-app">
      <header class="pg-header"><span class="pg-title">WebGPU Benchmark</span></header>
      <main class="pg-main">
        <section class="pg-preview"></section>
        <aside class="pg-controls">
          <h3>Results</h3>
          <pre id="pg-benchmark-output">Initializing WebGPU...</pre>
        </aside>
      </main>
    </div>`;

  const previewEl = host.querySelector<HTMLElement>('.pg-preview')!;
  const output = host.querySelector<HTMLElement>('#pg-benchmark-output')!;

  const canvas = document.createElement('canvas');
  canvas.className = 'pg-canvas';
  previewEl.appendChild(canvas);

  const preview = new WebGPUPreview(canvas);
  const playground = new LayoutPlayground({
    clock: callback => new UiAnimationFrameClock(callback)
  });

  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        preview.setLogicalSize(width, height, window.devicePixelRatio);
        playground.relayout(width, height);
      }
    }
  });
  resizeObserver.observe(previewEl);

  let running = true;

  preview.initialize().then(async () => {
    const results: BenchmarkResult[] = [];
    for (const size of SIZES) {
      if (!running) {
        break;
      }
      const result = await runBenchmark(preview, playground, size);
      results.push(result);
      output.textContent = formatResults(results);
    }
    output.textContent += '\n\nDone.';
  });

  return () => {
    running = false;
    resizeObserver.disconnect();
    preview.dispose();
    playground.dispose();
  };
}

async function runBenchmark(
  preview: WebGPUPreview,
  playground: LayoutPlayground,
  count: number
): Promise<BenchmarkResult> {
  const root = playground.build(buildScene(count));
  playground.relayout(800, 600);

  const prepareSamples: number[] = [];
  const uploadSamples: number[] = [];
  const encodeSamples: number[] = [];
  const frameSamples: number[] = [];

  for (let frame = 0; frame < WARMUP_FRAMES + SAMPLE_FRAMES; frame++) {
    let prepareMs = 0;
    let uploadMs = 0;
    let encodeMs = 0;
    preview.renderer.setHooks({
      onPrepareEnd(ms: number) {
        prepareMs = ms;
      },
      onUploadEnd(ms: number) {
        uploadMs = ms;
      },
      onEncodeEnd(ms: number) {
        encodeMs = ms;
      }
    });
    const frameStart = performance.now();
    preview.renderer.render(root, { layout: playground.engine, text: preview.textMeasurer });
    const frameMs = performance.now() - frameStart;

    if (frame >= WARMUP_FRAMES) {
      prepareSamples.push(prepareMs);
      uploadSamples.push(uploadMs);
      encodeSamples.push(encodeMs);
      frameSamples.push(frameMs);
    }
  }

  preview.renderer.setHooks({});

  return {
    nodeCount: count,
    prepareMs: average(prepareSamples),
    uploadMs: average(uploadSamples),
    encodeMs: average(encodeSamples),
    frameMs: average(frameSamples)
  };
}

function formatResults(results: BenchmarkResult[]): string {
  return results
    .map(
      r =>
        `${String(r.nodeCount).padStart(6)} nodes  prepare=${r.prepareMs.toFixed(3).padStart(8)}ms  ` +
        `upload=${r.uploadMs.toFixed(3).padStart(8)}ms  encode=${r.encodeMs.toFixed(3).padStart(8)}ms  ` +
        `frame=${r.frameMs.toFixed(3).padStart(8)}ms`
    )
    .join('\n');
}
