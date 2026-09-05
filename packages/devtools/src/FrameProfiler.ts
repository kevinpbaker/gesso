import { UI_FRAME_PHASES, type FrameMetrics, type UiFramePhase } from '@gesso/framework';

/**
 * The frame profiler (`ROADMAP.md` F7): where a frame's time went, over
 * the last few seconds, as a picture.
 *
 * The timings have existed since L7 and the playground has been showing
 * them as one clipped line of text, which is enough to read a number
 * off and not enough to see a shape. A stall, a phase that only wakes
 * on some frames, a render that grew when a route changed: all three
 * are obvious in a strip of bars and invisible in a running average.
 *
 * It draws into a small canvas rather than a div per bar, because at 60
 * frames a second a DOM per frame is more main-thread work than the
 * thing being profiled. For the same reason it redraws on a timer
 * rather than on every frame: the history is kept per frame, the
 * picture is repainted a few times a second.
 */
export interface FrameProfiler {
  /** Feed it every frame. Cheap: it appends and returns. */
  report(metrics: FrameMetrics): void;
  /** Shows or hides the panel. Hidden panels stop redrawing. */
  setVisible(visible: boolean): void;
  readonly visible: boolean;
  dispose(): void;
}

export interface FrameProfilerOptions {
  /** How many frames the strip holds. Default 180, about three seconds. */
  readonly history?: number;
  /** How often the picture is repainted, in milliseconds. Default 250. */
  readonly redrawMs?: number;
  readonly corner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /**
   * `floating` (the default) sits in a corner over the application;
   * `docked` fills its host, for a panel that is not over anything.
   */
  readonly layout?: 'floating' | 'docked';
}

/** One bar's worth of history. */
export interface FrameSample {
  readonly phases: Readonly<Record<UiFramePhase, number>>;
  readonly total: number;
  /** Gap since the previous frame, on the rendering thread's clock. */
  readonly gap: number;
  readonly input: number | null;
}

/**
 * A colour per phase.
 *
 * Ordered as the phases run, and deliberately not a gradient: the
 * question a strip answers is "which phase is that", so the bands have
 * to be told apart at four pixels wide.
 */
const PHASE_COLORS: Record<UiFramePhase, string> = {
  ticks: '#d2a8ff',
  patches: '#79c0ff',
  environment: '#56d364',
  virtualize: '#e3b341',
  layout: '#f0883e',
  semantics: '#ff7b72',
  render: '#a5d6ff'
};

/** Above this, a frame missed a 60 Hz deadline. */
const BUDGET_MS = 16.7;

export function mountFrameProfiler(host: HTMLElement, options: FrameProfilerOptions = {}): FrameProfiler {
  const doc = host.ownerDocument;
  const view = doc.defaultView;
  const capacity = options.history ?? 180;
  const redrawMs = options.redrawMs ?? 250;

  const docked = options.layout === 'docked';
  const position = docked ? 'relative' : (view?.getComputedStyle(host).position ?? 'static');
  const restore = position === 'static' ? host.style.position : null;
  if (position === 'static') {
    host.style.position = 'relative';
  }

  const container = doc.createElement('div');
  const root = container.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = STYLES;
  const panel = doc.createElement('div');
  panel.className = docked ? 'panel docked' : `panel ${options.corner ?? 'top-right'}`;
  panel.hidden = true;
  const readout = doc.createElement('div');
  readout.className = 'readout';
  const strip = doc.createElement('canvas');
  strip.className = 'strip';
  strip.width = capacity * 2;
  strip.height = 96;
  const legend = doc.createElement('div');
  legend.className = 'legend';
  panel.append(readout, strip, legend);
  root.append(style, panel);
  host.appendChild(container);

  const samples: FrameSample[] = [];
  let previousAt: number | null = null;
  let visible = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const draw = (): void => {
    const ctx = strip.getContext('2d');
    if (ctx === null || samples.length === 0) {
      return;
    }
    const width = strip.width;
    const height = strip.height;
    ctx.clearRect(0, 0, width, height);
    // The scale follows the worst frame in view rather than the budget,
    // so a strip of 40 ms frames is still legible; the budget line says
    // where 60 Hz was.
    const peak = Math.max(BUDGET_MS, ...samples.map(sample => sample.total));
    const barWidth = width / capacity;
    samples.forEach((sample, index) => {
      const x = index * barWidth;
      let y = height;
      for (const phase of UI_FRAME_PHASES) {
        const ms = sample.phases[phase];
        if (ms <= 0) {
          continue;
        }
        const bar = (ms / peak) * height;
        ctx.fillStyle = PHASE_COLORS[phase];
        ctx.fillRect(x, y - bar, Math.max(1, barWidth - 0.5), bar);
        y -= bar;
      }
    });
    const budgetY = height - (BUDGET_MS / peak) * height;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, budgetY + 0.5);
    ctx.lineTo(width, budgetY + 0.5);
    ctx.stroke();

    const totals = summarize(samples);
    readout.textContent = '';
    readout.append(
      stat(doc, 'fps', totals.fps.toFixed(0)),
      stat(doc, 'frame', `${totals.meanTotal.toFixed(2)} ms`),
      stat(doc, 'worst', `${totals.worstTotal.toFixed(1)} ms`),
      stat(doc, 'gap', `${totals.worstGap.toFixed(0)} ms`),
      stat(doc, 'input', totals.worstInput === null ? '—' : `${totals.worstInput.toFixed(0)} ms`),
      stat(doc, 'peak', `${peak.toFixed(1)} ms`)
    );
    legend.textContent = '';
    for (const phase of UI_FRAME_PHASES) {
      const worst = totals.worstPhase[phase];
      // A phase that never had work in the whole window is dropped
      // rather than printed as a zero: `L7` made "0 means it never ran"
      // true, and a legend full of zeroes hides the two that matter.
      if (worst <= 0) {
        continue;
      }
      const entry = doc.createElement('span');
      entry.className = 'entry';
      const swatch = doc.createElement('i');
      swatch.style.background = PHASE_COLORS[phase];
      entry.append(swatch, doc.createTextNode(`${phase} ${worst.toFixed(2)}`));
      legend.append(entry);
    }
  };

  return {
    report(metrics) {
      const gap = previousAt === null ? 0 : metrics.at - previousAt;
      previousAt = metrics.at;
      samples.push({
        phases: metrics.phases,
        total: metrics.durationMs,
        gap,
        input: metrics.inputLatencyMs
      });
      if (samples.length > capacity) {
        samples.splice(0, samples.length - capacity);
      }
    },
    get visible() {
      return visible;
    },
    setVisible(next) {
      if (visible === next) {
        return;
      }
      visible = next;
      panel.hidden = !next;
      if (next) {
        draw();
        timer = setInterval(draw, redrawMs);
      } else if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
    dispose() {
      if (timer !== null) {
        clearInterval(timer);
      }
      container.remove();
      if (restore !== null) {
        host.style.position = restore;
      }
    }
  };
}

