import type { FrameMetrics, UiNodeReport, WorkerApp } from 'gesso-framework';

/**
 * The proof strip: a bar of instruments above a worker application,
 * and the only part of it that is DOM on the main thread.
 *
 * On purpose. The claim a worker application makes is that the main
 * thread is not doing the work, and numbers the render worker prints on
 * its own canvas are numbers a stranger has no reason to believe. So the
 * readout lives where the doubt lives. Block this thread and the strip
 * stops dead — the pulse freezes, the button stays pressed — while the
 * two threads behind it carry on, because the application is not here.
 *
 * What it has:
 *
 *   - **a pulse**, driven by this thread's own `requestAnimationFrame`,
 *     which stops the moment the thread is busy;
 *   - **a block button**, which holds this thread in a busy loop for a
 *     few seconds and records when, on the render worker's clock, so
 *     frames drawn *inside* the block can be told from those either side;
 *   - **the render worker's readout**: its frame rate and worst gap over
 *     the last second, and the median work a frame cost;
 *   - **this thread's frame rate**, which drops to nothing in a block;
 *   - with `layout`, **the engine's layout heatmap** and a count of the
 *     nodes each frame re-measured, for an application whose claim is
 *     about measuring less.
 *
 * And a recording for a script: `globalThis[options.global]` has the
 * last two thousand frames, a reset, and the last block's window. A
 * budget check reads the same numbers the strip is showing, rather than
 * a measurement it installed for itself.
 *
 * Made out of gessosheet's and gessologic's strips, which had been
 * copied from one to the other and changed a little. The one thing
 * gessologic's copy found that is worth knowing before writing a check
 * against this: count frames inside `lastBlock()`, not the whole
 * recording. A count of the whole recording takes in the frames drawn
 * just before and after a block, and passes a render worker that drew
 * nothing at all through it.
 *
 *   const panel = proofPanel(host, { global: 'myAppProof' });
 *   const app = createApp({ ...panel.options });
 *   panel.attach(app);
 *   app.mount(host);
 *
 * Built before `createApp`, because `onFrame` is a constructor option,
 * and inserted before the host so the canvas measures its final size.
 */

export interface ProofPanelOptions {
  /** The global the recording is published on. Default `'gessoProof'`. */
  readonly global?: string;
  /** How long the block button holds the thread, in milliseconds. Default 5,000. */
  readonly blockMs?: number;
  /** Add the layout heatmap toggle and the re-measured count. Default false. */
  readonly layout?: boolean;
}

/** One frame, as a budget check reads it. */
export interface ProofFrame {
  /** When the render worker finished it, on the render worker's clock. */
  readonly at: number;
  readonly durationMs: number;
  readonly measured: number;
  readonly nodes: number;
  readonly inputLatencyMs: number | null;
  /** Which backend drew, and where the frame's time went. */
  readonly renderer: string;
  readonly phases: Record<string, number>;
  readonly gpu: Record<string, number> | null;
}

/** What a script reads off the global. */
export interface ProofHandle {
  frames(): readonly ProofFrame[];
  reset(): void;
  /** The last block, on the render worker's clock; null before one. */
  lastBlock(): ProofBlock | null;
}

export interface ProofBlock {
  readonly start: number;
  readonly end: number;
}

/** The rolling readout: over the last second of frames, or `idle` when there were none lately. */
export type ProofReadout =
  | { readonly idle: true }
  | { readonly idle: false; readonly fps: number; readonly worstGapMs: number; readonly medianWorkMs: number };

/** How many frames the recording keeps for a script to read back. */
export const PROOF_RECORDING = 2_000;

/**
 * How far back the rolling readout looks, in milliseconds.
 *
 * A time window and not a count of frames: an idle Gesso application
 * draws nothing at all, so a window of the last ninety frames held
 * frames from however long ago the last interaction was, and reported a
 * scroll running at sixty as three.
 */
const RECENT_MS = 1_000;

/** Past this since the last frame, the readout says idle rather than a rate that reads as a stall. */
const IDLE_AFTER_MS = 400;

/**
 * The strip's arithmetic, without the DOM: frames in, readout and
 * recording out.
 *
 * Every time is the render worker's. A frame is stamped when the worker
 * finished it, and those stamps survive a blocked main thread, which
 * receives the whole block's frames in one burst when it comes back; a
 * readout that timed its own arrivals would report a stall that never
 * happened, about the wrong thread. This thread's clock is translated
 * onto the worker's with an offset learned from every frame, because a
 * worker's `performance.now()` counts from the worker's creation.
 */
export class ProofRecording implements ProofHandle {
  private readonly recorded: ProofFrame[] = [];
  private readonly finishes: number[] = [];
  private readonly costs: number[] = [];
  private offset: number | null = null;
  private block: ProofBlock | null = null;
  private peak = 0;

  constructor(private readonly hostNow: () => number = () => performance.now()) {}

