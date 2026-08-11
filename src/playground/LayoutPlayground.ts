import { UiGraphBuilder } from '../ui/composition';
import type { UiElement } from '../ui/composition';
import { UiGraph } from '../ui/graph/UiGraph';
import { DirtyFlags } from '../ui/graph/DirtyFlags';
import type { UiNode } from '../ui/graph/UiNode';
import { CharacterCountTextMeasurer } from '../ui/layout';
import { Constraints } from '../ui/layout';
import { LayoutEngine } from '../ui/layout';
import type { LayoutRecord } from '../ui/layout';
import type { TextMeasurer } from '../ui/layout';
import { UiScheduler } from '../ui/scheduler';
import { UiFrame } from '../ui/scheduler';
import type { UiFrameClockFactory } from '../ui/scheduler';

/**
 * Dirty flags that mean the layout pipeline must run for a frame.
 *
 * Content (text) and Children (structure) both re-measure/place.
 * Paint and Transform-only frames skip layout entirely.
 */
const LAYOUT_FLAGS = DirtyFlags.Content | DirtyFlags.Layout | DirtyFlags.SubtreeLayout | DirtyFlags.Children;

export interface PlaygroundMetrics {
  nodeCount: number;
  dirtyCount: number;
  frameCount: number;
  layoutPasses: number;
  lastFrameMs: number;
  lastLayoutMs: number;
}

export interface PlaygroundNodeInfo {
  node: UiNode;
  record: LayoutRecord | undefined;
  created: number;
}

export interface LayoutPlaygroundOptions {
  /**
   * Builds the scheduler clock. Tests pass a manual clock;
   * the browser passes the rAF-backed factory.
   */
  clock: UiFrameClockFactory;
  /** Deterministic by default; the browser may inject a canvas measurer. */
  textMeasurer?: TextMeasurer;
  /** Constraints the layout root is measured under. */
  constraints?: Constraints;
}

/**
 * Integration harness for Steps 1-5.
 *
 * Wires the exact production systems together — composition,
 * UiGraphBuilder, UiGraph, bindings, scheduler and layout engine —
 * with no special-case code. The debug visualization lives
 * downstream of this and reads LayoutRecords after every frame.
 *
 *   build(definition) → reconcile onto retained tree
 *   relayout(w, h)    → full layout under new constraints (resize)
 *   handleFrame       → layoutForFrame + lightweight metrics
 *
 * All instrumentation lives here, not in the core systems.
 */
export class LayoutPlayground {
  readonly graph = new UiGraph();
  readonly engine: LayoutEngine;
  readonly builder: UiGraphBuilder;
  readonly scheduler: UiScheduler;

  private root: UiNode | undefined;
  private constraints: Constraints;
  private readonly created = new Map<string, number>();
  private previousIds = new Set<string>();
  private layoutPasses = 0;
  private lastLayoutMs = 0;
  private lastFrameMs = 0;
  private onUpdate: (() => void) | null = null;

  constructor(options: LayoutPlaygroundOptions) {
    this.engine = new LayoutEngine(options.textMeasurer ?? new CharacterCountTextMeasurer());
    this.constraints = options.constraints ?? Constraints.loose(600, 600);
    this.builder = new UiGraphBuilder(this.graph);
    this.scheduler = new UiScheduler({
      clock: options.clock,
      dirty: this.graph.getDirtyNodes(),
      onFrame: frame => this.handleFrame(frame)
    });
    this.graph.setDirtyListener(() => this.scheduler.notifyDirty());
    this.graph.setNodeRemovedListener(node => this.engine.detachNode(node));
  }

  get layoutRoot(): UiNode {
    return this.requireRoot();
  }

  /**
   * Builds (or reconciles) a definition onto the retained tree.
   * Repeated calls reuse matching nodes instead of recreating them.
   */
  build(definition: UiElement): UiNode {
    this.root = this.builder.build(definition);
    this.graph.propagateEnvironment(this.root);
    this.trackCreated();
    this.onUpdate?.();
    return this.root;
  }

  /**
   * Alias of build(): a structural state change re-renders the same
   * definition function, and the builder reconciles.
   */
  rebuild(definition: UiElement): UiNode {
    return this.build(definition);
  }

  /**
   * Full layout pass under new constraints. Used when the preview
   * viewport resizes; a pure constraint change has no dirty node to
   * arm a frame, so this is the documented explicit re-layout path.
   */
  relayout(width: number, height: number): void {
    this.constraints = Constraints.loose(width, height);
    this.engine.layout(this.requireRoot(), this.constraints);
    this.onUpdate?.();
  }

  setOnUpdate(listener: (() => void) | null): void {
    this.onUpdate = listener;
  }

  metrics(): PlaygroundMetrics {
    return {
      nodeCount: this.inspect().length,
      dirtyCount: this.graph.getDirtyNodes().size,
      frameCount: this.scheduler.frameCount,
      layoutPasses: this.layoutPasses,
      lastFrameMs: this.lastFrameMs,
      lastLayoutMs: this.lastLayoutMs
    };
  }

  /**
   * The current tree with its layout records and per-node creation
   * counts, for the debug panel.
   */
  inspect(): PlaygroundNodeInfo[] {
    const root = this.requireRoot();
    const info: PlaygroundNodeInfo[] = [];
    const visit = (node: UiNode): void => {
      info.push({ node, record: this.engine.recordFor(node), created: this.created.get(node.id) ?? 0 });
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        visit(child);
      }
    };
    visit(root);
    return info;
  }

  createdFor(id: string): number {
    return this.created.get(id) ?? 0;
  }

  dispose(): void {
    this.scheduler.dispose();
    this.graph.setDirtyListener(null);
    this.graph.setNodeRemovedListener(null);
  }

  private handleFrame(frame: UiFrame): void {
    const root = this.root;
    if (root === undefined) {
      return;
    }
    this.graph.processEnvironmentDirty();
    const start = performance.now();
    this.engine.layoutForFrame(frame, this.constraints, root);
    const duration = performance.now() - start;
    const hasLayoutWork = frame.nodes.some(node => (frame.dirtyFlagsFor(node) & LAYOUT_FLAGS) !== 0);
    if (hasLayoutWork) {
      this.layoutPasses++;
      this.lastLayoutMs = duration;
    }
    this.lastFrameMs = duration;
    this.onUpdate?.();
  }

  /**
   * Counts node creations by diffing the tree's node-id set across
   * builds. A node keeps its id across reconciliation; only a new
   * UiNode instance increments its count.
   */
  private trackCreated(): void {
    const root = this.root;
    if (root === undefined) {
      return;
    }
    const ids = new Set<string>();
    const visit = (node: UiNode): void => {
      ids.add(node.id);
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        visit(child);
      }
    };
    visit(root);
    for (const id of ids) {
      if (!this.previousIds.has(id)) {
        this.created.set(id, (this.created.get(id) ?? 0) + 1);
      }
    }
    this.previousIds = ids;
  }

  private requireRoot(): UiNode {
    if (this.root === undefined) {
      throw new Error('LayoutPlayground has no root yet. Call build() first.');
    }
    return this.root;
  }
}
