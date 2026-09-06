import { Observable } from 'rxjs';

import { UiChildrenBinding } from '../bindings/UiChildrenBinding';
import { UiEventBinding } from '../bindings/UiEventBinding';
import { DirtyFlags } from '../graph/DirtyFlags';
import { UiGraph } from '../graph/UiGraph';
import type { NodeProperty, UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiEventListener, UiInputDispatcher } from '../input/UiInputDispatcher';
import {
  closestPropertyName,
  findPropertyDefinition,
  getPropertyNames,
  propertyEffects
} from '../properties/UiPropertyRegistry';
import { eventTypeForProp, isEventProp, knownEventPropNames } from './UiEventProps';
import type { ComponentResolver } from './ComponentResolver';
import {
  type ComponentLikeElement,
  type UiChild,
  type UiElement,
  isComponentLikeElement,
  isObservable
} from './UiElement';
import type { UiNodeRef } from './UiElementProps';
import type { UiProps } from './UiProps';
import {
  UiModifierSet,
  assertModifierList,
  type UiModifierEnvironment,
  type UiModifierFocus,
  type UiModifierLayout
} from '../modifiers/UiModifierSet';
import { assertTransitionMap, type AnimationDriver, type UiSharedElements, type UiTransitionSpec } from '../animation';
import { NodeTransitions } from '../graph/UiPropertyTransitions';

/**
 * Property reserved for reconciliation identity.
 *
 * The key never becomes a runtime property on the UiNode.
 */
const KEY_PROP = 'key';
/**
 * `ref` receives the UiNode an element produced, and null when the
 * node is removed. It is how a component gets hold of a node to hand
 * to `anchor`, or to focus imperatively.
 */
const REF_PROP = 'ref';
/**
 * `modifiers` attaches behaviour to an element without wrapping it.
 * Reconciled like children — matched by kind and slot — and detached
 * with the node. See `packages/core/src/modifiers`.
 */
const MODIFIERS_PROP = 'modifiers';
/**
 * `transition` says how a property gets from one value to the next.
 *
 * The fourth reserved name, beside `key`, `ref` and `modifiers`, and
 * for the same reason those three are reserved rather than registered:
 * every one of them is about the *element* — its identity, who holds
 * its node, what is attached to it — rather than a value on the node.
 * Nothing in layout, paint, input or the environment ever reads a
 * `transition`; `propertyEffects('transition')` would have no meaning,
 * and registering it would make it bindable and overridable, which is
 * nonsense for a description of how other properties are written.
 * `MODIFIERS_ROADMAP.md` §4's rule that the registry's closedness is
 * load-bearing is exactly the argument for keeping it out.
 */
const TRANSITION_PROP = 'transition';

export type { UiNodeRef } from './UiElementProps';

function knownPropertyNames(): string[] {
  return getPropertyNames();
}

function describeValueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'an array';
  }
  return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
}

export interface UiGraphBuilderOptions {
  /**
   * Mounts components encountered during reconciliation.
   *
   * Without a resolver the builder still reconciles plain elements
   * and observable children; encountering a component throws.
   */
  components?: ComponentResolver;

  /**
   * Receives listeners declared with `on*` props.
   *
   * Without a dispatcher those props are ignored (with one warning),
   * which keeps headless graph construction and non-interactive
   * renders working.
   */
  dispatcher?: UiInputDispatcher;

  /**
   * Lets a modifier read its node's box and follow it.
   *
   * Supplied by the runtime, which is where the layout engine lives.
   * Without it `host.onLayout` warns once and does nothing, as event
   * registration does without a dispatcher.
   */
  layout?: UiModifierLayout;

  /**
   * Lets a modifier move focus, read whether its node has it, and
   * follow it. Supplied by the runtime, which owns the focus manager.
   * Without it those calls warn once and do nothing, as `onLayout`
   * does without layout access.
   */
  focus?: UiModifierFocus;