  /** Takes a frame from the runtime's `onFrame`. */
  frame(metrics: FrameMetrics): void {
    this.offset = this.hostNow() - metrics.at;
    this.recorded.push({
      at: metrics.at,
      durationMs: metrics.durationMs,
      measured: metrics.measured,
      nodes: metrics.nodes,
      inputLatencyMs: metrics.inputLatencyMs,
      renderer: metrics.renderer,
      phases: { ...metrics.phases },
      gpu: metrics.gpu === null ? null : { ...metrics.gpu }
    });
    if (this.recorded.length > PROOF_RECORDING) {
      this.recorded.shift();
    }
    this.finishes.push(metrics.at);
    this.costs.push(metrics.durationMs);
    while (this.finishes.length > 1 && metrics.at - this.finishes[0]! > RECENT_MS) {
      this.finishes.shift();
      this.costs.shift();
    }
    this.peak = Math.max(this.peak, metrics.measured);
  }

  /** Now, on the render worker's clock. */
  workerNow(): number {
    return this.hostNow() - (this.offset ?? 0);
  }

  /** Records a block this thread held from `start` to `end`, on its own clock. */
  blocked(start: number, end: number): void {
    const offset = this.offset ?? 0;
    this.block = { start: start - offset, end: end - offset };
  }

  readout(): ProofReadout {
    const last = this.finishes.at(-1);
    const first = this.finishes[0];
    if (last === undefined || first === undefined || last <= first || this.workerNow() - last > IDLE_AFTER_MS) {
      return { idle: true };
    }
    let worst = 0;
    for (let i = 1; i < this.finishes.length; i++) {
      worst = Math.max(worst, this.finishes[i]! - this.finishes[i - 1]!);
    }
    const sorted = [...this.costs].sort((a, b) => a - b);
    return {
      idle: false,
      fps: Math.round(((this.finishes.length - 1) / (last - first)) * 1000),
      worstGapMs: worst,
      medianWorkMs: sorted[Math.floor(sorted.length / 2)]!
    };
  }

  /** The most nodes any frame since the last reset re-measured. */
  peakMeasured(): number {
    return this.peak;
  }

  frames(): readonly ProofFrame[] {
    return this.recorded;
  }

  lastBlock(): ProofBlock | null {
    return this.block;
  }

  reset(): void {
    this.recorded.length = 0;
    this.finishes.length = 0;
    this.costs.length = 0;
    this.peak = 0;
  }
}

/**
 * Puts the strip before `host` and wires it; returns the options the
 * application has to be created with, and the function that attaches the
 * controls to it once it exists.
 */
export function proofPanel(
  host: HTMLElement,
  options: ProofPanelOptions = {}
): {
  readonly recording: ProofRecording;
  readonly options: { onFrame: (metrics: FrameMetrics) => void; onInspect?: (report: UiNodeReport | null) => void };
  readonly attach: (app: WorkerApp) => void;
} {
  const blockMs = options.blockMs ?? 5_000;
  const layout = options.layout === true;
  const doc = host.ownerDocument;
  const view = doc.defaultView ?? globalThis;
  build(host, blockMs, layout);
  const find = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const found = doc.getElementById(`gesso-proof-${id}`);
    if (found === null) {
      throw new Error(`The proof strip has no #gesso-proof-${id} element.`);
    }
    return found as T;
  };
  const pulse = find('pulse');
  const block = find<HTMLButtonElement>('block');
  const fpsOut = find('fps');
  const gapOut = find('gap');
  const workOut = find('work');
  const mainOut = find('mainfps');

  const recording = new ProofRecording();
  (globalThis as Record<string, unknown>)[options.global ?? 'gessoProof'] = recording;

  const onFrame = (metrics: FrameMetrics): void => {
    recording.frame(metrics);
    if (layout) {
      find('measured').textContent = String(metrics.measured);
      find('peak').textContent = String(recording.peakMeasured());
    }
  };

  // The pulse, this thread's frame rate and the readout, all on this
  // thread's animation frame, so all three stop together when it is
  // blocked — in front of an application that has not.
  let mainFrames = 0;
  let sampledAt = view.performance.now();
  const tick = (now: number): void => {
    mainFrames++;
    pulse.style.opacity = String(0.35 + 0.65 * Math.abs(Math.sin(now / 350)));
    if (now - sampledAt >= 500) {
      mainOut.textContent = String(Math.round((mainFrames / (now - sampledAt)) * 1000));
      mainFrames = 0;
      sampledAt = now;
      const readout = recording.readout();
      fpsOut.textContent = readout.idle ? 'idle' : String(readout.fps);
      gapOut.textContent = readout.idle ? '—' : `${readout.worstGapMs.toFixed(1)}ms`;
      workOut.textContent = readout.idle ? '—' : `${readout.medianWorkMs.toFixed(1)}ms`;
    }
    view.requestAnimationFrame(tick);
  };
  view.requestAnimationFrame(tick);

  const attach = (app: WorkerApp): void => {
    // A busy loop and not a sleep: the point is that this thread has no
    // turn to give anybody. The label is repainted and a frame yielded
    // before the loop starts, or the only evidence would be a button
    // that never looked pressed.
    block.addEventListener('click', () => {
      block.disabled = true;
      block.textContent = `Blocking for ${blockMs / 1000}s…`;
      pulse.classList.add('blocked');
      view.requestAnimationFrame(() =>
        view.requestAnimationFrame(() => {
          const start = view.performance.now();
          const until = start + blockMs;
          while (view.performance.now() < until) {
            /* Holding the thread. That is the whole experiment. */
          }
          recording.blocked(start, view.performance.now());
          block.disabled = false;
          block.textContent = `Block the main thread for ${blockMs / 1000}s`;
          pulse.classList.remove('blocked');
        })
      );
    });
    if (layout) {
      const heatmap = find<HTMLInputElement>('heatmap');
      const explain = find('explain');
      heatmap.addEventListener('change', () => {
        app.setInspector(heatmap.checked);
        explain.hidden = !heatmap.checked;
        if (!heatmap.checked) {
          explain.textContent = '';
        }
      });
    }
  };

  const onInspect = (report: UiNodeReport | null): void => {
    const heatmap = find<HTMLInputElement>('heatmap');
    const explain = find('explain');
    if (!heatmap.checked) {
      return;
    }
    if (report === null) {
      explain.textContent = 'Point at something.';
      return;
    }
    const { x, y, width, height } = report.box;
    const label = report.semantics?.label;
    explain.textContent =
      `${report.type}${label === undefined ? '' : ` "${label}"`} ` +
      `— ${width.toFixed(1)}x${height.toFixed(1)} at ${x.toFixed(1)},${y.toFixed(1)}\n\n` +
      report.explanation;
  };

  return { recording, options: layout ? { onFrame, onInspect } : { onFrame }, attach };
}

