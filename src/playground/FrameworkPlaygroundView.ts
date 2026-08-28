import { createApp } from '../framework';
import { DemoStore, FrameworkDemoRoot } from './FrameworkPlayground';

/**
 * Route that proves the framework layer works end-to-end.
 *
 * Uses the single-thread bootstrapper (`createApp().useStore().mount()`)
 * created in Phase 3. The app owns the component runtime, the local
 * store, the graph, the scheduler, and the Canvas2D renderer. Two
 * counters auto-increment every second: one using local `@State()` and
 * one using a dispatched store action.
 *
 * Returns a dispose function so the hash router can swap routes.
 */
export function mountFrameworkPlayground(host: HTMLElement): () => void {
  host.innerHTML = renderTemplate();

  const preview = requireElement('.pg-preview');
  const disposeApp = createApp(FrameworkDemoRoot).useStore(DemoStore).mount(preview);

  return () => {
    disposeApp();
  };
}

function renderTemplate(): string {
  return `
  <div class="pg-app">
    <header class="pg-header">
      <span class="pg-title">Framework Playground</span>
      <nav class="pg-nav">
        <a class="pg-link" href="#debug">DOM boxes</a>
        <a class="pg-link" href="#canvas">Canvas render</a>
        <a class="pg-link" href="#framework">Framework</a>
        <a class="pg-link" href="#binding">Bindings</a>
        <a class="pg-link" href="#theme">Theme</a>
        <a class="pg-link" href="#webgpu">WebGPU</a>
        <a class="pg-link" href="#compare">Compare</a>
        <a class="pg-link" href="#benchmark">Benchmark</a>
      </nav>
    </header>
    <main class="pg-main">
      <section class="pg-preview"></section>
    </main>
    <footer class="pg-debug">
      <div class="pg-status">Click +1 and Add: local state, store dispatch, and a keyed component list.</div>
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
