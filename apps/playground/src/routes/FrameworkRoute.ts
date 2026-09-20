import { createApp, type RendererChoice, workerHandle } from 'gesso-framework';
import { DemoCounter, FrameworkDemoRoot } from '../FrameworkPlayground';
import { Heavy } from '../HeavyWork';
import { Ticker } from '../TickerChannel';
import { mountShell, type AppShell } from '../shell/AppShell';
import { mountRouteErrors } from '../shell/errors';
import {
  createActionLog,
  createNodePicker,
  mountActionLogPanel,
  mountFrameProfiler,
  mountNodeInspector
} from 'gesso-devtools';
import { addInspectAction, addProfileAction, addToggleAction } from '../shell/InspectorPanel';
import { addDevtoolsAction, connectRouteDevtools } from '../shell/devtools';
import { workerName } from '../shell/still';

const BLOCK_MS = 2000;
/** How often the reporter is allowed to touch the DOM. */
const REPORT_INTERVAL_MS = 500;
/** Where the chosen backend survives a reload. */
const RENDERER_STORAGE_KEY = 'gesso.playground.renderer';

interface FrameMetrics {
  durationMs: number;
  measured: number;
  relayoutRoots: number;
  at: number;
  inputLatencyMs: number | null;
  phases: Record<string, number>;
  renderer: string;
  gpu: { prepare: number; upload: number; encode: number } | null;
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
 *
 * The action log is not here, and that is still the thread model
 * rather than an omission: a channel's ports are made where the
 * replicas are, which in this configuration is the render worker, and
 * the shell holds neither end. What changed is that the log now runs
 * where those ports are. `FrameworkWorker.ts` taps them there and
 * posts what it records to the panel, so the shell is no more in the
 * way of a patch than it was.md`
 * and the record for X15.
 */
export function mountFrameworkRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'framework', metrics: true });
  const inspectorPanel = mountNodeInspector(shell.preview);
  // Mounted once for the route: the strip is a record of what has
  // happened, and a renderer switch is one of the things worth seeing
  // in it rather than a reason to throw the history away.
  const profiler = mountFrameProfiler(shell.preview);
  const errors = mountRouteErrors(shell);
  let inspecting = false;
  // The panel's "Pick": a click on the canvas selects the node under
  // it instead of reaching the application. What it pins is whatever
  // the inspector last reported as hovered, which arrives here through
  // `onInspect` in both configurations.
  let hovered: string | null = null;
  const picker = createNodePicker({ host: shell.preview, hovered: () => hovered });
  // Spawned once for the route, not once per mount. Switching renderer
  // below disposes the app and builds a new one; an application worker
  // owned by that lifetime would restart for a reason that has nothing
  // to do with the application. Written out literally so the bundler
  // emits a chunk for it.
  const applicationWorker = new Worker(new URL('../HeavyWorker.ts', import.meta.url), {
    type: 'module',
    name: workerName()
  });

  const start = (renderer: RendererChoice): { dispose: () => void; setInspector(enabled: boolean): void } => {
    const report = createFrameReporter(shell, 'Render worker', renderer);
    const app = createApp({
      // Written out literally so the bundler can see and split it.
      renderWorker: () =>
        new Worker(new URL('../FrameworkWorker.ts', import.meta.url), { type: 'module', name: workerName() }),
      // Handed over rather than spawned here, so it survives the
      // renderer switch: what WorkerApp is given, it leaves alone.
      appLogicWorker: applicationWorker,
      renderer,
      // The app has a find bar, so it takes Ctrl/Cmd+F; the browser's
      // own cannot see a canvas anyway.
      interceptFind: true,
      onFrame: metrics => {
        report(metrics);
        profiler.report(metrics);
      },
      onError: errors.report,
      // The report is built in the worker, where the tree is; it
      // crosses as plain data.
      onInspect: inspection => {
        hovered = inspection?.id ?? null;
        inspectorPanel.set(inspection);
      }
    });
    shell.setStatus(`Starting the render worker on ${describeRenderer(renderer)}…`);
    const dispose = app.mount(shell.preview);
    if (inspecting) {
      app.setInspector(true);
    }
    const disconnectDevtools = connectRouteDevtools(app, 'framework', { picker });
    return {
      dispose: () => {
        disconnectDevtools();
        dispose();
      },
      setInspector: enabled => app.setInspector(enabled)
    };
  };

  let app = start(loadRendererChoice());
  addInspectAction(shell, enabled => {
    inspecting = enabled;
    app.setInspector(enabled);
  });
  addProfileAction(shell, enabled => profiler.setVisible(enabled));
  addRendererAction(shell, choice => {
    app.dispose();
    app = start(choice);
  });
  addBlockAction(shell);
  const closeDevtools = addDevtoolsAction(shell);

  return () => {
    closeDevtools();
    app.dispose();
    // Ours to stop, since the route spawned it.
    applicationWorker.terminate();
    picker.dispose();
    inspectorPanel.dispose();
    profiler.dispose();
    errors.dispose();
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
  const inspectorPanel = mountNodeInspector(shell.preview);
  const profiler = mountFrameProfiler(shell.preview);
  // No `onError` to give: this configuration renders on this thread,
  // so what a component throws is an ordinary main-thread exception —
  // and the overlay's window capture is what catches it.
  const errors = mountRouteErrors(shell);
  let inspecting = false;
  // Kept across a renderer switch the way `inspecting` is, so a toggle
  // that is on stays on when the app underneath it is rebuilt.
  let logging = false;
  let hovered: string | null = null;
  const picker = createNodePicker({ host: shell.preview, hovered: () => hovered });

  const start = (
    renderer: RendererChoice
  ): { dispose: () => void; setInspector(enabled: boolean): void; setActionLog(enabled: boolean): void } => {
    const report = createFrameReporter(shell, 'Main thread', renderer);
    shell.setStatus(`Starting the single-threaded app on ${describeRenderer(renderer)}…`);
    // One application worker for the whole layer: two channels over
    // two named ports on the same thread.
    //
    // Tapped on the way past, which is what the action log records: the
    // recorder sits on the ports the replicas were going to use anyway,
    // so nothing gains a thread hop and nothing above it can tell. Both
    // the log and its panel belong to this mount rather than to the
    // route, because a renderer switch rebuilds the replicas and a
    // timeline that outlived them would offer to rewind ports that are
    // gone.
    const actions = createActionLog();
    const dataWorker = actions.tap(
      workerHandle(
        () => new Worker(new URL('../HeavyWorker.ts', import.meta.url), { type: 'module', name: workerName() })
      ),
      [Ticker, Heavy]
    );
    const actionPanel = mountActionLogPanel(shell.preview, actions);
    actionPanel.setVisible(logging);
    const builder = createApp(FrameworkDemoRoot)
      .useService(DemoCounter)
      .useChannel(Heavy, { worker: dataWorker })
      .useChannel(Ticker, { worker: dataWorker })
      .renderer(renderer)
      .onFrame(metrics => {
        report(metrics);
        profiler.report(metrics);
      })
      .onInspect(inspection => {
        hovered = inspection?.id ?? null;
        inspectorPanel.set(inspection);
      })
      // The two the runtime swallows on this thread as well: a
      // renderer that cannot draw, and a listener that threw. An
      // exception nothing catches needs no wiring here — it is an
      // ordinary main-thread error, and the overlay is listening for
      // those on the window.
      .onError(errors.report);
    const dispose = builder.mountSync(shell.preview);
    if (inspecting) {
      builder.setInspector(true);
    }
    // The one route whose action log the panel can show: the log is
    // here, on the ports, and the panel is sent each entry.
    const disconnectDevtools = connectRouteDevtools(builder, 'framework-sync', { actions, picker });
    return {
      dispose: () => {
        disconnectDevtools();
        dispose();
        actionPanel.dispose();
        actions.dispose();
      },
      setInspector: enabled => builder.setInspector(enabled),
      setActionLog: enabled => actionPanel.setVisible(enabled)
    };
  };

  let app = start(loadRendererChoice());
  addInspectAction(shell, enabled => {
    inspecting = enabled;
    app.setInspector(enabled);
  });
  addProfileAction(shell, enabled => profiler.setVisible(enabled));
  addToggleAction(shell, { off: 'Action log', on: 'Hide action log' }, enabled => {
    logging = enabled;
    app.setActionLog(enabled);
  });
  addRendererAction(shell, choice => {
    app.dispose();
    app = start(choice);
  });
  addBlockAction(shell);
  const closeDevtools = addDevtoolsAction(shell);

  return () => {
    closeDevtools();
    app.dispose();
    picker.dispose();
    inspectorPanel.dispose();
    profiler.dispose();
    errors.dispose();
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
  // The pair that makes the thread model visible. Frame gap is measured
  // on the rendering thread and is blind to a shell too busy to forward
  // an event; input latency starts where the event arrived. Blocking
  // the main thread moves one of these and not the other.
  let worstInput = 0;
  let inputSamples = 0;
  // Peak rather than latest: patches and environment run on a small
  // minority of frames, so sampling the current frame would almost
  // always show them as idle even when they are doing the work.
  const worstPhase: Record<string, number> = {};
  // Steady-state render cost: the mean over the report window, so the
  // Canvas2D and WebGPU backends can be compared on the same screen.
  let renderSum = 0;
  let renderCount = 0;
  const gpuSum = { prepare: 0, upload: 0, encode: 0 };

  return metrics => {
    frames++;
    // Measured on the rendering thread's clock. Across a worker
    // boundary the messages queue behind a blocked main thread and
    // arrive together, so only these timestamps reveal a real stall.
    if (previousFrameAt !== null) {
      worstGap = Math.max(worstGap, metrics.at - previousFrameAt);
    }
    previousFrameAt = metrics.at;
    if (metrics.inputLatencyMs !== null) {
      worstInput = Math.max(worstInput, metrics.inputLatencyMs);
      inputSamples++;
    }
    for (const [name, ms] of Object.entries(metrics.phases)) {
      worstPhase[name] = Math.max(worstPhase[name] ?? 0, ms);
    }
    if (metrics.phases.render > 0) {
      renderSum += metrics.phases.render;
      renderCount++;
      if (metrics.gpu !== null) {
        gpuSum.prepare += metrics.gpu.prepare;
        gpuSum.upload += metrics.gpu.upload;
        gpuSum.encode += metrics.gpu.encode;
      }
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
    const meanRender = renderCount > 0 ? renderSum / renderCount : 0;
    const gpuText =
      metrics.gpu !== null && renderCount > 0
        ? ` (prepare ${(gpuSum.prepare / renderCount).toFixed(2)} · upload ${(gpuSum.upload / renderCount).toFixed(2)} · encode ${(gpuSum.encode / renderCount).toFixed(2)})`
        : '';
    // Leading, because the status line clips to one line and this is
    // the number the route exists to show.
    const inputText = inputSamples === 0 ? 'Input —' : `Input ${worstInput.toFixed(0)}ms worst`;
    shell.setStatus(
      `${inputText} · Render ${meanRender.toFixed(2)}ms mean${gpuText} · worst · ` +
        Object.entries(worstPhase)
          .map(([name, ms]) => `${name} ${ms.toFixed(2)}ms`)
          .join(' · ')
    );
    renderSum = 0;
    renderCount = 0;
    gpuSum.prepare = gpuSum.upload = gpuSum.encode = 0;
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
