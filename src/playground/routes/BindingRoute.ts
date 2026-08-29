import { UiAnimationFrameClock } from '../../ui/scheduler';
import { advance, BindingDemoState, createBindingDefinition } from '../BindingDemo';
import { CanvasPreview } from '../CanvasPreview';
import { LayoutPlayground } from '../LayoutPlayground';
import { mountShell } from '../shell/AppShell';
import { createPreviewCanvas, observeSize } from '../shell/dom';

const BINDING_INTERVAL_MS = 2000;

/**
 * Minimal route proving bindings reach the canvas.
 *
 * A bare scene whose BehaviorSubjects are mutated every couple of
 * seconds, so text, color, bar width, flex growth and scroll offset
 * all change through the graph-binding pipeline with no rebuild and
 * no re-render — the node count in the status bar stays put while
 * everything on screen moves.
 */
export function mountBindingRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'binding', metrics: true });

  const state = new BindingDemoState();
  const preview = new CanvasPreview(createPreviewCanvas(shell.preview, { focusable: false }));
  const playground = new LayoutPlayground({
    clock: callback => new UiAnimationFrameClock(callback),
    textMeasurer: preview.textMeasurer
  });

  playground.setOnUpdate(refresh);
  playground.build(createBindingDefinition(state));

  const size = observeSize(shell.preview, (width, height) => {
    preview.setLogicalSize(width, height, window.devicePixelRatio);
    playground.relayout(width, height);
  });

  let step = 0;
  const timer = window.setInterval(() => {
    step++;
    advance(state, step);
  }, BINDING_INTERVAL_MS);

  function refresh(): void {
    preview.render(playground.layoutRoot, playground.engine);
    const metrics = playground.metrics();
    shell.setMetrics([
      { label: 'Nodes', value: String(metrics.nodeCount) },
      { label: 'Dirty', value: String(metrics.dirtyCount) },
      { label: 'Frames', value: String(metrics.frameCount) },
      { label: 'Layouts', value: String(metrics.layoutPasses) },
      { label: 'Frame', value: `${metrics.lastFrameMs.toFixed(2)} ms` }
    ]);
    shell.setStatus(
      `${state.message$.getValue()} · color ${state.color$.getValue()} · ` +
        `bar ${state.barWidth$.getValue()}px · grow ${state.flexGrow$.getValue()} · ` +
        `scroll ${state.scrollY$.getValue()}`
    );
  }

  shell.setDetail(`Bound values change every ${BINDING_INTERVAL_MS / 1000}s. The node count does not.`);

  return () => {
    window.clearInterval(timer);
    size.stop();
    playground.dispose();
    shell.dispose();
  };
}
