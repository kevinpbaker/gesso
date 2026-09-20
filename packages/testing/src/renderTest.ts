import {
  CharacterCountTextMeasurer,
  formatExplanation,
  UiManualFrameClock,
  type CanvasHost,
  type LayoutBox,
  type LayoutExplanation,
  type TextMeasurer,
  type UiNode,
  type UiSemanticsMap,
  type UiSemanticsRecord
} from 'gesso-core';
import { FakeCanvasHost, RecordingCanvasContext, type RecordedCall } from 'gesso-core/testing';
import { GessoRuntime, type FrameMetrics, type FrameworkChild, type GessoRuntimeOptions } from 'gesso-framework';

import { createFireEvent, type FireEvent } from './fireEvent';
import { formatTree } from './debug';
import { createQueries, type Queries } from './queries';
import { registerRendered } from './registry';

/**
 * The pieces of a mounted tree that are not queries.
 *
 * Split out so the queries can be mixed in without either half having
 * to know the other's shape.
 */
export interface RenderedBase {
  /** The runtime itself, for anything this library does not wrap. */
  readonly runtime: GessoRuntime;
  /** The clock frames are driven from; `frame()` is the usual way in. */
  readonly clock: UiManualFrameClock;
  /** Metrics for every frame that has run, in order. */
  readonly frames: readonly FrameMetrics[];
  /** Every canvas call since the last `clearDraws()`. An escape hatch. */
  readonly draws: readonly RecordedCall[];
  /** The event senders, bound to this runtime. */
  readonly fireEvent: FireEvent;

  /**
   * Runs the pending frame, if there is one.
   *
   * Without a time it advances 16 ms per call, so a test can drive
   * frames without keeping a clock of its own.
   */
  frame(time?: number): void;

  /**
   * Runs frames until nothing is pending, then resolves.
   *
   * Awaits the microtask queue between frames, which is what makes it
   * the right thing after anything asynchronous: a channel patch, an
   * image resolving, a promise a component awaited. Throws rather than
   * spinning forever if the tree never goes quiet.
   */
  settle(options?: { maxFrames?: number }): Promise<void>;

  /** The node's border box in layout-root coordinates. */
  getLayout(node: UiNode): LayoutBox;
  /** Why the node has the size it has, as `LayoutEngine.explain` gives it. */
  explain(node: UiNode): LayoutExplanation;
  /** The same explanation as the sentences `formatExplanation` prints. */
  explainText(node: UiNode): string;

  /**
   * The semantics record for a node: what a screen reader would
   * announce for it. Throws, with the tree, when the node has none —
   * which is nearly always the finding rather than an inconvenience.
   */
  getSemantics(node: UiNode): UiSemanticsRecord;
  /** The same, returning null instead of throwing. */
  querySemantics(node: UiNode): UiSemanticsRecord | null;
  /** The whole semantics tree, as the accessibility mirror has it. */
  semanticsTree(): UiSemanticsMap;

  /** The tree as text: type, role, name, states and box, one node per line. */
  debug(node?: UiNode): string;

  /** Empties the recorded canvas calls. */
  clearDraws(): void;
  /** Stops the runtime and releases what it holds. */
  unmount(): void;
}

export type Rendered = RenderedBase & Queries;

export interface RenderTestOptions extends Omit<Partial<GessoRuntimeOptions>, 'root' | 'canvas' | 'clock'> {
  /**
   * Whether to run the first frame before returning. Default true.
   *
   * Turn it off to watch the first frame happen — a listener attached
   * in `onCreate` sees it either way, but a spec asserting on what the
   * first frame *did* needs to be holding the result when it runs.
   */
  autoFrame?: boolean;
  /** Runs after the runtime is built and before it starts. */
  onCreate?: (runtime: GessoRuntime) => void;
}

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
const DEFAULT_MAX_FRAMES = 100;

