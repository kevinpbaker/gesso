import { BehaviorSubject } from 'rxjs';

import { UiNodeType } from '../ui/graph/UiNodeType';
import type { PlaygroundMetrics, PlaygroundNodeInfo } from './LayoutPlayground';
import type { PlaygroundDirection, PlaygroundState } from './PlaygroundState';

/**
 * The parts of the playground page shared by both routes: the
 * control sidebar, the metrics footer and the navigation header.
 *
 * Each view (DOM debug boxes vs. the real canvas renderer) mounts
 * the shell, appends its own visualizer into `preview`, and reports
 * frame output through updateMetrics / updateScrollStats /
 * updateSelected.
 */
export interface PlaygroundShell {
  /** Container the view-specific visualizer is appended into. */
  readonly preview: HTMLElement;
  updateMetrics(metrics: PlaygroundMetrics): void;
  updateScrollStats(text: string): void;
  updateSelected(text: string): void;
}

export function mountPlaygroundShell(host: HTMLElement, state: PlaygroundState): PlaygroundShell {
  host.innerHTML = renderShellTemplate();
  wireControls(state);
  const shell: PlaygroundShell = {
    preview: requireElement('.pg-preview'),
    updateMetrics,
    updateScrollStats,
    updateSelected: text => setText('#pg-selected', text)
  };
  return shell;
}

/**
 * Formats the scroll-view status line for the debug footer.
 */
export function scrollStatsText(info: PlaygroundNodeInfo[]): string {
  const scroll = info.find(entry => entry.node.type === UiNodeType.ScrollView);
  if (scroll === undefined || scroll.record === undefined) {
    return '\u2014';
  }
  const rec = scroll.record;
  return (
    `viewport ${Math.round(rec.width)}x${Math.round(rec.height)} \u00b7 ` +
    `content ${Math.round(rec.contentWidth)}x${Math.round(rec.contentHeight)} \u00b7 ` +
    `offset ${Math.round(rec.scrollX)},${Math.round(rec.scrollY)}`
  );
}

function renderShellTemplate(): string {
  return `
  <div class="pg-app">
    <header class="pg-header">
      <span class="pg-title">Layout Playground</span>
      <nav class="pg-nav">
        <a class="pg-link" href="#debug">DOM boxes</a>
        <a class="pg-link" href="#canvas">Canvas render</a>
        <a class="pg-link" href="#binding">Bindings</a>
      </nav>
    </header>
    <main class="pg-main">
      <aside class="pg-controls">
        <section class="pg-group">
          <h3>Root</h3>
          <label class="pg-check"><input id="pg-fit" type="checkbox"> Fit preview</label>
          <label>Width <input id="pg-width" type="number" min="0"></label>
          <label>Height <input id="pg-height" type="number" min="0"></label>
          <label>Padding <input id="pg-padding" type="number" min="0"></label>
          <label>Gap <input id="pg-gap" type="number" min="0"></label>
          <label>Direction
            <select id="pg-direction">
              <option value="column">Column</option>
              <option value="row">Row</option>
            </select>
          </label>
        </section>
        <section class="pg-group">
          <h3>Child row</h3>
          <label>Box A width <input id="pg-box-width" type="number" min="0"></label>
          <label>Box A height <input id="pg-box-height" type="number" min="0"></label>
          <label>Box B flex grow <input id="pg-flex" type="number" min="0" step="0.1"></label>
        </section>
        <section class="pg-group">
          <h3>Nested column</h3>
          <label>Min width <input id="pg-min-width" type="number" min="0"></label>
          <label>Max width <input id="pg-max-width" type="number" min="0"></label>
        </section>
        <section class="pg-group">
          <h3>Paint-only</h3>
          <label>Header color <input id="pg-color" type="color"></label>
        </section>
        <section class="pg-group">
          <h3>Scroll view</h3>
          <label>Scroll Y <input id="pg-scroll-y" type="range" min="0" value="0"></label>
        </section>
        <section class="pg-group">
          <h3>Keyed list</h3>
          <p>Order: <span id="pg-order"></span></p>
          <div class="pg-buttons">
            <button id="pg-order-left" type="button">Rotate left</button>
            <button id="pg-order-right" type="button">Rotate right</button>
            <button id="pg-order-reset" type="button">Reset</button>
          </div>
        </section>
        <section class="pg-group">
          <h3>Stress test</h3>
          <div class="pg-buttons">
            <button id="pg-stress-0" type="button">Off</button>
            <button id="pg-stress-1k" type="button">1k</button>
            <button id="pg-stress-5k" type="button">5k</button>
            <button id="pg-stress-10k" type="button">10k</button>
          </div>
        </section>
      </aside>
      <section class="pg-preview"></section>
    </main>
    <footer class="pg-debug">
      <div class="pg-metrics">
        <span>Nodes <b id="pg-nodes">0</b></span>
        <span>Dirty <b id="pg-dirty">0</b></span>
        <span>Frames <b id="pg-frames">0</b></span>
        <span>Layout passes <b id="pg-layout-passes">0</b></span>
        <span>Last frame <b id="pg-frame-ms">0ms</b></span>
        <span>Last layout <b id="pg-layout-ms">0ms</b></span>
        <span id="pg-scroll" class="pg-scroll">\u2014</span>
      </div>
      <div id="pg-selected" class="pg-selected">Click a box in the preview to inspect.</div>
    </footer>
  </div>`;
}

