import { createApp } from '../../framework';
import type { RendererChoice } from '../../framework/app/NodalRuntime';
import { DemoStore, FrameworkDemoRoot } from '../FrameworkPlayground';
import { HeavyStore } from '../HeavyStore';
import { mountShell, type AppShell } from '../shell/AppShell';
import { addInspectAction, mountInspectorPanel } from '../shell/InspectorPanel';

const BLOCK_MS = 2000;
/** How often the reporter is allowed to touch the DOM. */
const REPORT_INTERVAL_MS = 500;
/** Where the chosen backend survives a reload. */
const RENDERER_STORAGE_KEY = 'nodal.playground.renderer';

interface FrameMetrics {
  durationMs: number;
  measured: number;
  relayoutRoots: number;
  at: number;
  phases: Record<string, number>;
  renderer: string;
}

/**
 * Worker-hosted framework route.
 *
 * The main thread owns only the page shell: it creates the canvas,
 * hands its drawing surface to the render worker, and forwards
 * events. Components, layout and rendering all run in the worker, so
 * "Block main thread" freezes this thread for two seconds without
 * costing the UI a single frame.
 *
 * A renderer toggle remounts the app on the other backend. The choice
 * is kept in localStorage so a reload keeps it, and the metrics row
 * reports which backend is actually drawing — WebGPU falls back to
 * Canvas2D where it is unavailable, and the label says so.
 *
 * Compare with #framework-sync, which runs the same app on the main
 * thread and visibly stalls.
 */
export function mountFrameworkRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'framework', metrics: true });
  const inspectorPanel = mountInspectorPanel(shell.preview);
  let inspecting = false;

  const start = (renderer: RendererChoice): { dispose: () => void; setInspector(enabled: boolean): void } => {
    const report = createFrameReporter(shell, 'Render worker', renderer);
    const app = createApp({
      // Written out literally so the bundler can see and split it.
      worker: () => new Worker(new URL('../FrameworkWorker.ts', import.meta.url), { type: 'module' }),
      renderer,
      onFrame: report,
      onError: (message, stack) => {
        shell.setStatus(`Render worker error: ${message}`);
        console.error('[nodal render worker]', message, stack);
      },
      // The explanation is computed in the worker, where the layout
      // records are; only its text crosses to this thread.
      onInspect: text => inspectorPanel.set(text)
    });
    shell.setStatus(`Starting the render worker on ${describeRenderer(renderer)}…`);
    const dispose = app.mount(shell.preview);
    if (inspecting) {
      app.setInspector(true);
    }
    return { dispose, setInspector: enabled => app.setInspector(enabled) };
  };

  let app = start(loadRendererChoice());
  addInspectAction(shell, enabled => {
    inspecting = enabled;
    app.setInspector(enabled);
  });
  addRendererAction(shell, choice => {
    app.dispose();
    app = start(choice);
  });
  addBlockAction(shell);

  return () => {
    app.dispose();
    inspectorPanel.dispose();
    shell.dispose();
  };
}

/**
 * Single-thread framework route, for comparison.
 *
 * The identical app, mounted so that components, layout and rendering
 * share the main thread. Blocking the main thread here stalls the UI,
 * which is exactly what the worker route avoids.
 */
export function mountFrameworkSyncRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'framework-sync', metrics: true });
  const inspectorPanel = mountInspectorPanel(shell.preview);
  let inspecting = false;

  const start = (renderer: RendererChoice): { dispose: () => void; setInspector(enabled: boolean): void } => {
    const report = createFrameReporter(shell, 'Main thread', renderer);
    shell.setStatus(`Starting the single-threaded app on ${describeRenderer(renderer)}…`);
    const builder = createApp(FrameworkDemoRoot)
      .useStore(DemoStore)
      .useStore(HeavyStore, {
        worker: () => new Worker(new URL('../HeavyWorker.ts', import.meta.url), { type: 'module' })
      })
      .renderer(renderer)
      .onFrame(report)
      .onInspect(text => inspectorPanel.set(text));
    const dispose = builder.mountSync(shell.preview);
    if (inspecting) {
      builder.setInspector(true);
    }
    return { dispose, setInspector: enabled => builder.setInspector(enabled) };
  };

  let app = start(loadRendererChoice());
  addInspectAction(shell, enabled => {
    inspecting = enabled;
    app.setInspector(enabled);
  });
  addRendererAction(shell, choice => {
    app.dispose();
    app = start(choice);
  });
  addBlockAction(shell);

  return () => {
    app.dispose();
    inspectorPanel.dispose();
    shell.dispose();
  };
}