export interface FrameSummary {
  readonly fps: number;
  readonly meanTotal: number;
  readonly worstTotal: number;
  readonly worstGap: number;
  readonly worstInput: number | null;
  readonly worstPhase: Record<UiFramePhase, number>;
}

/**
 * The window's numbers.
 *
 * Peak rather than mean for the phases, for the reason the playground's
 * status line already gives: patches and environment run on a small
 * minority of frames, so a mean would report them as idle on exactly
 * the frames where they were the cost.
 */
export function summarize(samples: readonly FrameSample[]): FrameSummary {
  const worstPhase = { ticks: 0, patches: 0, environment: 0, virtualize: 0, layout: 0, semantics: 0, render: 0 };
  let totalSum = 0;
  let worstTotal = 0;
  let worstGap = 0;
  let worstInput: number | null = null;
  let gapSum = 0;
  let gaps = 0;
  for (const sample of samples) {
    totalSum += sample.total;
    worstTotal = Math.max(worstTotal, sample.total);
    if (sample.gap > 0) {
      worstGap = Math.max(worstGap, sample.gap);
      gapSum += sample.gap;
      gaps++;
    }
    if (sample.input !== null) {
      worstInput = Math.max(worstInput ?? 0, sample.input);
    }
    for (const phase of UI_FRAME_PHASES) {
      worstPhase[phase] = Math.max(worstPhase[phase], sample.phases[phase]);
    }
  }
  return {
    // From the gaps between frames rather than from a wall clock: the
    // profiler may be fed from a worker, where the only honest measure
    // of when a frame happened is the timestamp that frame carries.
    fps: gaps === 0 ? 0 : 1000 / (gapSum / gaps),
    meanTotal: samples.length === 0 ? 0 : totalSum / samples.length,
    worstTotal,
    worstGap,
    worstInput,
    worstPhase
  };
}

function stat(doc: Document, label: string, value: string): HTMLElement {
  const element = doc.createElement('span');
  element.className = 'stat';
  const name = doc.createElement('i');
  name.textContent = label;
  element.append(name, doc.createTextNode(value));
  return element;
}

const STYLES = `
:host { all: initial; }
.panel {
  position: absolute;
  z-index: 2147482000;
  width: 300px;
  pointer-events: none;
  margin: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(13, 17, 23, 0.94);
  color: #e6edf3;
  font: 10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.panel[hidden] { display: none; }
.panel.docked { position: static; width: auto; margin: 0; pointer-events: auto; border: none; background: transparent; }
.panel.docked .strip { height: 96px; }
.top-left { top: 0; left: 0; }
.top-right { top: 0; right: 0; }
.bottom-left { bottom: 0; left: 0; }
.bottom-right { bottom: 0; right: 0; }
.strip { display: block; width: 100%; height: 48px; margin: 6px 0; }
.readout { display: flex; flex-wrap: wrap; gap: 2px 10px; }
.stat i { color: #8b949e; font-style: normal; margin-right: 4px; }
.legend { display: flex; flex-wrap: wrap; gap: 2px 8px; color: #8b949e; }
.entry { display: inline-flex; align-items: center; gap: 3px; }
.entry i { width: 7px; height: 7px; border-radius: 2px; display: inline-block; }
`;
