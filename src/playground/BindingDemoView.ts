import { UiAnimationFrameClock } from '../ui/scheduler';
import { advance, BindingDemoState, createBindingDefinition } from './BindingDemo';
import { CanvasPreview } from './CanvasPreview';
import { LayoutPlayground } from './LayoutPlayground';

const BINDING_INTERVAL_MS = 2000;

/**
 * Minimal route proving bindings reach the canvas: a bare scene
 * whose BehaviorSubjects are mutated every couple of seconds, so
 * text, colors, bar width, flex growth and scroll offset all change
 * through the graph-binding pipeline with no rebuilds.
 *
 * Returns a dispose function so the hash router can swap routes.
 */
export function mountBindingDemo(host: HTMLElement): () => void {
  host.innerHTML = renderTemplate();

  const state = new BindingDemoState();
  const canvas = document.createElement('canvas');
  canvas.className = 'pg-canvas';
  requireElement('.pg-preview').appendChild(canvas);
  const preview = new CanvasPreview(canvas);
  const playground = new LayoutPlayground({
    clock: callback => new UiAnimationFrameClock(callback),
    textMeasurer: preview.textMeasurer
  });

  playground.setOnUpdate(refresh);
  playground.build(createBindingDefinition(state));

  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        preview.setLogicalSize(width, height, window.devicePixelRatio);
        playground.relayout(width, height);
      }
    }
  });
  resizeObserver.observe(requireElement('.pg-preview'));

  let step = 0;
  const timer = window.setInterval(() => {
    step++;
    advance(state, step);
  }, BINDING_INTERVAL_MS);

  function refresh(): void {
    preview.render(playground.layoutRoot, playground.engine);
    updateStatus();
  }

  function updateStatus(): void {
    setText(
      '#bd-values',
      `${state.message$.getValue()} \u00b7 color ${state.color$.getValue()} \u00b7 ` +
        `bar ${state.barWidth$.getValue()}px \u00b7 grow ${state.flexGrow$.getValue()} \u00b7 ` +
        `scroll ${state.scrollY$.getValue()}`
    );
    const metrics = playground.metrics();
    setText(
      '#bd-metrics',
      `Nodes ${metrics.nodeCount} \u00b7 Dirty ${metrics.dirtyCount} \u00b7 Frames ${metrics.frameCount} \u00b7 ` +
        `Layout passes ${metrics.layoutPasses} \u00b7 Frame ${metrics.lastFrameMs.toFixed(2)}ms`
    );
  }

  return () => {
    window.clearInterval(timer);
    resizeObserver.disconnect();
    playground.dispose();
  };
}

function renderTemplate(): string {
  return `
  <div class="pg-app">
    <header class="pg-header">
      <span class="pg-title">Binding Demo</span>
      <nav class="pg-nav">
        <a class="pg-link" href="#debug">DOM boxes</a>
        <a class="pg-link" href="#canvas">Canvas render</a>
        <a class="pg-link" href="#binding">Bindings</a>
      </nav>
    </header>
    <main class="pg-main">
      <section class="pg-preview"></section>
    </main>
    <footer class="pg-debug">
      <div id="bd-values" class="pg-status">\u2014</div>
      <div id="bd-metrics" class="pg-status pg-status-dim">\u2014</div>
    </footer>
  </div>`;
}

function setText(selector: string, text: string): void {
  requireElement(selector).textContent = text;
}

function requireElement(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (el === null) {
    throw new Error(`Binding demo element '${selector}' not found.`);
  }
  return el;
}
