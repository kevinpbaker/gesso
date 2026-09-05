import { createApp, type RendererChoice } from '@gesso/framework';
import { mountShell, type AppShell } from '../shell/AppShell';
import { mountRouteErrors } from '../shell/errors';
import { addDevtoolsAction, connectRouteDevtools } from '../shell/devtools';

/** How often the reporter is allowed to touch the DOM. */
const REPORT_INTERVAL_MS = 500;
/**
 * Where the chosen backend survives a reload.
 *
 * The same key the framework route uses, on purpose: the choice is
 * about which renderer this machine is being checked on, not about
 * which page is open, and having the two routes disagree would mean
 * checking one of them on a backend without noticing.
 */
const RENDERER_STORAGE_KEY = 'gesso.playground.renderer';

/**
 * Every modifier the library ships, one card each, in a render worker.
 *
 * `MODIFIERS_ROADMAP.md` B4's second half: the browser check for the
 * whole modifier system is one page rather than seven hunts through
 * the framework playground. The page itself is
 * `examples/ModifiersApp.tsx`; this file is only the chrome around it.
 *
 * It runs in the worker configuration on purpose. Focus, drag,
 * root-capture listeners and an anchored overlay are all things that
 * could quietly depend on being on the thread the events arrive on,
 * and this is where that would show.
 *
 * The renderer toggle is here for the same reason it is on the
 * framework route: a decoration is drawn by each backend separately,
 * so a focus ring that is right on Canvas2D says nothing about WebGPU.
 */
export function mountModifiersRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'modifiers', metrics: true });
  const errors = mountRouteErrors(shell);

  const start = (renderer: RendererChoice): { dispose: () => void } => {
    const report = createFrameReporter(shell, renderer);
    const app = createApp({
      // Written out literally so the bundler can see and split it.
      renderWorker: () => new Worker(new URL('../examples/ModifiersWorker.ts', import.meta.url), { type: 'module' }),
      renderer,
      onFrame: report,
      onError: errors.report
    });
    shell.setStatus('Source: apps/playground/src/examples/ModifiersApp.tsx. Each card says what to try.');
    shell.setDetail(
      'Hover, press, Tab, drag and rest the pointer: seven modifiers, and no wrapper component around any of them.'
    );
    const dispose = app.mount(shell.preview);
    const disconnectDevtools = connectRouteDevtools(app, 'modifiers');
    return {
      dispose: () => {
        disconnectDevtools();
        dispose();
      }
    };
  };

  let app = start(loadRendererChoice());
  addRendererAction(shell, choice => {
    app.dispose();
    app = start(choice);
  });
  const closeDevtools = addDevtoolsAction(shell);

  return () => {
    closeDevtools();
    app.dispose();
    errors.dispose();
    shell.dispose();
  };
}

interface FrameMetrics {
  durationMs: number;
  renderer: string;
}

/** Frame counts, rate, and which backend is actually drawing. */
function createFrameReporter(shell: AppShell, requested: RendererChoice): (metrics: FrameMetrics) => void {
  let frames = 0;
  let lastReport = performance.now();
  let framesAtLastReport = 0;

  return metrics => {
    frames++;
    const now = performance.now();
    if (now - lastReport < REPORT_INTERVAL_MS) {
      return;
    }
    const fps = ((frames - framesAtLastReport) * 1000) / (now - lastReport);
    lastReport = now;
    framesAtLastReport = frames;
    shell.setMetrics([
      { label: 'Thread', value: 'Render worker' },
      { label: 'Renderer', value: describeBackend(metrics.renderer, requested) },
      { label: 'Frames', value: String(frames) },
      { label: 'FPS', value: fps.toFixed(0) },
      { label: 'Frame', value: `${metrics.durationMs.toFixed(1)} ms` }
    ]);
  };
}

/** What is drawing, saying so when it is not what was asked for. */
function describeBackend(actual: string, requested: RendererChoice): string {
  if (actual === 'pending') {
    return 'starting…';
  }
  if (actual === 'webgpu') {
    return 'WebGPU';
  }
  return requested === 'canvas2d' ? 'Canvas2D' : 'Canvas2D (WebGPU unavailable)';
}

function loadRendererChoice(): RendererChoice {
  try {
    return localStorage.getItem(RENDERER_STORAGE_KEY) === 'webgpu' ? 'webgpu' : 'canvas2d';
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

/** A button that flips the backend and remounts the app on it. */
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
