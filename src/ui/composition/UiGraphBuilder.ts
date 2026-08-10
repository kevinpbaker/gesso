import { Observable } from 'rxjs';

import { DirtyFlags } from '../graph/DirtyFlags';
import { UiGraph } from '../graph/UiGraph';
import type { NodeProperty, UiNode } from '../graph/UiNode';
import type { UiElement } from './UiElement';
import type { UiProps } from './UiProps';

/**
 * Property reserved for reconciliation identity.
 *
 * The key never becomes a runtime property on the UiNode.
 */
const KEY_PROP = 'key';

/**
 * Converts declarative UiElements into runtime UiNodes.
 *
 * The builder is intentionally separated from UiGraph.
 *
 * UiGraph owns the runtime state.
 * UiGraphBuilder owns construction of that state from
 * declarative definitions.
 *
 * Calling build() again with a changed definition reconciles
 * the existing tree instead of destroying it:
 *
 *   - matching node → update properties
 *   - new node      → create
 *   - missing node  → destroy
 *   - keyed move    → reorder
 */
export class UiGraphBuilder {
  constructor(private readonly graph: UiGraph) {}

  /**
   * Builds (or reconciles) a UiElement subtree.
   *
   * Returns the runtime UiNode corresponding to the root of
   * the supplied definition.
   *
   * When no parent is supplied the definition is rendered as
   * the child of the graph root, so repeated calls update the
   * previously rendered tree in place.
   */
  build(definition: UiElement, parentId?: string): UiNode {
    const parent = parentId === undefined ? this.graph.root : this.graph.requireNode(parentId);
    return this.reconcileChildren(parent, [definition])[0];
  }

  /**
   * Reconciles definitions against the existing children of
   * the parent node.
   *
   * Nodes are matched by key when one is supplied, otherwise
   * by position and type. Matched nodes are reused; missing
   * definitions are created, stale children destroyed, and
   * keyed children moved into definition order.
   */
  private reconcileChildren(parent: UiNode, definitions: readonly UiElement[]): UiNode[] {
    const existing = this.collectChildren(parent);
    const matched = new Set<UiNode>();
    const result: UiNode[] = [];
    let cursor: UiNode | null = parent.firstChild;

    for (const [index, definition] of definitions.entries()) {
      let node = this.matchNode(parent, definition, existing, matched);
      if (node === undefined) {
        const id = this.createNodeId(parent, definition, index);
        const stale = this.graph.getNode(id);
        if (stale !== undefined) {
          if (stale.parent !== parent) {
            throw new Error(`Node id '${id}' is already used outside parent '${parent.id}'.`);
          }
          // The stale child is being replaced; make sure the cursor
          // does not keep pointing at a detached node.
          if (cursor === stale) {
            cursor = stale.nextSibling;
          }
          this.graph.removeNode(stale);
          // Prevent the final cleanup from removing it a second time.
          matched.add(stale);
        }
        node = this.createNode(parent, definition, index);
        matched.add(node);
      } else {
        matched.add(node);
        this.reconcileProps(node, definition.props);
        this.reconcileChildren(node, definition.children);
      }
      this.moveBefore(parent, node, cursor);
      cursor = node.nextSibling;
      result.push(node);
    }

    for (const node of existing) {
      if (!matched.has(node)) {
        this.graph.removeNode(node);
      }
    }
    return result;
  }

  /**
   * Finds an existing child that should host a definition.
   *
   * Keyed definitions match by the id derived from the key.
   * Unkeyed definitions match the first unmatched child with
   * the same type.
   */
  private matchNode(
    parent: UiNode,
    definition: UiElement,
    existing: readonly UiNode[],
    matched: Set<UiNode>
  ): UiNode | undefined {
    const key = this.elementKey(definition);
    if (key !== undefined) {
      const candidate = this.graph.getNode(`${parent.id}:${key}`);
      if (candidate === undefined || candidate.parent !== parent || candidate.type !== definition.type) {
        return undefined;
      }
      if (matched.has(candidate)) {
        throw new Error(`Duplicate key '${key}' in parent '${parent.id}'.`);
      }
      return candidate;
    }
    return existing.find(node => !matched.has(node) && node.type === definition.type);
  }

  /**
   * Creates a runtime node for a new definition.
   *
   * The node id is derived from the parent and the definition
   * so that it stays stable across reconciles. The caller is
   * responsible for removing any stale node that already holds
   * the id.
   */
  private createNode(parent: UiNode, definition: UiElement, index: number): UiNode {
    const id = this.createNodeId(parent, definition, index);
    const node = this.graph.createNode(id, definition.type);
    this.reconcileProps(node, definition.props);
    this.reconcileChildren(node, definition.children);
    return node;
  }

  /**
   * Positions a node immediately before the reference node.
   */
  private moveBefore(parent: UiNode, node: UiNode, reference: UiNode | null): void {
    if (node.parent !== parent) {
      this.graph.insertBefore(parent, node, reference);
      return;
    }
    if (node === reference || node.nextSibling === reference) {
      return;
    }
    this.graph.detachNode(node);
    this.graph.insertBefore(parent, node, reference);
  }

  /**
   * Reconciles declarative properties onto a runtime node.
   *
   * Plain values are written directly. RxJS Observables become
   * UiGraph bindings. Bindings are kept when the Observable
   * instance is unchanged and torn down when a property stops
   * being reactive.
   */
  private reconcileProps(node: UiNode, props: UiProps): void {
    const bindings = this.graph.getBindingsForNode(node);
    const bindingByProperty = new Map(bindings.map(binding => [binding.property, binding]));
    const present = new Set<string>();

    for (const [property, value] of Object.entries(props)) {
      if (property === KEY_PROP) {
        continue;
      }
      present.add(property);
      const existingBinding = bindingByProperty.get(property);
      if (this.isObservable(value)) {
        if (existingBinding !== undefined && existingBinding.observable === value) {
          continue;
        }
        if (existingBinding !== undefined) {
          this.graph.unbind(existingBinding);
        }
        this.graph.bind(node, property as NodeProperty, value, DirtyFlags.Properties);
        continue;
      }
      if (existingBinding !== undefined) {
        this.graph.unbind(existingBinding);
      }
      this.graph.updateProperty(node.id, property as NodeProperty, value, DirtyFlags.Properties);
    }

    for (const [property, binding] of bindingByProperty) {
      if (!present.has(property)) {
        this.graph.unbind(binding);
      }
    }
  }

  /**
   * Determines whether a value is an RxJS Observable.
   */
  private isObservable(value: unknown): value is Observable<unknown> {
    return value instanceof Observable;
  }

  /**
   * The reconciliation key of a definition, if any.
   */
  private elementKey(definition: UiElement): string | undefined {
    const key = definition.props[KEY_PROP];
    if (key === undefined || key === null) {
      return undefined;
    }
    return String(key);
  }

  /**
   * Collects the current children of a node in tree order.
   */
  private collectChildren(parent: UiNode): UiNode[] {
    const children: UiNode[] = [];
    for (let child = parent.firstChild; child !== null; child = child.nextSibling) {
      children.push(child);
    }
    return children;
  }

  /**
   * Generates a stable runtime node id.
   *
   * Keyed nodes use `parent:key`. Unkeyed nodes use their
   * position within the parent, which stays stable as long as
   * the surrounding structure does not reorder.
   */
  private createNodeId(parent: UiNode, definition: UiElement, index: number): string {
    const key = this.elementKey(definition);
    if (key !== undefined) {
      return `${parent.id}:${key}`;
    }
    return `${parent.id}:${index}`;
  }
}
