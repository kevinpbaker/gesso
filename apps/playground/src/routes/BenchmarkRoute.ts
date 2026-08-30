import { Box, Column, type UiElement, UiAnimationFrameClock } from '@gesso/core';
import { LayoutPlayground } from '../LayoutPlayground';
import { WebGPUPreview } from '../WebGPUPreview';
import { mountShell } from '../shell/AppShell';
import { createElement, createPreviewCanvas, observeSize } from '../shell/dom';

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
const BENCH_WIDTH = 800;
const BENCH_HEIGHT = 600;

/**
 * Benchmarks the WebGPU renderer against increasingly large flat
 * scenes, reporting the cost of each stage separately so a
 * regression can be attributed to preparing, uploading or encoding
 * rather than just to "the frame".
 */
export function mountBenchmarkRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'benchmark', sidebar: true });

  shell.sidebar.classList.add('pg-controls-wide');
  const output = createElement('pre', { className: 'pg-output', text: 'Requesting a WebGPU adapter…' });
  const section = createElement('section', { className: 'pg-group' });
  section.append(createElement('h3', { className: 'pg-group-title', text: 'Results' }), output);
  shell.sidebar.replaceChildren(section);

  const preview = new WebGPUPreview(createPreviewCanvas(shell.preview, { focusable: false }));
  const playground = new LayoutPlayground({
    clock: callback => new UiAnimationFrameClock(callback)
  });

  // A scene only exists once a measurement starts, so this tracks
  // whether relayout has anything to lay out. Calling it earlier
  // threw "no root yet" out of the ResizeObserver on every load.
  let sceneBuilt = false;
  const size = observeSize(shell.preview, (width, height) => {
    preview.setLogicalSize(width, height, window.devicePixelRatio);
    if (sceneBuilt) {
      playground.relayout(width, height);
    }
  });

  // Checked between sizes so leaving the route stops the run rather
  // than letting a 50k-node pass finish against a disposed device.
  let running = true;

  shell.setStatus('Warming up…');
  preview
    .initialize()
    .then(async () => {
      size.remeasure();
      const results: BenchmarkResult[] = [];
      for (const count of SIZES) {
        if (!running) {
          return;
        }
        shell.setStatus(`Measuring ${count.toLocaleString()} nodes…`);
        results.push(await runBenchmark(preview, playground, count));
        sceneBuilt = true;
        output.textContent = formatResults(results);
      }
      shell.setStatus(`Done. ${SIZES.length} scene sizes, ${SAMPLE_FRAMES} sampled frames each.`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      shell.setStatus(`WebGPU unavailable: ${message}`);
      output.textContent = 'This route needs a WebGPU adapter.';
    });

  shell.setDetail(`${WARMUP_FRAMES} warm-up frames are discarded before each measurement.`);

  return () => {
    running = false;
    size.stop();
    preview.dispose();
    playground.dispose();
    shell.dispose();
  };
}

async function runBenchmark(
  preview: WebGPUPreview,
  playground: LayoutPlayground,
  count: number
): Promise<BenchmarkResult> {
  const root = playground.build(buildScene(count));
  playground.relayout(BENCH_WIDTH, BENCH_HEIGHT);

  const prepareSamples: number[] = [];
  const uploadSamples: number[] = [];
  const encodeSamples: number[] = [];
  const frameSamples: number[] = [];

  for (let frame = 0; frame < WARMUP_FRAMES + SAMPLE_FRAMES; frame++) {
    let prepareMs = 0;
    let uploadMs = 0;
    let encodeMs = 0;
    preview.renderer.setHooks({
      onPrepareEnd: (ms: number) => {
        prepareMs = ms;
      },
      onUploadEnd: (ms: number) => {
        uploadMs = ms;
      },
      onEncodeEnd: (ms: number) => {
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

/**
 * Builds a roughly square grid of small boxes.
 *
 * The shape is deliberately flat and uniform: the point is to measure
 * per-node renderer cost, so the scene should not spend the budget on
 * deep nesting or interesting layout.
 */
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

function formatResults(results: readonly BenchmarkResult[]): string {
  const header = `${'nodes'.padStart(7)}  ${'prepare'.padStart(9)}  ${'upload'.padStart(9)}  ${'encode'.padStart(9)}  ${'frame'.padStart(9)}`;
  const rows = results.map(
    result =>
      `${result.nodeCount.toLocaleString().padStart(7)}  ${ms(result.prepareMs)}  ${ms(result.uploadMs)}  ` +
      `${ms(result.encodeMs)}  ${ms(result.frameMs)}`
  );
  return [header, '─'.repeat(header.length), ...rows].join('\n');
}

function ms(value: number): string {
  return `${value.toFixed(3)}ms`.padStart(9);
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}