function wireControls(state: PlaygroundState): void {
  const fitPreview = requireElement('#pg-fit') as HTMLInputElement;
  const widthInput = requireElement('#pg-width') as HTMLInputElement;
  const heightInput = requireElement('#pg-height') as HTMLInputElement;
  fitPreview.checked = state.fitPreview$.getValue();
  const syncFit = (): void => {
    widthInput.disabled = fitPreview.checked;
    heightInput.disabled = fitPreview.checked;
  };
  fitPreview.addEventListener('change', () => {
    state.fitPreview$.next(fitPreview.checked);
    syncFit();
  });
  syncFit();

  bindNumber(requireElement('#pg-width'), state.width$);
  bindNumber(requireElement('#pg-height'), state.height$);
  bindNumber(requireElement('#pg-padding'), state.padding$);
  bindNumber(requireElement('#pg-gap'), state.gap$);
  bindNumber(requireElement('#pg-box-width'), state.boxWidth$);
  bindNumber(requireElement('#pg-box-height'), state.boxHeight$);
  bindNumber(requireElement('#pg-flex'), state.flexGrow$);
  bindNumber(requireElement('#pg-min-width'), state.minWidth$);
  bindNumber(requireElement('#pg-max-width'), state.maxWidth$);
  bindColor(requireElement('#pg-color'), state.color$);

  const direction = requireElement('#pg-direction') as HTMLSelectElement;
  direction.value = state.direction$.getValue();
  direction.addEventListener('change', () => {
    state.direction$.next(direction.value as PlaygroundDirection);
  });

  const scrollSlider = requireElement('#pg-scroll-y') as HTMLInputElement;
  scrollSlider.max = '180';
  state.scrollY$.subscribe(value => {
    scrollSlider.value = String(value);
  });
  scrollSlider.addEventListener('input', () => state.scrollY$.next(Number(scrollSlider.value)));

  const orderLabel = requireElement('#pg-order') as HTMLSpanElement;
  const showOrder = (): void => {
    orderLabel.textContent = state.order$.getValue().join(' ');
  };
  state.order$.subscribe(showOrder);
  requireElement('#pg-order-left').addEventListener('click', () =>
    state.order$.next(rotateOrder(state.order$.getValue(), -1))
  );
  requireElement('#pg-order-right').addEventListener('click', () =>
    state.order$.next(rotateOrder(state.order$.getValue(), 1))
  );
  requireElement('#pg-order-reset').addEventListener('click', () => state.order$.next(['a', 'b', 'c']));
  showOrder();

  bindStress(requireElement('#pg-stress-0'), state, 0);
  bindStress(requireElement('#pg-stress-1k'), state, 1000);
  bindStress(requireElement('#pg-stress-5k'), state, 5000);
  bindStress(requireElement('#pg-stress-10k'), state, 10000);
}

function updateMetrics(metrics: PlaygroundMetrics): void {
  setText('#pg-nodes', String(metrics.nodeCount));
  setText('#pg-dirty', String(metrics.dirtyCount));
  setText('#pg-frames', String(metrics.frameCount));
  setText('#pg-layout-passes', String(metrics.layoutPasses));
  setText('#pg-frame-ms', `${metrics.lastFrameMs.toFixed(2)}ms`);
  setText('#pg-layout-ms', `${metrics.lastLayoutMs.toFixed(2)}ms`);
}

function updateScrollStats(text: string): void {
  setText('#pg-scroll', text);
}

function bindNumber(input: Element, subject: BehaviorSubject<number>): void {
  const field = input as HTMLInputElement;
  field.value = String(subject.getValue());
  field.addEventListener('input', () => {
    const value = Number(field.value);
    if (Number.isFinite(value)) {
      subject.next(value);
    }
  });
}

function bindColor(input: Element, subject: BehaviorSubject<string>): void {
  const field = input as HTMLInputElement;
  field.value = subject.getValue();
  field.addEventListener('input', () => subject.next(field.value));
}

function bindStress(button: Element, state: PlaygroundState, count: number): void {
  button.addEventListener('click', () => state.stressCount$.next(count));
}

function rotateOrder(order: readonly string[], step: number): string[] {
  const next = [...order];
  const shift = ((step % next.length) + next.length) % next.length;
  for (let i = 0; i < shift; i++) {
    next.push(next.shift()!);
  }
  return next;
}

function setText(selector: string, text: string): void {
  requireElement(selector).textContent = text;
}

function requireElement(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (el === null) {
    throw new Error(`Playground element '${selector}' not found.`);
  }
  return el;
}
