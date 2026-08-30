import { createApp } from '../../framework';
import { mountShell } from '../shell/AppShell';

/**
 * Runs the animation example in a render worker behind the shared page
 * chrome. The example itself is `examples/AnimationExampleApp.tsx`.
 *
 * The metrics strip reports **the latest frame's `ticks`** rather than
 * the worst one the way the framework route does, because on this page
 * the interesting thing is watching it fall back to `0.00 ms`. It
 * always does: the frame on which the last animation finishes still
 * writes a value, that write dirties a node, and the frame that draws
 * it finds the driver empty — so the last frame of every movement
 * reports a tick phase of zero, and then no frame is scheduled at all.
 */
export function mountAnimationExampleRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'example-animation', metrics: true });
  let frames = 0;
  let lastReport = performance.now();
  let framesAtLastReport = 0;

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    worker: () => new Worker(new URL('../examples/AnimationExampleWorker.ts', import.meta.url), { type: 'module' }),
    appWorker: () => new Worker(new URL('../examples/board/BoardAppWorker.ts', import.meta.url), { type: 'module' }),
    onFrame: metrics => {
      frames++;
      const now = performance.now();
      if (now - lastReport < 250) {
        return;
      }
      const fps = ((frames - framesAtLastReport) * 1000) / (now - lastReport);
      lastReport = now;
      framesAtLastReport = frames;
      shell.setMetrics([
        { label: 'Thread', value: 'Render worker' },
        { label: 'Frames', value: String(frames) },
        { label: 'FPS', value: fps.toFixed(0) },
        { label: 'Frame', value: `${metrics.durationMs.toFixed(1)} ms` },
        { label: 'ticks', value: `${metrics.phases.ticks.toFixed(2)} ms` }
      ]);
    },
    onError: (message, stack) => {
      shell.setStatus(`Render worker error: ${message}`);
      console.error('[nodal animation example]', message, stack);
    }
  });
  shell.setStatus('Source: src/playground/examples/AnimationExampleApp.tsx — move a card and watch `ticks`.');
  shell.setDetail(
    'A card is moved by layout; `animateLayout` draws it back where it was and springs it home. ' +
      '`ticks` is the phase that advances every animation, and it reads 0.00 ms whenever the board is still — ' +
      'an idle app schedules no frames at all.'
  );
  const dispose = app.mount(shell.preview);

  return () => {
    dispose();
    shell.dispose();
  };
}
