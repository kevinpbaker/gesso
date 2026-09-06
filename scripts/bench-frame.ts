/**
 * Microbenchmarks for the work one frame does (layout, paint, input).
 *
 * `bench-graph.ts` measures the retained graph on its own. This one
 * measures what sits on top of it, in the shapes that decide whether a
 * frame fits its budget:
 *
 *   layout      — a full pass, the cost a route pays when it mounts and
 *                 a window pays when it resizes, and the incremental
 *                 passes that follow it
 *   paint       — resolving every node's paint state, which is what a
 *                 renderer walk does before it draws anything
 *   render      — one Canvas2D walk of the tree, with the list scrolled
 *                 to the top so most of it is off screen, which is the
 *                 usual case and the one culling exists for
 *   input       — one hit test, the cost of a single pointer move
 *   reconcile   — rebuilding a list's children, keyed and unkeyed
 *
 *   pnpm bench:frame
 *   BENCH_ROWS=4000 pnpm bench:frame
 *   BENCH_ONLY=input pnpm bench:frame
 *
 * The tree is a list of rows, each an artwork box beside a column of
 * two lines of text, which is the shape a real screen is mostly made
 * of. Five nodes a row, so the default is a little over five thousand.
 *
 * Numbers are wall-clock milliseconds on the machine that runs it, so
 * they compare a change against its own baseline, not against another
 * machine's.
 */
import { Canvas2DRenderer } from '../packages/core/src/rendering/canvas2d/Canvas2DRenderer.ts';
import { CanvasSurface } from '../packages/core/src/rendering/canvas2d/CanvasSurface.ts';
import { CharacterCountTextMeasurer } from '../packages/core/src/layout/TextMeasurer.ts';
import { Constraints } from '../packages/core/src/layout/LayoutTypes.ts';
import { DirtyFlags } from '../packages/core/src/graph/DirtyFlags.ts';
import { LayoutEngine } from '../packages/core/src/layout/LayoutEngine.ts';
import { UiFrame } from '../packages/core/src/scheduler/UiFrame.ts';
import { UiGraph } from '../packages/core/src/graph/UiGraph.ts';
import { UiGraphBuilder } from '../packages/core/src/composition/UiGraphBuilder.ts';
import { UiHitTester } from '../packages/core/src/input/UiHitTester.ts';
import { UiNodeType } from '../packages/core/src/graph/UiNodeType.ts';
import { lightTheme } from '../packages/core/src/environment/UiTheme.ts';
import { createPaintState, resolvePaintState } from '../packages/core/src/rendering/PaintState.ts';
import type { Canvas2DContext, Canvas2DGradient } from '../packages/core/src/rendering/canvas2d/Canvas2DContext.ts';
import type { CanvasHost } from '../packages/core/src/rendering/canvas2d/CanvasSurface.ts';
import type { UiChild } from '../packages/core/src/composition/UiDefinition.ts';
import type { UiNode } from '../packages/core/src/graph/UiNode.ts';

const ROWS = Number(process.env.BENCH_ROWS ?? '1000');
const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? '20');
const ROUNDS = Number(process.env.BENCH_ROUNDS ?? '5');

const VIEWPORT_WIDTH = 800;
const VIEWPORT_HEIGHT = 600;

interface List {
  graph: UiGraph;
  root: UiNode;
  nodes: UiNode[];
  titles: UiNode[];
}

/**
 * A list of `rows` rows: artwork, then a column of two text lines.
 *
 * Modelled on a real one, Segue's `ItemRow`, down to the detail that
 * decides how much colour work a frame does: every colour is written
 * as a hex string, because that is what an application's palette is.
 * A palette name would be looked up in the theme instead and never
 * reach the parser, so a tree of palette names would measure a
 * different program from the one people run.
 */
