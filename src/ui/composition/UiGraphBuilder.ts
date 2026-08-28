import { Observable } from 'rxjs';

import { UiChildrenBinding } from '../bindings/UiChildrenBinding';
import { DirtyFlags } from '../graph/DirtyFlags';
import { UiGraph } from '../graph/UiGraph';
import type { NodeProperty, UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { propertyEffects } from '../properties/UiPropertyRegistry';
import type { ComponentResolver } from './ComponentResolver';
import {
  type ComponentLikeElement,
  type UiChild,
  type UiElement,
  isComponentLikeElement,
  isObservable
} from './UiElement';
import type { UiProps } from './UiProps';

/**
 * Property reserved for reconciliation identity.
 *
 * The key never becomes a runtime property on the UiNode.
 */
const KEY_PROP = 'key';

export interface UiGraphBuilderOptions {
  /**
   * Mounts components encountered during reconciliation.
   *
   * Without a resolver the builder still reconciles plain elements
   * and observable children; encountering a component throws.
   */
  components?: ComponentResolver;
}

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
 *   - observable child → fragment anchor + children binding
 *   - component child  → fragment anchor + mounted host
 */
export class UiGraphBuilder {
  private nextChildrenBindingId = 0;

  /**
   * Depth of the currently running reconcile pass.
   *
   * reconcileChildren recurses into itself and is also re-entered by
   * UiChildrenBinding when an observable emits. Only the outermost
   * pass flushes onMount hooks, so components observe a fully built
   * subtree rather than a half-reconciled one.
   */
  private reconcileDepth = 0;

  private readonly components: ComponentResolver | undefined;

  constructor(
    private readonly graph: UiGraph,
    options: UiGraphBuilderOptions = {}
  ) {
    this.components = options.components;
  }

  /**
   * Builds (or reconciles) a subtree.
   *
   * Returns the runtime UiNode corresponding to the root of
   * the supplied definition.
   *
   * When no parent is supplied the definition is rendered as
   * the child of the graph root, so repeated calls update the
   * previously rendered tree in place.
   *
   * Note that observable and component definitions produce a
   * transparent Fragment anchor, which is never a valid layout root.
   * Callers that need a layout root must supply a plain UiElement.
   */
  build(definition: UiChild, parentId?: string): UiNode {
    const parent = parentId === undefined ? this.graph.root : this.graph.requireNode(parentId);
    return this.reconcileChildren(parent, [definition]).nodes[0];
  }

  /**
   * Reconciles definitions against the existing children of
   * the parent node.
   *
   * Nodes are matched by key when one is supplied, otherwise
   * by position and type. Matched nodes are reused; missing
   * definitions are created, stale children destroyed, and
   * keyed children moved into definition order.
   *
   * Observable children are anchored by invisible Fragment nodes.
   * A UiChildrenBinding subscribes to the observable and reconciles
   * the fragment's children on each emission.
   */
  reconcileChildren(parent: UiNode, definitions: readonly UiChild[]): { nodes: UiNode[]; changed: boolean } {
    this.reconcileDepth++;
    let result: { nodes: UiNode[]; changed: boolean };
    try {
      result = this.reconcile(parent, definitions);
    } finally {
      this.reconcileDepth--;
    }
    // Deliberately outside the finally: a pass that threw left the
    // tree half-built, and mounting components onto it would only
    // widen the damage.
    if (this.reconcileDepth === 0) {
      this.components?.flushMounts();
    }
    return result;
  }

  private reconcile(parent: UiNode, definitions: readonly UiChild[]): { nodes: UiNode[]; changed: boolean } {
    const existing = this.collectChildren(parent);
    const matched = new Set<UiNode>();
    const result: UiNode[] = [];
    let changed = false;
    let cursor: UiNode | null = parent.firstChild;

    for (const [index, definition] of definitions.entries()) {
      if (isObservable(definition)) {
        const fragment = this.reconcileObservableChild(parent, index, definition, matched, cursor);
        if (fragment !== undefined) {
          if (this.moveBefore(parent, fragment, cursor)) {
            changed = true;
          }
          cursor = fragment.nextSibling;
          result.push(fragment);
        }
        continue;
      }

      if (isComponentLikeElement(definition)) {
        const anchor = this.reconcileComponentChild(parent, index, definition, matched, cursor);
        if (this.moveBefore(parent, anchor, cursor)) {
          changed = true;
        }
        cursor = anchor.nextSibling;
        result.push(anchor);
        continue;
      }

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
          this.removeSubtree(stale);
          // Prevent the final cleanup from removing it a second time.
          matched.add(stale);
          changed = true;
        }
        node = this.createNode(parent, definition, index);
        matched.add(node);
        changed = true;
      } else {
        matched.add(node);
        this.reconcileProps(node, definition.props);
        if (this.reconcileChildren(node, definition.children).changed) {
          changed = true;
        }
      }
      if (this.moveBefore(parent, node, cursor)) {
        changed = true;
      }
      cursor = node.nextSibling;
      result.push(node);
    }

    for (const node of existing) {
      if (!matched.has(node)) {
        this.removeSubtree(node);
        changed = true;
      }
    }
    if (changed) {
      this.graph.markDirty(parent, DirtyFlags.Children);
    }
    return { nodes: result, changed };
  }

  /**
   * Reconciles a single observable child definition.
   *
   * Creates or reuses a Fragment anchor under the parent and ensures
   * a UiChildrenBinding is subscribed to the observable.
   */
  private reconcileObservableChild(
    parent: UiNode,
    index: number,
    observable: Observable<UiElement | UiElement[]>,
    matched: Set<UiNode>,
    cursor: UiNode | null
  ): UiNode {
    const fragmentId = this.createFragmentId(parent, index);
    let fragment = this.graph.getNode(fragmentId);

    if (fragment !== undefined && fragment.type !== UiNodeType.Fragment) {
      // A non-fragment node occupied this slot; remove it so the
      // fragment can take its place.
      if (cursor === fragment) {
        cursor = fragment.nextSibling;
      }
      this.removeSubtree(fragment);
      matched.add(fragment);
      fragment = undefined;
    }

    if (fragment === undefined) {
      fragment = this.graph.createNode(fragmentId, UiNodeType.Fragment);
      this.graph.insertBefore(parent, fragment, cursor);
    } else {
      matched.add(fragment);
    }

    const existingBinding = this.graph.getChildrenBindingForNode(fragment);
    if (existingBinding === undefined || existingBinding.observable !== observable) {
      if (existingBinding !== undefined) {
        this.graph.unbindChildren(fragment);
      }
      const bindingId = this.nextChildrenBindingId++;
      const binding = new UiChildrenBinding(bindingId, parent.id, fragment.id, observable, this.graph, this);
      this.graph.bindChildren(fragment, binding);
    }

    return fragment;
  }

  /**
   * Reconciles a single component child definition.
   *
   * Creates or reuses a Fragment anchor under the parent, asks the
   * resolver for the component's current output, and reconciles that
   * output as the anchor's children.
   *
   * The anchor — not the rendered node — is the component's identity.
   * That keeps identity stable when the component renders a different
   * root element type, lets the output be an Observable (which becomes
   * a children binding on the anchor for free), and makes host
   * teardown a plain consequence of the anchor being removed.
   */
  private reconcileComponentChild(
    parent: UiNode,
    index: number,
    element: ComponentLikeElement,
    matched: Set<UiNode>,
    cursor: UiNode | null
  ): UiNode {
    const resolver = this.components;
    if (resolver === undefined) {
      throw new Error(
        `Component '${element.tag}' was passed to a UiGraphBuilder with no ComponentResolver. ` +
          `Construct the builder with { components } to mount components.`
      );
    }

    const anchorId = this.createComponentAnchorId(parent, element, index);
    let anchor = this.graph.getNode(anchorId);

    if (anchor !== undefined && anchor.type !== UiNodeType.Fragment) {
      // A non-fragment node occupied this slot; remove it so the
      // anchor can take its place.
      if (cursor === anchor) {
        cursor = anchor.nextSibling;
      }
      this.removeSubtree(anchor);
      matched.add(anchor);
      anchor = undefined;
    }

    if (anchor === undefined) {
      anchor = this.graph.createNode(anchorId, UiNodeType.Fragment);
      this.graph.insertBefore(parent, anchor, cursor);
    } else {
      matched.add(anchor);
    }

    this.reconcileChildren(anchor, [resolver.resolve(element, anchorId)]);
    return anchor;
  }

  /**
   * Removes a subtree, releasing any component hosts it anchors.
   *
   * Every node removal in this class goes through here so that a host
   * can never outlive the nodes it produced. Hosts are released from
   * the outside in: a parent component's onUnmount runs before its
   * children's, matching the order in which the subtree is leaving.
   */
  private removeSubtree(node: UiNode): void {
    const resolver = this.components;
    if (resolver !== undefined) {
      const stack: UiNode[] = [node];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (current.type === UiNodeType.Fragment) {
          resolver.release(current.id);
        }
        for (let child = current.firstChild; child !== null; child = child.nextSibling) {
          stack.push(child);
        }
      }
    }
    this.graph.removeNode(node);
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
  private moveBefore(parent: UiNode, node: UiNode, reference: UiNode | null): boolean {
    if (node.parent !== parent) {
      this.graph.insertBefore(parent, node, reference);
      return true;
    }
    if (node === reference || node.nextSibling === reference) {
      return false;
    }
    this.graph.detachNode(node);
    this.graph.insertBefore(parent, node, reference);
    return true;
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
        this.graph.bind(node, property as NodeProperty, value, propertyEffects(property));
        continue;
      }
      if (existingBinding !== undefined) {
        this.graph.unbind(existingBinding);
      }
      this.graph.updateProperty(node.id, property as NodeProperty, value, propertyEffects(property));
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

  /**
   * Generates a stable id for an observable-child fragment anchor.
   */
  private createFragmentId(parent: UiNode, index: number): string {
    return `${parent.id}:fragment:${index}`;
  }

  /**
   * Generates a stable id for a component's fragment anchor.
   *
   * Keyed components use their key, so a component keeps its instance
   * across reorders. Unkeyed components fall back to position, which
   * is stable only while the surrounding structure does not reorder —
   * the same trade-off unkeyed elements make.
   */
  private createComponentAnchorId(parent: UiNode, element: ComponentLikeElement, index: number): string {
    const key = element.key === undefined || element.key === null ? index : element.key;
    return `${parent.id}:component:${String(key)}`;
  }
}
