import { DirtyFlags } from './DirtyFlags';
import { DirtyNodeSet } from './DirtyNodeSet';
import { type NodeId, type NodeProperty, UiNode } from './UiNode';
import { UiNodeType } from './UiNodeType';
import { type BindingId, UiBinding } from '../bindings/UiBinding';
import type { UiChildrenBinding } from '../bindings/UiChildrenBinding';
import type { UiEventBinding } from '../bindings/UiEventBinding';
import { UiEnvironment } from '../environment/UiEnvironment';
import { findEnvironmentKey, type UiEnvironmentKey } from '../environment/UiEnvironmentKey';
import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import { inheritedPropertyFlags } from '../properties/UiPropertyRegistry';
import type { Observable } from 'rxjs';

export class UiGraph {
  constructor() {
    this.root = new UiNode('root', UiNodeType.Root);
    this.root.environment = new UiEnvironment(null);
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
  private readonly dirtyNodes = new DirtyNodeSet();

  /**
   * Notified whenever a node newly becomes dirty.
   *
   * A scheduler subscribes here so that marking dirty can arm
   * a frame without the graph knowing about timing.
   */
  private dirtyListener: (() => void) | null = null;

  /**
   * Notified whenever a node is removed from the graph.
   *
   * Consumers that keep per-node projections (such as the
   * layout engine) subscribe here so their state stays in sync
   * with tree lifetime.
   */
  private nodeRemovedListener: ((node: UiNode) => void) | null = null;

  public readonly root: UiNode;

  private readonly bindings = new Map<BindingId, UiBinding<unknown>>();

  /**
   * Property bindings, keyed by node then by the property they drive.
   *
   * Keyed by node object rather than by id: the id is a concatenated
   * path whose length grows with depth, so hashing it costs more the
   * deeper the tree, and every teardown and rebind would pay it. The
   * inner map means finding the binding for one property is a lookup
   * rather than a scan of everything bound on the node.
   */
  private readonly nodeBindings = new Map<UiNode, Map<NodeProperty, UiBinding<unknown>>>();

  private readonly childrenBindings = new Map<UiNode, UiChildrenBinding>();

  /**
   * Declarative `on*` handlers, keyed by node then event type.
   *
   * Stored here rather than only in the dispatcher so that removing a
   * node tears its handlers down through the same path as its property
   * and children bindings.
   */
  private readonly eventBindings = new Map<UiNode, Map<string, UiEventBinding>>();

  private nextBindingId = 0;

  /** Set when any node is marked DirtyFlags.Environment. */
  private environmentDirty = false;

  /**
   * Set while the environment phase is rebuilding.
   *
   * That phase runs from the scheduler's pre-collect hook, so the
   * nodes it dirties are collected by the frame already in flight.
   * Letting those marks reach the dirty listener would arm a second,
   * redundant frame behind it.
   */
  private suppressDirtyListener = false;

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

  /**
   * Inserts a child before the reference child.
   *
   * When reference is null the child is appended to the end.
   */
  public insertBefore(parent: UiNode, child: UiNode, reference: UiNode | null): void {
    if (child.parent !== null) {
      throw new Error(`Node '${child.id}' already has a parent.`);
    }
    if (reference !== null && reference.parent !== parent) {
      throw new Error(`Reference node '${reference.id}' is not a child of '${parent.id}'.`);
    }
    if (reference === null) {
      this.appendChild(parent, child);
      return;
    }
    const previous = reference.previousSibling;
    if (previous !== null) {
      previous.nextSibling = child;
    } else {
      parent.firstChild = child;
    }
    child.parent = parent;
    child.previousSibling = previous;
    child.nextSibling = reference;
    reference.previousSibling = child;
    if (parent.lastChild === reference) {
      parent.lastChild = child;
    }
  }

  public removeNode(node: UiNode): void {
    const parent = node.parent;
    // Remove the whole subtree, not just the node itself: a
    // detached child would otherwise stay indexed with stale
    // dirty state and live bindings.
    const stack: UiNode[] = [node];
    while (stack.length > 0) {
      const current = stack.pop()!;
      // First stop all reactive subscriptions.
      this.unbindNode(current);
      this.unbindChildren(current);
      this.unbindEvents(current);
      // Then remove it from the tree.
      this.detachNode(current);
      // Remove it from the node index.
      this.nodes.delete(current.id);
      // Remove any dirty state.
      this.dirtyNodes.delete(current);
      for (let child = current.firstChild; child !== null; child = child.nextSibling) {
        stack.push(child);
      }
    }
    // Structure change: the parent must be re-laid out.
    if (parent !== null) {
      this.markDirty(parent, DirtyFlags.Children);
    }
    // Notify projection consumers (layout engine) last. The
    // engine's detachNode walks the subtree itself, so a single
    // notification covers every removed record.
    this.nodeRemovedListener?.(node);
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

  /**
   * The binding driving one property of one node, if any.
   */
  public getBindingForProperty(node: UiNode, property: NodeProperty): UiBinding<unknown> | undefined {
    return this.nodeBindings.get(node)?.get(property);
  }

  public bind(
    node: UiNode,
    property: NodeProperty,
    observable: Observable<unknown>,
    dirtyFlags: DirtyFlags
  ): UiBinding<unknown> {
    // Make sure the node actually belongs to this graph.
    const registeredNode = this.nodes.get(node.id);
    if (registeredNode !== node) {
      throw new Error(`Cannot bind to node '${node.id}' because it does not belong to this graph.`);
    }
    let byProperty = this.nodeBindings.get(node);
    if (byProperty !== undefined && byProperty.has(property)) {
      throw new Error(`Property '${property}' on node '${node.id}' is already bound.`);
    }
    const bindingId = this.nextBindingId++;
    const binding = new UiBinding(bindingId, node, property, observable, this, dirtyFlags);
    // Global binding lookup.
    this.bindings.set(bindingId, binding);
    // Node → property → binding lookup.
    if (byProperty === undefined) {
      byProperty = new Map<NodeProperty, UiBinding<unknown>>();
      this.nodeBindings.set(node, byProperty);
    }
    byProperty.set(property, binding);
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
    const byProperty = this.nodeBindings.get(binding.node);
    if (byProperty !== undefined && byProperty.get(binding.property) === binding) {
      byProperty.delete(binding.property);
      if (byProperty.size === 0) {
        this.nodeBindings.delete(binding.node);
      }
    }
  }

  public unbindNode(node: UiNode): void {
    const byProperty = this.nodeBindings.get(node);
    if (byProperty === undefined) {
      return;
    }
    // Drop the index first so each unbind() below finds nothing left
    // to remove and cannot mutate the map being iterated.
    this.nodeBindings.delete(node);
    for (const binding of byProperty.values()) {
      binding.disconnect();
      this.bindings.delete(binding.id);
    }
  }

  public handleBindingError(binding: UiBinding<unknown>, error: unknown): void {
    console.error(`UI binding ${binding.id} failed ` + `(${binding.nodeId}.${binding.property})`, error);
    this.unbind(binding);
  }

  public getBindingsForNode(node: UiNode): UiBinding<unknown>[] {
    const byProperty = this.nodeBindings.get(node);
    return byProperty === undefined ? [] : [...byProperty.values()];
  }

  // ---------------------------------------------------------------------------
  // Children bindings
  // ---------------------------------------------------------------------------

  public getChildrenBindingForNode(node: UiNode): UiChildrenBinding | undefined {
    return this.childrenBindings.get(node);
  }

  public bindChildren(fragmentNode: UiNode, binding: UiChildrenBinding): void {
    const registeredNode = this.nodes.get(fragmentNode.id);
    if (registeredNode !== fragmentNode) {
      throw new Error(`Cannot bind children to node '${fragmentNode.id}' because it does not belong to this graph.`);
    }
    this.childrenBindings.set(fragmentNode, binding);
    binding.connect();
  }

  public unbindChildren(node: UiNode): void {
    const binding = this.childrenBindings.get(node);
    if (binding === undefined) {
      return;
    }
    binding.disconnect();
    this.childrenBindings.delete(node);
  }

  // ---------------------------------------------------------------------------
  // Event bindings
  // ---------------------------------------------------------------------------

  public getEventBindingsForNode(node: UiNode): UiEventBinding[] {
    const byType = this.eventBindings.get(node);
    return byType === undefined ? [] : [...byType.values()];
  }

  /**
   * The handler bound to one event type on one node, if any.
   */
  public getEventBindingForType(node: UiNode, type: string): UiEventBinding | undefined {
    return this.eventBindings.get(node)?.get(type);
  }

  public bindEvent(node: UiNode, binding: UiEventBinding): void {
    const registeredNode = this.nodes.get(node.id);
    if (registeredNode !== node) {
      throw new Error(`Cannot bind events to node '${node.id}' because it does not belong to this graph.`);
    }
    let byType = this.eventBindings.get(node);
    if (byType === undefined) {
      byType = new Map();
      this.eventBindings.set(node, byType);
    }
    const existing = byType.get(binding.type);
    if (existing !== undefined) {
      existing.disconnect();
    }
    byType.set(binding.type, binding);
    binding.connect();
  }

  public unbindEvent(node: UiNode, binding: UiEventBinding): void {
    const byType = this.eventBindings.get(node);
    if (byType === undefined || byType.get(binding.type) !== binding) {
      return;
    }
    binding.disconnect();
    byType.delete(binding.type);
    if (byType.size === 0) {
      this.eventBindings.delete(node);
    }
  }

  public unbindEvents(node: UiNode): void {
    const byType = this.eventBindings.get(node);
    if (byType === undefined) {
      return;
    }
    this.eventBindings.delete(node);
    for (const binding of byType.values()) {
      binding.disconnect();
    }
  }

  // ---------------------------------------------------------------------------
  // Dirty state
  // ---------------------------------------------------------------------------

  public markDirty(node: UiNode, flags: DirtyFlags): void {
    const newlyDirty = this.dirtyNodes.mark(node);
    node.dirtyFlags |= flags;
    if ((flags & DirtyFlags.Environment) !== 0) {
      this.environmentDirty = true;
    }
    if (newlyDirty && !this.suppressDirtyListener) {
      this.dirtyListener?.();
    }
  }

  /**
   * Whether any node is waiting for its environment to be rebuilt.
   *
   * Lets a frame skip the environment phase outright, which is the
   * common case: themes change far less often than anything else.
   */
  public hasEnvironmentDirty(): boolean {
    return this.environmentDirty;
  }

  public markDirtyById(id: NodeId, flags: DirtyFlags): void {
    const node = this.requireNode(id);
    this.markDirty(node, flags);
  }

  public clearDirty(node: UiNode): void {
    node.dirtyFlags = DirtyFlags.None;
    this.dirtyNodes.delete(node);
  }

  /**
   * Subscribes to new dirty marks.
   *
   * The listener is invoked once per node that newly enters the
   * dirty set. Pass null to clear the subscription.
   */
  public setDirtyListener(listener: (() => void) | null): void {
    this.dirtyListener = listener;
  }

  /**
   * Subscribes to node removals.
   *
   * The listener is invoked once per removed node. Pass null to
   * clear the subscription.
   */
  public setNodeRemovedListener(listener: ((node: UiNode) => void) | null): void {
    this.nodeRemovedListener = listener;
  }

  /**
   * The shared dirty set, for a scheduler to drain.
   */
  public getDirtyNodes(): DirtyNodeSet {
    return this.dirtyNodes;
  }

  public updateProperty<T>(
    nodeId: string,
    property: string,
    value: T,
    dirtyFlags: DirtyFlags = DirtyFlags.Properties
  ): boolean {
    return this.updateNodeProperty(this.requireNode(nodeId), property, value, dirtyFlags);
  }

  /**
   * Writes a property, marking the node dirty only when the value
   * actually changed.
   *
   * The node-taking form of updateProperty, for callers that already
   * hold the node and would otherwise pay for an id lookup.
   */
  public updateNodeProperty<T>(
    node: UiNode,
    property: string,
    value: T,
    dirtyFlags: DirtyFlags = DirtyFlags.Properties
  ): boolean {
    const previousValue = node.getProperty<T>(property);
    if (Object.is(previousValue, value)) {
      return false;
    }
    node.setProperty(property, value);
    this.markDirty(node, dirtyFlags);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Dirty traversal
  // ---------------------------------------------------------------------------

  /**
   * Drains the dirty set and visits every node of every dirty subtree.
   *
   * Dirty roots can nest, so a node reached from an outer root is not
   * visited again when its own root comes up.
   */
  public processDirty(callback: (node: UiNode) => void): void {
    const roots = this.dirtyNodes.take();
    if (roots.length <= 1) {
      if (roots.length === 1) {
        this.traverse(roots[0], callback);
      }
      return;
    }
    const visited = new Set<UiNode>();
    for (const root of roots) {
      this.traverseOnce(root, visited, callback);
    }
  }

  /**
   * Pre-order traversal that stops at anything an earlier root already
   * covered.
   *
   * A visited node implies a visited subtree, because every traversal
   * runs to the leaves, so the whole branch can be skipped rather than
   * re-walked and filtered.
   */
  private traverseOnce(node: UiNode, visited: Set<UiNode>, callback: (node: UiNode) => void): void {
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    callback(node);
    let child = node.firstChild;
    while (child !== null) {
      this.traverseOnce(child, visited, callback);
      child = child.nextSibling;
    }
  }

  public traverse(node: UiNode, callback: (node: UiNode) => void): void {
    callback(node);
    let child = node.firstChild;
    while (child !== null) {
      this.traverse(child, callback);
      child = child.nextSibling;
    }
  }

  public traverseChildren(node: UiNode, callback: (child: UiNode) => void): void {
    let child = node.firstChild;
    while (child !== null) {
      callback(child);
      child = child.nextSibling;
    }
  }

  // ---------------------------------------------------------------------------
  // Environment propagation
  // ---------------------------------------------------------------------------

  /**
   * Builds the environment a node should use given its parent and its
   * own provider properties.
   */
  public buildNodeEnvironment(node: UiNode): UiEnvironment {
    const parent = node.parent;
    const base = parent !== null ? parent.environment : null;
    let env = base ?? new UiEnvironment(null);

    const theme = node.getProperty<unknown>('theme');
    if (theme !== undefined) {
      env = env.set(UiEnvironmentKeys.theme as UiEnvironmentKey<unknown>, theme);
    }

    const textStyle = node.getProperty<unknown>('textStyle');
    if (textStyle !== undefined) {
      env = env.set(UiEnvironmentKeys.textStyle as UiEnvironmentKey<unknown>, textStyle);
    }

    const contentColor = node.getProperty<unknown>('contentColor');
    if (contentColor !== undefined) {
      env = env.set(UiEnvironmentKeys.contentColor as UiEnvironmentKey<unknown>, contentColor);
    }

    return env;
  }

  /**
   * Assigns an environment to a node and returns whether it changed.
   */
  public setNodeEnvironment(node: UiNode, environment: UiEnvironment): boolean {
    const previous = node.environment;
    if (previous === environment) {
      return false;
    }
    node.environment = environment;
    return true;
  }

  /**
   * Recomputes environments for a node and its descendants after a
   * provider change. Nodes whose environment changes are marked dirty
   * with the flags of the inherited properties they may resolve.
   */
  public propagateEnvironment(node: UiNode): void {
    this.rebuildEnvironment(node, inheritedPropertyFlags);
  }

  /**
   * Processes all nodes carrying the Environment dirty flag, propagating
   * the change to descendants and clearing the flag.
   */
  public processEnvironmentDirty(): void {
    this.environmentDirty = false;
    const nodes = this.dirtyNodes.take();
    // This runs inside the frame that is about to collect the dirty
    // set, so the marks below belong to that frame; letting them reach
    // the listener would arm a redundant one behind it.
    this.suppressDirtyListener = true;
    try {
      for (const node of nodes) {
        if ((node.dirtyFlags & DirtyFlags.Environment) !== 0) {
          node.dirtyFlags &= ~DirtyFlags.Environment;
          this.rebuildEnvironment(node, inheritedPropertyFlags);
        }
        if (node.dirtyFlags !== DirtyFlags.None) {
          this.dirtyNodes.mark(node);
        }
      }
    } finally {
      this.suppressDirtyListener = false;
    }
  }

  private rebuildEnvironment(node: UiNode, inheritedFlags: DirtyFlags): void {
    const previous = node.environment;
    const next = this.buildNodeEnvironment(node);
    const changed = previous === null || !this.environmentsEqual(previous, next);

    // Keep the existing instance when the values match. Environments
    // are immutable snapshots, so holding identity steady is what lets
    // an unchanged subtree be recognised by a pointer compare instead
    // of a key-by-key walk on every propagation.
    if (changed) {
      node.environment = next;
      this.markDirty(node, inheritedFlags);
    }

    let child = node.firstChild;
    while (child !== null) {
      this.rebuildEnvironment(child, inheritedFlags);
      child = child.nextSibling;
    }
  }

  private environmentsEqual(a: UiEnvironment, b: UiEnvironment): boolean {
    // The common case by far: a node that provides nothing gets its
    // parent's environment handed straight back.
    if (a === b) {
      return true;
    }
    if (a.providedSize !== b.providedSize) {
      return false;
    }
    for (const keyName of a.providedKeys()) {
      if (!b.providesOwn(keyName)) {
        return false;
      }
      const previousValue = a.getOwn(keyName);
      const nextValue = b.getOwn(keyName);
      if (Object.is(previousValue, nextValue)) {
        continue;
      }
      // A key without a comparison function falls back to identity
      // rather than counting as a change, which would have re-dirtied
      // the whole subtree on every propagation.
      const key = findEnvironmentKey(keyName);
      const compare = key?.compare;
      if (compare === undefined || !compare(previousValue, nextValue)) {
        return false;
      }
    }
    return true;
  }
}
