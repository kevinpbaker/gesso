/**
 * Microbenchmarks for the retained UI graph (packages/core/src/graph).
 *
 * Three shapes, matching how the graph is actually driven:
 *
 *   build     — create a wide, deep tree and tear it down again, the
 *               cost the reconciler pays when a route mounts
 *   theme     — flip a provider value at the root and propagate, the
 *               cost of a theme change across the whole tree
 *   frame     — mark a scattered handful of nodes and drain the dirty
 *               set, the loop that runs on every animation frame
 *
 *   pnpm bench:graph
 *   BENCH_NODES=20000 BENCH_ITERATIONS=50 pnpm bench:graph
 *
 * The script runs through vite-node rather than node directly: the
 * graph's dirty flags are a TypeScript enum, which node's strip-only
 * loader rejects.
 *
 * Numbers are wall-clock milliseconds on the machine that runs it, so
 * they compare a change against its own baseline, not against another
 * machine's.
 */
import { DirtyFlags } from '../packages/core/src/graph/DirtyFlags.ts';
import { UiGraph } from '../packages/core/src/graph/UiGraph.ts';
import { UiNodeType } from '../packages/core/src/graph/UiNodeType.ts';
import { UiScheduler } from '../packages/core/src/scheduler/UiScheduler.ts';
import { lightTheme } from '../packages/core/src/environment/UiTheme.ts';
import type { UiNode } from '../packages/core/src/graph/UiNode.ts';
import type { UiFrameClock, UiFrameTime } from '../packages/core/src/scheduler/UiFrameClock.ts';

const NODES = Number(process.env.BENCH_NODES ?? '10000');
const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? '30');
const BRANCHING = 8;

/**
 * A clock the benchmark ticks by hand, so a frame costs what the
 * scheduler does and nothing else.
 */
class ManualClock implements UiFrameClock {
  private readonly callback: (time: UiFrameTime) => void;
  private armed = false;

  constructor(callback: (time: UiFrameTime) => void) {
    this.callback = callback;
  }

  requestFrame(): void {
    this.armed = true;
  }
  cancelFrame(): void {
    this.armed = false;
  }
  tick(time: UiFrameTime): void {
    this.armed = false;
    this.callback(time);
  }
  get pending(): boolean {
    return this.armed;
  }
}

/**
 * Builds a tree of `count` nodes, `BRANCHING` children per parent, and
 * returns every node in creation order.
 */
function buildTree(graph: UiGraph, count: number): UiNode[] {
  const nodes: UiNode[] = [];
  const frontier: UiNode[] = [graph.root];
  let next = 0;
  while (nodes.length < count) {
    const parent = frontier[next++ % frontier.length];
    for (let i = 0; i < BRANCHING && nodes.length < count; i++) {
      const node = graph.createNode(`n${nodes.length}`, UiNodeType.Box);
      node.setProperty('width', 100);
      node.setProperty('height', 20);
      graph.appendChild(parent, node);
      nodes.push(node);
      frontier.push(node);
    }
  }
  return nodes;
}

function measure(label: string, iterations: number, body: () => void): void {
  // One untimed pass so the JIT has seen the shapes involved.
  body();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    body();
  }
  const total = performance.now() - start;
  const each = total / iterations;
  console.log(`  ${label.padEnd(28)} ${each.toFixed(3)} ms/op    ${total.toFixed(1)} ms total`);
}

console.log(`\nUI graph benchmarks — ${NODES} nodes, ${ITERATIONS} iterations\n`);

console.log('build');
measure('create + append', ITERATIONS, () => {
  const graph = new UiGraph();
  buildTree(graph, NODES);
});
measure('create + remove subtree', ITERATIONS, () => {
  const graph = new UiGraph();
  buildTree(graph, NODES);
  let child = graph.root.firstChild;
  while (child !== null) {
    const next = child.nextSibling;
    graph.removeNode(child);
    child = next;
  }
});

console.log('\nenvironment');
{
  const graph = new UiGraph();
  buildTree(graph, NODES);
  graph.propagateEnvironment(graph.root);
  measure('propagate, nothing changed', ITERATIONS, () => {
    graph.propagateEnvironment(graph.root);
  });
}
{
  const graph = new UiGraph();
  buildTree(graph, NODES);
  graph.propagateEnvironment(graph.root);
  let flip = 0;
  measure('propagate, theme changed', ITERATIONS, () => {
    // A distinct object each time, so the key's compare function has
    // to run rather than short-circuiting on identity.
    const shade = (flip++ % 2) * 0.02;
    graph.root.setProperty('theme', {
      ...lightTheme,
      colors: { ...lightTheme.colors, background: { r: 1 - shade, g: 1, b: 1, a: 1 } }
    });
    graph.propagateEnvironment(graph.root);
  });
}

console.log('\nframe');
{
  const graph = new UiGraph();
  const nodes = buildTree(graph, NODES);
  let clock!: ManualClock;
  const scheduler = new UiScheduler({
    clock: callback => (clock = new ManualClock(callback)),
    dirty: graph.getDirtyNodes(),
    onFrame: () => {}
  });
  graph.setDirtyListener(() => scheduler.notifyDirty());
  let time = 0;
  measure('mark 50 + drain frame', ITERATIONS * 20, () => {
    for (let i = 0; i < 50; i++) {
      graph.markDirty(nodes[(i * 197) % nodes.length], DirtyFlags.Paint);
    }
    clock.tick((time += 16));
  });
}

console.log('');