function loadRendererChoice(): RendererChoice {
  try {
    const stored = localStorage.getItem(RENDERER_STORAGE_KEY);
    return stored === 'webgpu' ? 'webgpu' : 'canvas2d';
  } catch {
    return 'canvas2d';
  }
}

function saveRendererChoice(choice: RendererChoice): void {
  try {
    localStorage.setItem(RENDERER_STORAGE_KEY, choice);
  } catch {
    // Storage may be unavailable; the choice then lasts for the page.
  }
}

function describeRenderer(choice: RendererChoice): string {
  return choice === 'webgpu' ? 'WebGPU' : choice === 'auto' ? 'WebGPU if available' : 'Canvas2D';
}

/**
 * A button that flips the backend and remounts the app on it.
 */
function addRendererAction(shell: AppShell, remount: (choice: RendererChoice) => void): void {
  let choice = loadRendererChoice();
  const label = (): string => `Switch to ${choice === 'webgpu' ? 'Canvas2D' : 'WebGPU'}`;
  const button = shell.addAction(label(), () => {
    choice = choice === 'webgpu' ? 'canvas2d' : 'webgpu';
    saveRendererChoice(choice);
    button.textContent = label();
    remount(choice);
  });
}

/**
 * Reports frame counts and rate identically for both configurations,
 * so the comparison between them is like for like.
 */
function createFrameReporter(
  shell: AppShell,
  label: string,
  requested: RendererChoice
): (metrics: FrameMetrics) => void {
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
    if (now - lastReport < REPORT_INTERVAL_MS) {
      return;
    }
    const fps = ((frames - framesAtLastReport) * 1000) / (now - lastReport);
    lastReport = now;
    framesAtLastReport = frames;

    const backend =
      metrics.renderer === 'pending'
        ? 'starting…'
        : metrics.renderer === 'canvas2d' && requested !== 'canvas2d'
          ? 'Canvas2D (WebGPU unavailable)'
          : metrics.renderer === 'webgpu'
            ? 'WebGPU'
            : 'Canvas2D';

    shell.setMetrics([
      { label: 'Thread', value: label },
      { label: 'Renderer', value: backend },
      { label: 'Frames', value: String(frames) },
      { label: 'FPS', value: fps.toFixed(0) },
      { label: 'Frame', value: `${metrics.durationMs.toFixed(1)} ms` },
      { label: 'Worst gap', value: `${worstGap.toFixed(0)} ms` }
    ]);
    shell.setStatus(
      'Worst phase · ' +
        Object.entries(worstPhase)
          .map(([name, ms]) => `${name} ${ms.toFixed(2)}ms`)
          .join(' · ')
    );
    shell.setDetail(
      `Last frame laid out ${metrics.measured} node${metrics.measured === 1 ? '' : 's'}` +
        (metrics.relayoutRoots > 0
          ? ` from ${metrics.relayoutRoots} relayout boundar${metrics.relayoutRoots === 1 ? 'y' : 'ies'}.`
          : metrics.measured > 0
            ? ' from the root.'
            : '.') +
        ' A phase reading of 0 means that phase never had work to do.'
    );
  };
}

/**
 * Busy-loops the main thread so the difference between the two
 * configurations is directly observable.
 */
function addBlockAction(shell: AppShell): void {
  shell.addAction(
    `Block main thread ${BLOCK_MS / 1000}s`,
    () => {
      shell.setStatus(`Blocking the main thread for ${BLOCK_MS}ms…`);
      // Yield once so that status text actually paints before the
      // thread locks up and stops painting anything.
      setTimeout(() => {
        const until = performance.now() + BLOCK_MS;
        while (performance.now() < until) {
          // Deliberately spinning.
        }
      }, 32);
    },
    { danger: true }
  );
}
