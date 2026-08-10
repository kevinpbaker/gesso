import { DirtyFlags } from './DirtyFlags';
import { type NodeId, UiNode } from './UiNode';
import { UiNodeType } from './UiNodeType';
import { type BindingId, type NodeProperty, UiBinding } from './UiBinding.ts';
import type { Observable } from 'rxjs';

export class UiGraph {
  constructor() {
    this.root = new UiNode('root', UiNodeType.Root);
    this.nodes.set(this.root.id, this.root);
  }

  private readonly nodes = new Map<NodeId, UiNode>();

  /**
   * Nodes that are roots of invalidated regions.
   *
   * We don't necessarily put every dirty descendant here.
   * A single subtree-invalidated node can represent thousands
   * of affected descendants.
   */
  private readonly dirtyRoots = new Set<UiNode>();

  public readonly root: UiNode;

  private readonly bindings = new Map<BindingId, UiBinding<unknown>>();

  private readonly nodeBindings = new Map<NodeId, Set<BindingId>>();

  private nextBindingId = 0;

  // ---------------------------------------------------------------------------
  // Node lookup
  // ---------------------------------------------------------------------------

  public getNode(id: NodeId): UiNode | undefined {
    return this.nodes.get(id);
  }

  public requireNode(id: NodeId): UiNode {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`UI node '${id}' does not exist.`);
    }
    return node;
  }

  public hasNode(id: NodeId): boolean {
    return this.nodes.has(id);
  }

  public get size(): number {
    return this.nodes.size;
  }

  // ---------------------------------------------------------------------------
  // Node creation
  // ---------------------------------------------------------------------------

  public createNode(id: NodeId, type: UiNodeType): UiNode {
    if (this.nodes.has(id)) {
      throw new Error(`UI node '${id}' already exists.`);
    }
    const node = new UiNode(id, type);
    this.nodes.set(id, node);
    return node;
  }

  // ---------------------------------------------------------------------------
  // Tree manipulation
  // ---------------------------------------------------------------------------

  public appendChild(parent: UiNode, child: UiNode): void {
    if (child.parent !== null) {
      throw new Error(`Node '${child.id}' already has a parent.`);
    }
    child.parent = parent;
    if (parent.lastChild === null) {
      // First child.
      parent.firstChild = child;
      parent.lastChild = child;
      return;
    }
    const previous = parent.lastChild;
    previous.nextSibling = child;
    child.previousSibling = previous;
    parent.lastChild = child;
  }

  public removeNode(node: UiNode): void {
    // First stop all reactive subscriptions.
    this.unbindNode(node);
    // Then remove it from the tree.
    this.detachNode(node);
    // Remove it from the node index.
    this.nodes.delete(node.id);
    // Remove any dirty state.
    this.dirtyRoots.delete(node);
  }

  public detachNode(node: UiNode): void {
    const parent = node.parent;
    if (!parent) {
      return;
    }
    const previous = node.previousSibling;
    const next = node.nextSibling;
    if (previous) {
      previous.nextSibling = next;
    } else {
      parent.firstChild = next;
    }
    if (next) {
      next.previousSibling = previous;
    } else {
      parent.lastChild = previous;
    }
    node.parent = null;
    node.previousSibling = null;
    node.nextSibling = null;
  }

  // ---------------------------------------------------------------------------
  // Bindings
  // ---------------------------------------------------------------------------

  private getBindingForProperty(nodeId: string, property: NodeProperty): UiBinding | undefined {
    const bindingIds = this.nodeBindings.get(nodeId);
    if (!bindingIds) {
      return undefined;
    }
    for (const bindingId of bindingIds) {
      const binding = this.bindings.get(bindingId);
      if (binding && binding.property === property) {
        return binding;
      }
    }
    return undefined;
  }

  public bind(node: UiNode, property: NodeProperty, observable: Observable, dirtyFlags: DirtyFlags): UiBinding {
    const existingBinding = this.getBindingForProperty(node.id, property);
    if (existingBinding) {
      throw new Error(`Property '${property}' on node '${node.id}' is already bound.`);
    }
    // Make sure the node actually belongs to this graph.
    const registeredNode = this.nodes.get(node.id);
    if (registeredNode !== node) {
      throw new Error(`Cannot bind to node '${node.id}' because it does not belong to this graph.`);
    }
    const bindingId = this.nextBindingId++;
    const binding = new UiBinding(bindingId, node.id, property, observable, this, dirtyFlags);
    // Global binding lookup.
    this.bindings.set(bindingId, binding);
    // Node → bindings lookup.
    let nodeBindingIds = this.nodeBindings.get(node.id);
    if (!nodeBindingIds) {
      nodeBindingIds = new Set<number>();
      this.nodeBindings.set(node.id, nodeBindingIds);
    }
    nodeBindingIds.add(bindingId);
    // Start receiving values.
    binding.connect();
    return binding;
  }

  public unbind(binding: UiBinding<unknown>): void {
    const registeredBinding = this.bindings.get(binding.id);
    // Already removed.
    if (registeredBinding !== binding) {
      return;
    }
    // Stop the RxJS subscription.
    binding.disconnect();
    // Remove global lookup.
    this.bindings.delete(binding.id);
    // Remove node → binding relationship.
    const nodeBindingIds = this.nodeBindings.get(binding.nodeId);
    if (nodeBindingIds) {
      nodeBindingIds.delete(binding.id);
      if (nodeBindingIds.size === 0) {
        this.nodeBindings.delete(binding.nodeId);
      }
    }
  }

  public unbindNode(node: UiNode): void {
    const bindingIds = this.nodeBindings.get(node.id);
    if (!bindingIds) {
      return;
    }
    // Copy the IDs because unbind() modifies
    // the nodeBindings map.
    const ids = [...bindingIds];
    for (const bindingId of ids) {
      const binding = this.bindings.get(bindingId);
      if (binding) {
        this.unbind(binding);
      }
    }
  }

  public handleBindingError(binding: UiBinding<unknown>, error: unknown): void {
    console.error(`UI binding ${binding.id} failed ` + `(${binding.nodeId}.${binding.property})`, error);
    this.unbind(binding);
  }

  public getBindingsForNode(node: UiNode): UiBinding[] {
    const bindingIds = this.nodeBindings.get(node.id);
    if (!bindingIds) {
      return [];
    }
    const bindings: UiBinding[] = [];
    for (const bindingId of bindingIds) {
      const binding = this.bindings.get(bindingId);
      if (binding) {
        bindings.push(binding);
      }
    }
    return bindings;
  }

  // ---------------------------------------------------------------------------
  // Dirty state
  // ---------------------------------------------------------------------------

  public markDirty(node: UiNode, flags: DirtyFlags): void {
    node.dirtyFlags |= flags;
    if (flags & DirtyFlags.SubtreeLayout) {
      this.dirtyRoots.add(node);
      return;
    }
    this.dirtyRoots.add(node);
  }

  public markDirtyById(id: NodeId, flags: DirtyFlags): void {
    const node = this.requireNode(id);
    this.markDirty(node, flags);
  }

  public clearDirty(node: UiNode): void {
    node.dirtyFlags = DirtyFlags.None;
    this.dirtyRoots.delete(node);
  }

  public updateProperty<T>(
    nodeId: string,
    property: string,
    value: T,
    dirtyFlags: DirtyFlags = DirtyFlags.Properties
  ): boolean {
    const node = this.requireNode(nodeId);
    const previousValue = node.getProperty<T>(property);
    if (Object.is(previousValue, value)) {
      return false;
    }
    node.setProperty(property, value);
    this.markDirtyById(nodeId, dirtyFlags);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Dirty traversal
  // ---------------------------------------------------------------------------

  public processDirty(callback: (node: UiNode) => void): void {
    for (const root of this.dirtyRoots) {
      this.traverse(root, callback);
    }
    this.dirtyRoots.clear();
  }

  public traverse(node: UiNode, callback: (node: UiNode) => void): void {
    callback(node);
    let child = node.firstChild;
    while (child !== null) {
      this.traverse(child, callback);
      child = child.nextSibling;
    }
  }

  public traverseChildren(node: UINode, callback: (child: UINode) => void): void {
    let child = node.firstChild;
    while (child !== null) {
      callback(child);
      child = child.nextSibling;
    }
  }
}