function buildList(rows: number): List {
  const graph = new UiGraph();
  const root = graph.createNode('list', UiNodeType.Column);
  root.setProperty('width', VIEWPORT_WIDTH);
  root.setProperty('height', VIEWPORT_HEIGHT);
  // A theme at the root, and the environment built from it below,
  // because every application has one. A node whose `environment` is
  // null takes the default for each inherited property without looking
  // at anything, which is a path no real tree is ever on.
  //
  // It turned out to cost almost nothing here, which is worth writing
  // down so nobody re-measures it hoping otherwise: one provider at the
  // root means every node shares that one environment, and a lookup
  // finds the theme in the first map it asks. A deep stack of providers
  // would walk, and this tree does not have one.
  root.setProperty('theme', lightTheme);
  const nodes: UiNode[] = [root];
  const titles: UiNode[] = [];
  for (let i = 0; i < rows; i++) {
    const row = graph.createNode(`row-${i}`, UiNodeType.Row);
    row.setProperty('height', 56);
    row.setProperty('padding', 8);
    row.setProperty('gap', 8);
    row.setProperty('borderRadius', 10);
    row.setProperty('backgroundColor', '#ffffff');
    graph.appendChild(root, row);

    const artwork = graph.createNode(`artwork-${i}`, UiNodeType.Box);
    artwork.setProperty('width', 40);
    artwork.setProperty('height', 40);
    artwork.setProperty('backgroundColor', '#e9e2d6');
    artwork.setProperty('borderRadius', 6);
    graph.appendChild(row, artwork);

    const lines = graph.createNode(`lines-${i}`, UiNodeType.Column);
    lines.setProperty('flexGrow', 1);
    graph.appendChild(row, lines);

    const title = graph.createNode(`title-${i}`, UiNodeType.Text);
    title.setProperty('text', `Track number ${i}`);
    title.setProperty('fontSize', 14);
    title.setProperty('color', '#16181d');
    graph.appendChild(lines, title);

    const artist = graph.createNode(`artist-${i}`, UiNodeType.Text);
    artist.setProperty('text', `Artist ${i}`);
    artist.setProperty('fontSize', 12);
    artist.setProperty('color', '#6f675c');
    graph.appendChild(lines, artist);

    nodes.push(row, artwork, lines, title, artist);
    titles.push(title);
  }
  graph.propagateEnvironment(root);
  return { graph, root, nodes, titles };
}

/** The children of a list, as the reconciler is handed them. */
function listChildren(count: number, round: number, keyed: boolean): UiChild[] {
  const children: UiChild[] = [];
  for (let i = 0; i < count; i++) {
    const props: Record<string, unknown> = { width: 40, height: 40 + (round % 2) };
    if (keyed) {
      props.key = `row-${i}`;
    }
    children.push({ type: UiNodeType.Box, props, children: [] } as unknown as UiChild);
  }
  return children;
}

/**
 * A context that answers the renderer and keeps nothing.
 *
 * The recording context the specs use appends an object per call,
 * which on a benchmark would be measuring the recorder. This does the
 * least a context can do, so what is timed is the walk and the state
 * it resolves rather than the drawing underneath it.
 */
class NullCanvasContext implements Canvas2DContext {
  fillStyle: string | Canvas2DGradient | CanvasPattern = '#000';
  strokeStyle: string | Canvas2DGradient | CanvasPattern = '#000';
  lineWidth = 1;
  lineJoin: CanvasLineJoin = 'miter';
  globalAlpha = 1;
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  letterSpacing = '0px';

  save(): void {}
  restore(): void {}
  translate(): void {}
  scale(): void {}
  rotate(): void {}
  setTransform(): void {}
  clearRect(): void {}
  fillRect(): void {}
  strokeRect(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arcTo(): void {}
  closePath(): void {}
  rect(): void {}
  clip(): void {}
  fill(): void {}
  stroke(): void {}
  fillText(): void {}
  drawImage(): void {}

  measureText(text: string): TextMetrics {
    return { width: text.length * 8 } as TextMetrics;
  }

  createLinearGradient(): Canvas2DGradient {
    return { addColorStop(): void {} };
  }

  createRadialGradient(): Canvas2DGradient {
    return { addColorStop(): void {} };
  }
}

class NullCanvasHost implements CanvasHost {
  width = 0;
  height = 0;

  constructor(private readonly context: Canvas2DContext) {}

  getContext(_contextId: '2d'): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
    return this.context as unknown as CanvasRenderingContext2D;
  }
}

/**
 * Times `body`, reporting the fastest round rather than the average.
 *
 * A development machine is never idle, and the average is the first
 * thing to notice: the same section, unchanged, read three times
 * slower on a run taken while the machine was busy, which is more than
 * any of the improvements these benchmarks exist to show. The fastest
 * round is the one with the least of somebody else's work in it, so it
 * is the reading that compares across runs. The average is printed
 * beside it, because a gap between the two is how you know the machine
 * was loaded and the numbers deserve a second run.
 */
function measure(label: string, iterations: number, body: () => void): void {
  // One untimed pass so the JIT has seen the shapes involved.
  body();
  let best = Infinity;
  let total = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      body();
    }
    const elapsed = performance.now() - start;
    total += elapsed;
    best = Math.min(best, elapsed / iterations);
  }
  const mean = total / (ROUNDS * iterations);
  console.log(`  ${label.padEnd(34)} ${best.toFixed(3)} ms/op    (mean ${mean.toFixed(3)})`);
}

const nodeCount = ROWS * 5 + 1;

/**
 * Sections are separate functions, and `BENCH_ONLY` runs one of them.
 *
 * Not tidiness: a section leaves a tree of thousands of nodes and the
 * garbage from having driven it, and the next section then measures
 * partly the collector's opinion of the previous one. Readings moved
 * by a factor of nine between a run of everything and a run of one.
 * Compare a change against a baseline taken the same way.
 */
const ONLY = process.env.BENCH_ONLY;

function shouldRun(section: string): boolean {
  return ONLY === undefined || ONLY === section;
}