const STYLES = `
  body { display: flex; flex-direction: column; }
  body > .gesso-proof-host { flex: 1; min-height: 0; height: auto !important; }
  #gesso-proof {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 6px 10px; background: #22242a; color: #d7d9e0;
    border-bottom: 1px solid #000; font: 13px system-ui, sans-serif;
  }
  #gesso-proof button {
    font: inherit; padding: 4px 9px; border-radius: 5px;
    border: 1px solid #4a4d57; background: #32353e; color: #e8eaf0; cursor: pointer;
  }
  #gesso-proof button:hover { background: #3d414c; }
  #gesso-proof label { display: flex; align-items: center; gap: 5px; cursor: pointer; }
  #gesso-proof .stat { font-variant-numeric: tabular-nums; white-space: nowrap; }
  #gesso-proof .stat b { color: #fff; font-weight: 600; }
  #gesso-proof .sep { width: 1px; align-self: stretch; background: #4a4d57; }
  #gesso-proof-pulse { width: 12px; height: 12px; border-radius: 50%; background: #5ec26a; }
  #gesso-proof-pulse.blocked { background: #d4564f; }
  #gesso-proof-explain {
    position: fixed; right: 12px; bottom: 12px; z-index: 1; margin: 0; padding: 9px 11px;
    max-width: min(680px, calc(100vw - 24px)); max-height: 42vh; overflow: auto;
    pointer-events: none; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: pre-wrap; background: #16171bf2; color: #b9bdc7;
    border: 1px solid #3a3d46; border-radius: 6px; box-shadow: 0 6px 24px #0006;
  }
  #gesso-proof-explain[hidden] { display: none; }
`;

/** The strip, in the order a person reads it, before the host so the canvas measures its final size. */
function build(host: HTMLElement, blockMs: number, layout: boolean): void {
  const doc = host.ownerDocument;
  const styles = doc.createElement('style');
  styles.textContent = STYLES;
  doc.head.append(styles);
  host.classList.add('gesso-proof-host');

  const strip = doc.createElement('div');
  strip.id = 'gesso-proof';
  strip.innerHTML = `
    <span id="gesso-proof-pulse" title="The main thread’s own animation frame"></span>
    <button id="gesso-proof-block" type="button">Block the main thread for ${blockMs / 1000}s</button>
    ${layout ? '<label><input id="gesso-proof-heatmap" type="checkbox" />Layout heatmap</label>' : ''}
    <span class="sep"></span>
    <span class="stat">render worker <b id="gesso-proof-fps">—</b> fps</span>
    <span class="stat">worst frame gap <b id="gesso-proof-gap">—</b></span>
    <span class="stat">frame work <b id="gesso-proof-work">—</b> median</span>
    ${layout ? '<span class="stat">re-measured <b id="gesso-proof-measured">—</b> last frame, at most <b id="gesso-proof-peak">—</b></span>' : ''}
    <span class="stat">main thread <b id="gesso-proof-mainfps">—</b> fps</span>
  `;
  host.before(strip);

  if (layout) {
    const explain = doc.createElement('pre');
    explain.id = 'gesso-proof-explain';
    explain.hidden = true;
    host.before(explain);
  }
}