  /**
   * Lets a modifier read the values its node inherits and follow them.
   * Without it `host.environment` answers with the key's default —
   * which is what an unprovided key resolves to anyway — and
   * `onEnvironment` warns once.
   */
  environment?: UiModifierEnvironment;

  /**
   * Drives the animations a `transition` prop asks for.
   *
   * Supplied by the runtime, which owns the driver and the `ticks`
   * phase that advances it. Without one a `transition` is still
   * validated — a typo in it throws whether or not anything animates —
   * and every write lands directly, so a headless build renders the
   * final values.
   */
  animations?: AnimationDriver;

  /**
   * Remembers which node currently answers to each shared-element
   * name, so a node arriving under a name can morph from where the
   * node leaving under it stood.
   *
   * Supplied by the runtime, one per runtime, for the reason the
   * driver is: several runtimes share a worker in the playground, and
   * a shared registry would let one runtime's element morph from
   * another's. Without one the `sharedElement` modifier warns once and
   * the element simply appears, which is the correct degraded
   * behaviour — no animation rather than a wrong one.
   */
  sharedElements?: UiSharedElements;
}

/**
 * Where one reconcile pass has got to in the parent's existing
 * children while matching the unkeyed definitions among them.
 *
 * An unkeyed definition has no identity of its own, so it takes the
 * first child that is still unclaimed and of the right type. Searching
 * for that from the start of the list every time is what made a flat
 * list of n unkeyed children cost n²/2 comparisons: definition i walks
 * past the i entries the definitions before it already took. A cursor
 * naming where the next search may begin walks that ground once across
 * the whole pass instead of once per definition.
 *
 * There is a cursor per node type rather than one for the pass, because
 * a single cursor can only be moved past entries that are *claimed*,
 * and a run of those is not the only thing a search wastes its time on.
 * A list of two interleaved types whose definitions all want one of
 * them has an unclaimed entry of the wrong type at the front for the
 * whole pass, which pins one shared cursor at zero and leaves every
 * definition rescanning the list. Per type, that entry is skipped for
 * good, and each type's searching adds up to one walk of the list.
 *
 * It is pass state rather than builder state on purpose. `reconcile`
 * re-enters itself, through `reconcileChildren` for every matched child
 * and through the deferred-children path for a fragment whose binding
 * emitted mid-pass, and each of those passes has its own `existing`
 * snapshot and its own `matched` set. Cursors held on the builder would
 * be shared between them and would point into the wrong list.
 */
interface UnkeyedMatchState {
  /** The parent's children when the pass began, in tree order. */
  readonly existing: readonly UiNode[];
  /**
   * Per node type, the index where the next search for that type may
   * begin. Built on the first unkeyed match rather than with the pass,
   * so the leaf nodes a pass recurses into, which have no children to
   * match at all, do not each pay for a map they never read.
   */
  cursors: Map<UiNodeType, number> | null;
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
  private readonly refs = new Map<UiNode, UiNodeRef>();
  private readonly modifiers = new Map<UiNode, UiModifierSet>();
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
  /** Fragments whose pass is on the stack, and the emissions they must run afterwards. */
  private readonly reconciling = new Set<UiNode>();
  private readonly deferredChildren = new Map<UiNode, readonly UiChild[]>();

  private readonly components: ComponentResolver | undefined;

  private readonly dispatcher: UiInputDispatcher | undefined;

  private readonly layout: UiModifierLayout | undefined;
  private readonly focus: UiModifierFocus | undefined;
  private readonly modifierEnvironment: UiModifierEnvironment | undefined;
  private readonly animations: AnimationDriver | undefined;
  private readonly sharedElements: UiSharedElements | undefined;

  /** Ensures the missing-dispatcher warning is emitted at most once. */
  private warnedAboutDispatcher = false;
  /** The same, for a `transition` with no driver behind it. */
  private warnedAboutAnimations = false;
  /** The same, for a list that arrived from an observable with no keys on it. */
  private warnedAboutIndexKeys = false;

