import { createApp } from '@gesso/framework';
import { mountShell } from '../shell/AppShell';
import { mountRouteErrors } from '../shell/errors';

/**
 * Runs the notes example in a render worker behind the shared page
 * chrome. The example itself is `examples/NotesExampleApp.tsx`.
 */
export function mountNotesExampleRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'example-notes', metrics: true });
  const errors = mountRouteErrors(shell);
  let frames = 0;
  let lastReport = performance.now();
  let framesAtLastReport = 0;

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    renderWorker: () => new Worker(new URL('../examples/NotesExampleWorker.ts', import.meta.url), { type: 'module' }),
    // The notebook itself: repository, rules and shaping, on their own
    // thread. The shell wires the two workers together and then has
    // nothing more to do with either.
    appLogicWorker: () =>
      new Worker(new URL('../examples/notes/NotesAppWorker.ts', import.meta.url), { type: 'module' }),
    onFrame: metrics => {
      frames++;
      const now = performance.now();
      if (now - lastReport < 500) {
        return;
      }
      const fps = ((frames - framesAtLastReport) * 1000) / (now - lastReport);
      lastReport = now;
      framesAtLastReport = frames;
      shell.setMetrics([
        { label: 'Thread', value: 'Render worker' },
        { label: 'Frames', value: String(frames) },
        { label: 'FPS', value: fps.toFixed(0) },
        { label: 'Frame', value: `${metrics.durationMs.toFixed(1)} ms` }
      ]);
    },
    onError: errors.report
  });
  shell.setStatus('Source: apps/playground/src/examples/NotesExampleApp.tsx — click into the text and type.');
  shell.setDetail('Text editing with caret, selection, IME composition and clipboard, in the render worker.');
  const dispose = app.mount(shell.preview);

  return () => {
    dispose();
    errors.dispose();
    shell.dispose();
  };
}