/**
 * Mounts a component or element tree with no browser and no DOM, and
 * hands back the queries, the events and the layout answers.
 *
 * ```ts
 * const ui = renderTest(createComponent(Checkbox, { label: 'Wrap lines' }));
 * ui.fireEvent.click(ui.getByRole('checkbox'));
 * ui.frame();
 * expect(ui.getSemantics(ui.getByRole('checkbox')).states).toEqual(['checked']);
 * ```
 *
 * Three things are decided here rather than by the caller, because
 * getting any of them wrong makes a test that passes for the wrong
 * reason:
 *
 *  - **The clock is manual.** Frames happen when the test says so, so
 *    an assertion never races a scheduler.
 *  - **Text is measured by `CharacterCountTextMeasurer`**, not by the
 *    canvas double. A double's `measureText` answers the same width
 *    whatever the font size, so a heading and its caption would come
 *    out the same size; the deterministic measurer is proportional to
 *    the font size and identical on every machine.
 *  - **A first frame has run** by the time this returns, so the graph
 *    is built, laid out and described before the first query.
 */
export function renderTest(root: FrameworkChild, options: RenderTestOptions = {}): Rendered {
  const { autoFrame = true, onCreate, ...runtimeOptions } = options;
  const context = new RecordingCanvasContext();
  const canvas: CanvasHost = new FakeCanvasHost(context);
  const width = runtimeOptions.width ?? DEFAULT_WIDTH;
  const height = runtimeOptions.height ?? DEFAULT_HEIGHT;
  canvas.width = width;
  canvas.height = height;

  const measurer: TextMeasurer = runtimeOptions.textMeasurer ?? new CharacterCountTextMeasurer();
  const frames: FrameMetrics[] = [];
  let clock!: UiManualFrameClock;
  const runtime = new GessoRuntime({
    ...runtimeOptions,
    width,
    height,
    root,
    canvas,
    textMeasurer: measurer,
    clock: callback => (clock = new UiManualFrameClock(callback))
  });
  runtime.onFrame(metrics => frames.push(metrics));
  onCreate?.(runtime);
  runtime.start();

  let now = 0;
  const frame = (time?: number): void => {
    now = time ?? now + 16;
    if (clock.isPending) {
      clock.tick(now);
    }
  };

  const settle = async (settleOptions: { maxFrames?: number } = {}): Promise<void> => {
    const max = settleOptions.maxFrames ?? DEFAULT_MAX_FRAMES;
    for (let index = 0; index <= max; index++) {
      // A macrotask, so a resolved fetch/decode chain gets to run too,
      // not just the microtasks a queued promise leaves behind.
      await new Promise(resolve => setTimeout(resolve, 0));
      if (!clock.isPending) {
        return;
      }
      frame();
    }
    throw new Error(
      `settle() ran ${max} frames and the tree was still asking for another. ` +
        `Something is scheduling a frame every frame; drive it with frame() instead.`
    );
  };

  const base: RenderedBase = {
    runtime,
    get clock() {
      return clock;
    },
    frames,
    get draws() {
      return context.calls;
    },
    fireEvent: createFireEvent(runtime),
    frame,
    settle,
    getLayout: node => runtime.debugLayoutBox(node),
    explain: node => runtime.explain(node),
    explainText: node => formatExplanation(runtime.explain(node)),
    getSemantics: node => {
      const record = runtime.semanticsTree().get(node.id);
      if (record === undefined) {
        throw new Error(
          `'${node.id}' is not in the semantics tree: nothing gives it a role or a label, ` +
            `so no assistive technology can see it.\n\n${formatTree(runtime, runtime.layoutRoot())}`
        );
      }
      return record;
    },
    querySemantics: node => runtime.semanticsTree().get(node.id) ?? null,
    semanticsTree: () => runtime.semanticsTree(),
    debug: node => formatTree(runtime, node ?? runtime.layoutRoot()),
    clearDraws: () => {
      context.calls.length = 0;
    },
    unmount: () => runtime.dispose()
  };

  const rendered: Rendered = { ...base, ...createQueries(base) };
  registerRendered(runtime.layoutRoot(), rendered);
  if (autoFrame) {
    frame(0);
  }
  return rendered;
}
