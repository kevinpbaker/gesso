import { Observable } from 'rxjs';

import { DirtyFlags } from '../DirtyFlags';
import { UiGraph } from '../UiGraph';
import type { UiNode } from '../UiNode';
import type { UiElement } from './UiElement';
import type { UiProps } from './UiProps';

/**
 * Converts declarative UiElements into runtime UiNodes.
 *
 * The builder is intentionally separated from UiGraph.
 *
 * UiGraph owns the runtime state.
 * UiGraphBuilder owns construction of that state from
 * declarative definitions.
 */
export class UiGraphBuilder {
  constructor(private readonly graph: UiGraph) {}

  /**
   * Builds an entire UiElement subtree.
   *
   * Returns the runtime UiNode corresponding to the
   * root of the supplied definition.
   */
  build(definition: UiElement, parentId?: string): UiNode {
    const node = this.graph.createNode(this.createNodeId(definition), definition.type);
    this.applyProps(node, definition.props);
    if (parentId !== undefined) {
      const parent = this.graph.requireNode(parentId);
      this.graph.appendChild(parent, node);
    }
    for (const child of definition.children) {
      this.build(child, node.id);
    }
    return node;
  }

  /**
   * Applies declarative properties to a runtime node.
   *
   * Plain values are written directly.
   *
   * RxJS Observables become UiGraph bindings.
   */
  private applyProps(node: UiNode, props: UiProps): void {
    for (const [property, value] of Object.entries(props)) {
      if (this.isObservable(value)) {
        this.graph.bind(node, property as NodeProperty, value, DirtyFlags.Properties);
        continue;
      }
      this.graph.updateProperty(node.id, property as NodeProperty, value);
    }
  }

  /**
   * Determines whether a value is an RxJS Observable.
   */
  private isObservable(value: unknown): value is Observable<unknown> {
    return value instanceof Observable;
  }

  /**
   * Generates the runtime node ID.
   *
   * For now we generate an ID locally.
   *
   * This is intentionally isolated because later,
   * when reconciliation is introduced, stable declarative
   * keys will become important.
   */
  private createNodeId(_definition: UiElement): string {
    return crypto.randomUUID();
  }
}