  constructor(
    private readonly graph: UiGraph,
    options: UiGraphBuilderOptions = {}
  ) {
    this.components = options.components;
    this.dispatcher = options.dispatcher;
    this.layout = options.layout;
    this.focus = options.focus;
    this.modifierEnvironment = options.environment;
    this.animations = options.animations;
    this.sharedElements = options.sharedElements;
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
    if (this.reconciling.has(parent)) {
      // A binding emitted into a fragment whose own pass is still on the
      // stack: a component body, run while its list was being
      // reconciled, wrote to the observable that holds the list. The
      // pass in progress works from a snapshot of the chain and would
      // continue over one a second pass had rewritten, leaving nodes
      // registered but unreachable. Keep the newest definitions and run
      // them once the pass returns; only the last emission matters.
      this.deferredChildren.set(parent, definitions);
      return { nodes: this.collectChildren(parent), changed: false };
    }
    this.reconciling.add(parent);
    this.reconcileDepth++;
    let result: { nodes: UiNode[]; changed: boolean };
    try {
      result = this.reconcile(parent, definitions);
    } finally {
      this.reconcileDepth--;
      this.reconciling.delete(parent);
    }
    const deferred = this.deferredChildren.get(parent);
    if (deferred !== undefined) {
      this.deferredChildren.delete(parent);
      return this.reconcileChildren(parent, deferred);
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
    const unkeyed: UnkeyedMatchState = { existing, cursors: null };
    if (!this.warnedAboutIndexKeys && definitions.length > 1 && parent.type === UiNodeType.Fragment) {
      // A list that arrived from an observable and carries no keys is
      // matched by position, so inserting a row anywhere but the end
      // shifts every row after it onto a different node: state moves
      // between rows and an animation runs on the wrong element. The
      // fallback is silent otherwise, and silence is the defect.
      // `each` supplies the key; this is the hand-written case.
      this.warnedAboutIndexKeys = definitions.every(child => this.isIndexKeyed(child));
      if (this.warnedAboutIndexKeys) {
        console.warn(
          `A list of ${definitions.length} children under '${parent.id}' arrived from an observable with no keys, ` +
            `so it is reconciled by index. Give each child a key, or build the list with \`each\`, ` +
            `which supplies one: each(items, 'id', item => ...).`
        );
      }
    }
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

      let node = this.matchNode(parent, definition, unkeyed, matched);
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
    observable: Observable<UiChild | readonly UiChild[]>,
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
    if ((element.props as Record<string, unknown>)[MODIFIERS_PROP] !== undefined) {
      // A component's root may be a fragment or an observable, so
      // "the host node" a modifier would attach to is not well
      // defined. Put them on an element inside the component instead.
      throw new Error(
        `Component '${element.tag}' cannot take 'modifiers': a component's node is its anchor, which is a ` +
          `fragment with no box and no paint, so there is nothing for a modifier to attach to. Put them on an ` +
          `element the component renders, or, if the component offers it, pass 'rootModifiers', which is the ` +
          `convention for a component that places them on its own root element (see 'modifiersOf').`
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
    const stack: UiNode[] = [node];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (resolver !== undefined && current.type === UiNodeType.Fragment) {
        resolver.release(current.id);
      }
      const ref = this.refs.get(current);
      if (ref !== undefined) {
        this.refs.delete(current);
        ref(null);
      }
      // Before graph.removeNode, so a modifier's teardown still sees an
      // intact node and its bindings.
      const modifiers = this.modifiers.get(current);
      if (modifiers !== undefined) {
        this.modifiers.delete(current);
        modifiers.detach();
      }
      // An animation outliving its node is the same leak a modifier
      // would be: the driver holds the cell, the cell holds the node.
      if (current.transitions !== null) {
        current.transitions.release();
        current.transitions = null;
      }
      for (let child = current.firstChild; child !== null; child = child.nextSibling) {
        stack.push(child);
      }
    }
    this.graph.removeNode(node);
  }

  /**
   * Hands the node to a `ref` callback once, and again only when the
   * callback identity changes. Removal calls the current one with null.
   */
  private reconcileRef(node: UiNode, value: unknown): void {
    const previous = this.refs.get(node);
    if (typeof value !== 'function') {
      if (previous !== undefined) {
        this.refs.delete(node);
        previous(null);
      }
      return;
    }
    const ref = value as UiNodeRef;
    if (previous === ref) {
      return;
    }
    if (previous !== undefined) {
      previous(null);
    }
    this.refs.set(node, ref);
    ref(node);
  }

  /**
   * Finds an existing child that should host a definition.
   *
   * Keyed definitions match by the id derived from the key, which is a
   * map lookup and needs no search. Unkeyed definitions match the first
   * unmatched child with the same type, searched for from the pass's
   * cursor rather than from the head of the list.
   */
  private matchNode(
    parent: UiNode,
    definition: UiElement,
    unkeyed: UnkeyedMatchState,
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

    const existing = unkeyed.existing;
    const type = definition.type;
    let cursors = unkeyed.cursors;
    if (cursors === null) {
      cursors = new Map<UiNodeType, number>();
      unkeyed.cursors = cursors;
    }

    // Walk this type's cursor to the first entry that could answer for
    // it, dropping everything passed over on the way. Both grounds for
    // dropping an entry are settled for the rest of the pass:
    //
    // Claimed. Nothing ever leaves `matched` within a pass and a
    // claimed entry is never returned twice, so an entry claimed now is
    // one every later search would skip anyway.
    //
    // Wrong type. This is the part worth pausing on, because it is only
    // permanent for a cursor that belongs to one type. A node's type is
    // fixed from the moment it is created, and a type change is a
    // different node replacing this one rather than this one changing,
    // so an entry that is not a T now will not be a T later either, and
    // no later definition of type T can want it. A cursor shared by
    // every type could make no such promise: the entry it stepped over
    // was merely the wrong type for the definition in hand, and the
    // next definition might be exactly the type it is.
    //
    // What the cursor may not do is move past the entry it lands on. A
    // keyed definition can claim an entry anywhere in the list, so the
    // free entries a cursor has already reached must stay reachable;
    // the walk resumes here next time and re-tests this entry then.
    let index = cursors.get(type) ?? 0;
    while (index < existing.length && (matched.has(existing[index]) || existing[index].type !== type)) {
      index++;
    }
    cursors.set(type, index);

    // The walk stopped either on an unclaimed entry of the right type,
    // which is the first such entry in the list and so the one `find`
    // over the whole array would have returned, or off the end.
    return index < existing.length ? existing[index] : undefined;
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
    this.reconcileProps(node, definition.props, parent);
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
  private reconcileProps(node: UiNode, props: UiProps, parent?: UiNode): void {
    // Installed before this pass writes anything, so a re-render that
    // both adds a transition and changes the value it covers animates
    // rather than jumping once and animating from then on. The prop is
    // read out of `props` directly because the loop below has not run
    // yet; it is skipped there, like `key`, `ref` and `modifiers`.
    this.reconcileTransitions(node, (props as Record<string, unknown>)[TRANSITION_PROP]);
    const present = new Set<string>();
    const presentEvents = new Set<string>();
    let declaredModifiers: unknown;

    for (const [property, value] of Object.entries(props)) {
      if (property === KEY_PROP) {
        continue;
      }
      if (property === REF_PROP) {
        this.reconcileRef(node, value);
        continue;
      }
      if (property === MODIFIERS_PROP) {
        declaredModifiers = value;
        continue;
      }
      if (property === TRANSITION_PROP) {
        continue;
      }
      if (isEventProp(property, value)) {
        this.reconcileEventProp(node, property, value as UiEventListener, presentEvents);
        continue;
      }
      this.assertKnownProp(node, property, value);
      present.add(property);
      this.assertValidValue(node, property, value);
      // The graph indexes bindings by node and property, so this asks
      // it directly rather than copying the node's whole binding set
      // into a lookup table on every reconcile.
      const existingBinding = this.graph.getBindingForProperty(node, property as NodeProperty);
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
      this.graph.updateNodeProperty(node, property as NodeProperty, value, propertyEffects(property));
    }

    // Tear down what this render stopped declaring. Both lists are
    // materialised up front because unbinding mutates the indexes they
    // come from.
    for (const binding of this.graph.getBindingsForNode(node)) {
      if (!present.has(binding.property)) {
        this.graph.unbind(binding);
      }
    }

    for (const binding of this.graph.getEventBindingsForNode(node)) {
      if (!presentEvents.has(binding.type)) {
        this.graph.unbindEvent(node, binding);
      }
    }

    if (node.environment === null && parent?.environment != null) {
      // A freshly built node is not in the tree yet — the builder
      // writes its props and builds its children before making the
      // edge — so what it inherits is not reachable from it. Seeding
      // it here, after the node's own provider props are written and
      // before its modifiers attach, is what makes `host.environment`
      // answer with the theme the node will actually be under rather
      // than with the default. `inheritEnvironment` recomputes at
      // attach and keeps this instance when it agrees, so nothing is
      // marked dirty twice.
      node.environment = this.graph.buildNodeEnvironment(node, parent);
    }

    this.reconcileModifiers(node, declaredModifiers);
  }

  /**
   * Attaches, updates and detaches the node's modifiers.
   *
   * Called once the declared props are written and before the
   * children are reconciled, so a modifier sees the element's own
   * values first. An element that stops declaring `modifiers` gets an
   * empty list, which detaches everything it had.
   */
  private reconcileModifiers(node: UiNode, declared: unknown): void {
    const existing = this.modifiers.get(node);
    if (declared === undefined) {
      if (existing !== undefined) {
        existing.detach();
        this.modifiers.delete(node);
      }
      return;
    }
    const list = assertModifierList(node, declared);
    const set =
      existing ??
      new UiModifierSet(
        node,
        this.graph,
        this.dispatcher,
        this.layout,
        this.focus,
        this.modifierEnvironment,
        this.animations,
        this.sharedElements
      );
    if (existing === undefined) {
      this.modifiers.set(node, set);
    }
    set.reconcile(list);
  }

  /**
   * Installs, updates or removes the node's transitions.
   *
   * An element that stops declaring `transition` loses it entirely,
   * cancelling whatever was in flight — the same rule `modifiers`
   * follows, and the same reason: what an element declares this render
   * is the whole truth about it.
   */
  private reconcileTransitions(node: UiNode, declared: unknown): void {
    if (declared === undefined) {
      if (node.transitions !== null) {
        node.transitions.release();
        node.transitions = null;
      }
      return;
    }
    const specs = assertTransitionMap(node.id, declared, name => findPropertyDefinition(name) !== undefined);
    const driver = this.animations;
    if (driver === undefined) {
      // Validated but not driven: a headless build writes final values.
      this.warnMissingAnimations();
      return;
    }
    let transitions = node.transitions;
    if (transitions === null) {
      transitions = new NodeTransitions(node, this.graph, driver);
      node.transitions = transitions;
    }
    (transitions as NodeTransitions).setSpecs(specs as ReadonlyMap<string, UiTransitionSpec>);
  }

  private warnMissingAnimations(): void {
    if (this.warnedAboutAnimations) {
      return;
    }
    this.warnedAboutAnimations = true;
    console.warn(
      `An element declared a 'transition', but the UiGraphBuilder was constructed without an animation driver. ` +
        `Values are written directly. Construct it with { animations }, as the runtime does.`
    );
  }

  /** The modifiers attached to a node, for the inspector and for tests. */
  modifiersFor(node: UiNode): UiModifierSet | undefined {
    return this.modifiers.get(node);
  }

  /**
   * Rejects a prop nothing will ever read.
   *
   * Every property layout, paint, input or the environment consults is
   * registered in UiProperties, so a name outside the registry is a
   * typo (`widht`) or a prop meant for a component rather than an
   * element. Either would otherwise be stored on the node and silently
   * ignored; `on*` typos have always thrown, and so does this now.
   */
  private assertKnownProp(node: UiNode, property: string, value: unknown): void {
    if (findPropertyDefinition(property) !== undefined) {
      return;
    }
    if (eventTypeForProp(property) !== undefined) {
      throw new Error(
        `Event prop '${property}' on node '${node.id}' must be a function, got ${describeValueType(value)}.`
      );
    }
    const suggestion = closestPropertyName(property, [...knownPropertyNames(), ...knownEventPropNames()]);
    throw new Error(
      `Unknown prop '${property}' on node '${node.id}'.` +
        (suggestion !== undefined ? ` Did you mean '${suggestion}'?` : '') +
        ` Props must be registered UI properties (width, padding, backgroundColor, …), 'key', 'ref',` +
        ` 'modifiers', 'transition', or on* event handlers.`
    );
  }

  /**
   * Rejects a value a registered property cannot hold.
   *
   * Only properties with a closed set of values declare a `validate`,
   * so this is one undefined check for the other ninety-odd. An
   * Observable is not checked here — its values arrive later, and a
   * bound value is the reader's to reject, as a bound length is
   * rejected at layout.
   */
  private assertValidValue(node: UiNode, property: string, value: unknown): void {
    const definition = findPropertyDefinition<unknown>(property);
    if (definition?.validate === undefined || this.isObservable(value)) {
      return;
    }
    const message = definition.validate(value);
    if (message !== undefined) {
      throw new Error(`Invalid '${property}' on node '${node.id}': ${message}`);
    }
  }

  /**
   * Binds one `on*` prop to the input dispatcher.
   *
   * An existing binding for the same event is kept when the handler
   * identity is unchanged, so re-reconciling a stable tree does not
   * churn listener registrations.
   */
  private reconcileEventProp(
    node: UiNode,
    property: string,
    handler: UiEventListener,
    presentEvents: Set<string>
  ): void {
    const type = eventTypeForProp(property);
    if (type === undefined) {
      throw new Error(
        `Unknown event prop '${property}' on node '${node.id}'. ` +
          `Expected one of: ${knownEventPropNames().join(', ')}.`
      );
    }
    presentEvents.add(type);

    const existing = this.graph.getEventBindingForType(node, type);
    if (existing !== undefined) {
      if (existing.listener === handler) {
        return;
      }
      this.graph.unbindEvent(node, existing);
    }

    if (this.dispatcher === undefined) {
      this.warnMissingDispatcher(property);
      return;
    }
    this.graph.bindEvent(node, new UiEventBinding(node, type, handler, this.dispatcher));
  }

  private warnMissingDispatcher(property: string): void {
    if (this.warnedAboutDispatcher) {
      return;
    }
    this.warnedAboutDispatcher = true;
    console.warn(
      `UiGraphBuilder received event prop '${property}' but was constructed without a dispatcher, ` +
        `so it and any further event props are ignored. Pass { dispatcher } to make the tree interactive.`
    );
  }

  /**
   * Determines whether a prop's value is an Observable to bind.
   *
   * The shared structural check rather than `instanceof Observable`,
   * for the reason `isObservable` in `UiElement.ts` already gives for
   * children: an application whose bundle holds a second copy of rxjs
   * produces observables that fail an `instanceof` against this one.
   * Children were structural and props were not, so an app-authored
   * `combineLatest` reached a child correctly and reached a prop as a
   * plain object, which is written once and never updates. It fails
   * silently, which is what makes it worth a named method: nothing
   * warns, nothing throws, and the element simply has no text.
   */
  private isObservable(value: unknown): value is Observable<unknown> {
    return isObservable(value);
  }

  /** Whether a child would fall back to its position for identity. */
  private isIndexKeyed(child: UiChild): boolean {
    if (isObservable(child)) {
      return true;
    }
    if (isComponentLikeElement(child)) {
      return child.key === undefined || child.key === null;
    }
    return this.elementKey(child) === undefined;
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
