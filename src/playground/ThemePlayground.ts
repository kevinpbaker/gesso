import { UiGraphBuilder } from '../ui/composition';
import type { UiElement } from '../ui/composition';
import { UiGraph } from '../ui/graph/UiGraph';
import { CharacterCountTextMeasurer } from '../ui/layout';
import { Constraints } from '../ui/layout';
import { LayoutEngine } from '../ui/layout';
import type { TextMeasurer } from '../ui/layout';
import { UiScheduler } from '../ui/scheduler';
import { UiFrame } from '../ui/scheduler';
import type { UiFrameClockFactory } from '../ui/scheduler';
import type { UiNode } from '../ui/graph/UiNode';
import type { LayoutRecord } from '../ui/layout';

export interface ThemePlaygroundOptions {
  clock: UiFrameClockFactory;
  textMeasurer?: TextMeasurer;
  constraints?: Constraints;
}

/**
 * A focused harness for the property/theme integration playground.
 *
 * Mirrors LayoutPlayground but drives the theme-oriented definition so
 * the demo can stay small and self-contained.
 */
export class ThemePlayground {
  readonly graph = new UiGraph();
  readonly engine: LayoutEngine;
  readonly builder: UiGraphBuilder;
  readonly scheduler: UiScheduler;

  private root: UiNode | undefined;
  private constraints: Constraints;
  private onUpdate: (() => void) | null = null;

  constructor(options: ThemePlaygroundOptions) {
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

  build(definition: UiElement): UiNode {
    this.root = this.builder.build(definition);
    this.graph.propagateEnvironment(this.root);
    this.onUpdate?.();
    return this.root;
  }

  /**
   * Rebuilds the retained tree from a new definition.
   */
  rebuild(definition: UiElement): UiNode {
    return this.build(definition);
  }

  /**
   * Full layout pass under new constraints.
   */
  relayout(width: number, height: number): void {
    this.constraints = Constraints.loose(width, height);
    if (this.root !== undefined) {
      this.engine.layout(this.root, this.constraints);
    }
    this.onUpdate?.();
  }

  /**
   * The current tree with its layout records, for debug views.
   */
  inspect(): { node: UiNode; record: LayoutRecord | undefined }[] {
    const root = this.root;
    if (root === undefined) {
      return [];
    }
    const info: { node: UiNode; record: LayoutRecord | undefined }[] = [];
    const visit = (node: UiNode): void => {
      info.push({ node, record: this.engine.recordFor(node) });
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        visit(child);
      }
    };
    visit(root);
    return info;
  }

  setOnUpdate(listener: (() => void) | null): void {
    this.onUpdate = listener;
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
    this.engine.layoutForFrame(frame, this.constraints, root);
    this.onUpdate?.();
  }
}