function layoutSection(): void {
  console.log('layout');
  {
    const { root } = buildList(ROWS);
    const engine = new LayoutEngine();
    const constraints = Constraints.tight(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    measure('full pass', ITERATIONS, () => {
      engine.invalidateMeasurements();
      engine.layout(root, constraints);
    });
  }
  {
    const { root, titles } = buildList(ROWS);
    const engine = new LayoutEngine();
    const constraints = Constraints.tight(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    engine.layout(root, constraints);
    let frame = 0;
    measure('one text changed', ITERATIONS * 20, () => {
      const node = titles[frame % titles.length];
      node.setProperty('text', `Track number ${frame}`);
      engine.layoutForFrame(new UiFrame(frame, frame, new Map([[node, DirtyFlags.Layout]])), constraints, root);
      frame++;
    });
    measure('transform only', ITERATIONS * 20, () => {
      engine.layoutForFrame(new UiFrame(frame, frame, new Map([[root, DirtyFlags.Transform]])), constraints, root);
      frame++;
    });
  }
}

function paintSection(): void {
  console.log('paint');
  {
    const { nodes } = buildList(ROWS);
    const state = createPaintState();
    measure('resolve every node', ITERATIONS, () => {
      for (let i = 0; i < nodes.length; i++) {
        resolvePaintState(nodes[i], state);
      }
    });
  }
}

/**
 * One Canvas2D walk, twice: once at a real viewport and once at a
 * viewport tall enough to hold the whole list.
 *
 * The two measure opposite halves of the walk and both are worth
 * having. At a real viewport almost every row is culled, so what is
 * timed is how cheaply the walk says no, which is the case an
 * application is in for all but a screenful of any list it shows. With
 * nothing culled every node is resolved and drawn, so what is timed is
 * the paint path itself: the state resolution, the colour formatting,
 * the text. A change that helps one of these can easily do nothing for
 * the other, and reading only the first would have hidden that.
 */
function renderSection(): void {
  console.log('render');
  for (const culled of [true, false]) {
    const { root } = buildList(ROWS);
    const height = culled ? VIEWPORT_HEIGHT : ROWS * 56 + 1;
    const measurer = new CharacterCountTextMeasurer();
    const engine = new LayoutEngine(measurer);
    root.setProperty('height', height);
    engine.layout(root, Constraints.tight(VIEWPORT_WIDTH, height));
    const surface = new CanvasSurface(new NullCanvasHost(new NullCanvasContext()));
    surface.setLogicalSize(VIEWPORT_WIDTH, height, 1);
    const renderer = new Canvas2DRenderer({ surface });
    // Far in the future, so the overlay scrollbars have faded and what
    // is timed is the scene alone.
    const context = { layout: engine, text: measurer, now: Number.MAX_SAFE_INTEGER };
    measure(culled ? 'canvas2d walk, mostly culled' : 'canvas2d walk, nothing culled', ITERATIONS, () => {
      renderer.render(root, context);
    });
  }
}

function inputSection(): void {
  console.log('input');
  {
    const { root } = buildList(ROWS);
    const engine = new LayoutEngine();
    engine.layout(root, Constraints.tight(VIEWPORT_WIDTH, VIEWPORT_HEIGHT));
    const tester = new UiHitTester(engine, root);
    let step = 0;
    // A moving point, so no result is answered from a hover shortcut and
    // the walk is the one a pointer dragged across the list would make.
    measure('hit test', ITERATIONS * 20, () => {
      tester.hitTest(20 + (step % 100), 20 + (step % 40));
      step++;
    });
  }
}

function reconcileSection(): void {
  console.log('reconcile');
  for (const keyed of [false, true]) {
    const graph = new UiGraph();
    const builder = new UiGraphBuilder(graph);
    const parent = graph.createNode('rows', UiNodeType.Column);
    graph.appendChild(graph.root, parent);
    builder.reconcileChildren(parent, listChildren(ROWS, 0, keyed));
    let round = 1;
    measure(keyed ? 'keyed children' : 'unkeyed children', ITERATIONS, () => {
      builder.reconcileChildren(parent, listChildren(ROWS, round++, keyed));
    });
  }
}

const sections: ReadonlyArray<[string, () => void]> = [
  ['layout', layoutSection],
  ['paint', paintSection],
  ['render', renderSection],
  ['input', inputSection],
  ['reconcile', reconcileSection]
];

if (ONLY !== undefined && !sections.some(([name]) => name === ONLY)) {
  throw new Error(`Unknown BENCH_ONLY '${ONLY}'. One of: ${sections.map(([name]) => name).join(', ')}.`);
}

console.log(`\nframe benchmarks — ${ROWS} rows, ${nodeCount} nodes, ${ITERATIONS} iterations`);
for (const [name, run] of sections) {
  if (!shouldRun(name)) {
    continue;
  }
  console.log('');
  run();
}
console.log('');
