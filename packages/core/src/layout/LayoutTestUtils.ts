import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { LayoutEngine } from './LayoutEngine';
import { Constraints } from './LayoutTypes';
import type { LayoutBox, LayoutResult } from './LayoutTypes';
import type { LayoutRecord } from './LayoutRecord';
import type { TextMeasurer } from './TextMeasurer';

/**
 * Shared helpers for layout specs: builds UiNode trees through
 * the real graph and drives LayoutEngine.
 */
export class LayoutHarness {
  readonly graph = new UiGraph();
  readonly engine: LayoutEngine;

  constructor(textMeasurer?: TextMeasurer) {
    this.engine = new LayoutEngine(textMeasurer);
  }

  createNode(id: string, type: UiNodeType): UiNode {
    return this.graph.createNode(id, type);
  }

  append(parent: UiNode, ...children: UiNode[]): void {
    for (const child of children) {
      this.graph.appendChild(parent, child);
    }
  }

  layout(node: UiNode, constraints: Constraints = Constraints.unbounded()): LayoutResult {
    return this.engine.layout(node, constraints);
  }

  record(node: UiNode): LayoutRecord {
    const record = this.engine.recordFor(node);
    if (record === undefined) {
      throw new Error(`No layout record for '${node.id}'.`);
    }
    return record;
  }

  box(node: UiNode): LayoutBox {
    const record = this.record(node);
    return { x: record.x, y: record.y, width: record.width, height: record.height };
  }

  boxOf(node: UiNode): LayoutBox {
    return this.engine.worldBox(node);
  }

  /** Where the node is seen: scroll offsets and sticky shifts applied. */
  visibleBox(node: UiNode): LayoutBox {
    return this.engine.visibleBox(node);
  }
}
