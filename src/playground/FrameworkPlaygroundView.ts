import { createApp } from '../framework';
import { DemoStore, FrameworkDemoRoot } from './FrameworkPlayground';
import { HeavyStore } from './HeavyStore';

const BLOCK_MS = 2000;

/**
 * Worker-hosted framework route.
 *
 * The main thread here owns only the page shell: it creates the
 * canvas, hands its drawing surface to the render worker, and
 * forwards events. Components, layout and rendering all run in the
 * worker, so the "Block main thread" button below freezes this
 * thread for two seconds without costing the UI a single frame.
 *
 * Compare with #framework-sync, which runs the same app on the main
 * thread and visibly stalls.
 */
export function mountFrameworkPlayground(host: HTMLElement): () => void {
  host.innerHTML = renderTemplate('Framework (render worker)', 'worker');

  const report = createFrameReporter('Rendering in a worker');

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    worker: () => new Worker(new URL('./FrameworkWorker.ts', import.meta.url), { type: 'module' }),
    onFrame: report,
    onError: (message, stack) => {
      requireElement('.pg-status').textContent = `Render worker error: ${message}`;
      console.error('[nodal render worker]', message, stack);
    }
  });

  const dispose = app.mount(requireElement('.pg-preview'));
  const detachBlock = wireBlockButton();

  return () => {
    detachBlock();
    dispose();
  };
}

/**
 * Single-thread framework route, for comparison.
 *
 * Identical app, mounted with mountSync so components, layout and
 * rendering share the main thread. Blocking the main thread here
 * stalls the UI, which is exactly what the worker route avoids.
 */
export function mountFrameworkSyncPlayground(host: HTMLElement): () => void {
  host.innerHTML = renderTemplate('Framework (single thread)', 'sync');

  const report = createFrameReporter('Rendering on the main thread');

  const dispose = createApp(FrameworkDemoRoot)
    .useStore(DemoStore)
    .useStore(HeavyStore, {
      worker: () => new Worker(new URL('./HeavyWorker.ts', import.meta.url), { type: 'module' })
    })
    .onFrame(report)
    .mountSync(requireElement('.pg-preview'));
  const detachBlock = wireBlockButton();

  return () => {
    detachBlock();
    dispose();
  };
}

/**
 * Reports frame counts and rate identically for both configurations,
 * so the comparison between them is like for like.
 */
function createFrameReporter(
  label: string
): (metrics: { durationMs: number; at: number; phases: Record<string, number> }) => void {
  let frames = 0;
  let lastReport = performance.now();
  let framesAtLastReport = 0;
  let previousFrameAt: number | null = null;
  let worstGap = 0;
  // Peak rather than latest: patches and environment run on a small
  // minority of frames, so sampling the current frame would almost
  // always show them as idle even when they are doing the work.
  const worstPhase: Record<string, number> = {};
  return metrics => {
    frames++;
    // Measured on the rendering thread's clock. Across a worker
    // boundary the messages queue behind a blocked main thread and
    // arrive together, so only these timestamps reveal a real stall.
    if (previousFrameAt !== null) {
      worstGap = Math.max(worstGap, metrics.at - previousFrameAt);
    }
    previousFrameAt = metrics.at;
    for (const [name, ms] of Object.entries(metrics.phases)) {
      worstPhase[name] = Math.max(worstPhase[name] ?? 0, ms);
    }

    const now = performance.now();
    if (now - lastReport < 500) {
      return;
    }
    const fps = ((frames - framesAtLastReport) * 1000) / (now - lastReport);
    requireElement('.pg-status').textContent =
      `${label} · ${frames} frames · ${fps.toFixed(0)} fps · ` +
      `last frame ${metrics.durationMs.toFixed(1)}ms · worst gap ${worstGap.toFixed(0)}ms`;
    requireElement('.pg-phases').textContent =
      'worst phase · ' +
      Object.entries(worstPhase)
        .map(([name, ms]) => `${name} ${ms.toFixed(2)}ms`)
        .join(' · ') +
      '   (0 means the phase never had work)';
    lastReport = now;
    framesAtLastReport = frames;
  };
}

/**
 * Busy-loops the main thread so the difference between the two
 * configurations is directly observable.
 */
function wireBlockButton(): () => void {
  const button = requireElement('.pg-block') as HTMLButtonElement;
  const onClick = (): void => {
    const status = requireElement('.pg-status');
    const previous = status.textContent;
    status.textContent = `Blocking the main thread for ${BLOCK_MS}ms…`;
    // Yield once so the status text paints before the thread locks up.
    setTimeout(() => {
      const until = performance.now() + BLOCK_MS;
      while (performance.now() < until) {
        // Deliberately spinning.
      }
      status.textContent = previous;
    }, 32);
  };
  button.addEventListener('click', onClick);
  return () => button.removeEventListener('click', onClick);
}

function renderTemplate(title: string, mode: 'worker' | 'sync'): string {
  return `
  <div class="pg-app">
    <header class="pg-header">
      <span class="pg-title">${title}</span>
      <nav class="pg-nav">
        <a class="pg-link" href="#debug">DOM boxes</a>
        <a class="pg-link" href="#canvas">Canvas render</a>
        <a class="pg-link" href="#framework">Worker</a>
        <a class="pg-link" href="#framework-sync">Single thread</a>
        <a class="pg-link" href="#binding">Bindings</a>
        <a class="pg-link" href="#theme">Theme</a>
        <a class="pg-link" href="#webgpu">WebGPU</a>
        <a class="pg-link" href="#compare">Compare</a>
      </nav>
    </header>
    <main class="pg-main">
      <section class="pg-preview"></section>
    </main>
    <footer class="pg-debug">
      <div class="pg-status">Starting ${mode === 'worker' ? 'render worker' : 'single-thread app'}…</div>
      <div class="pg-status pg-status-dim pg-phases">Phase timings appear once frames start.</div>
      <button class="pg-block" type="button">Block main thread ${BLOCK_MS}ms</button>
    </footer>
  </div>`;
}

function requireElement(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (el === null) {
    throw new Error(`Framework playground element '${selector}' not found.`);
  }
  return el;
}
