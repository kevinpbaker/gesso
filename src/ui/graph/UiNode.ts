import { DirtyFlags } from './DirtyFlags';
import { type UiNodeType } from './UiNodeType';
import type { UiEnvironment } from '../environment/UiEnvironment';
import type { DecorationShape } from '../rendering/Decorations';

export type NodeId = string;
export type NodeProperty = string;

/** One modifier's write of one property. `order` is its position in the list. */
export interface UiPropertyOverride {
  readonly source: symbol;
  /** The modifier kind's name, for the conflict warning and the inspector. */
  readonly name: string;
  order: number;
  value: unknown;
}

/**
 * The cascade for one overridden property: the element's own value,
 * and the modifier writes stacked on top of it in list order.
 */
export interface UiPropertyOverrides {
  /** What the element declared. Absent means it declared nothing. */
  declared: { present: boolean; value: unknown };
  /** Ordered by `order`; the last one wins. */
  entries: UiPropertyOverride[];
}

/**
 * The transitions an element declared, as the graph sees them.
 *
 * Structural rather than the class itself so that `UiNode` — which
 * every part of the engine imports — does not pull in the animation
 * module. `UiPropertyTransitions.ts` holds the implementation and the
 * argument for where it sits.
 */
export interface UiNodeTransitions {
  /** Takes over a write by animating towards it, or declines it. */
  write(property: NodeProperty, value: unknown, flags: DirtyFlags): boolean;
  /** Cancels everything, for a node leaving the tree. */
  release(): void;
}

export class UiNode {
  constructor(
    public readonly id: NodeId,
    public readonly type: UiNodeType
  ) {}

  public parent: UiNode | null = null;

  public firstChild: UiNode | null = null;
  public lastChild: UiNode | null = null;

  public previousSibling: UiNode | null = null;
  public nextSibling: UiNode | null = null;

  public dirtyFlags: DirtyFlags = DirtyFlags.None;

  /**
   * Runtime values for this node.
   * Examples:
   *   text     → "Hello"
   *   opacity  → 0.5
   *   visible  → true
   *   width    → 200
   */
  public readonly properties = new Map<NodeProperty, unknown>();

  /**
   * Values a modifier has written over the element's own.
   *
   * Null until the first modifier writes, so a tree without modifiers
   * pays one field read per property write and nothing else. See
   * `UiPropertyOverrides.ts` for how the effective value is resolved.
   */
  public overrides: Map<NodeProperty, UiPropertyOverrides> | null = null;

  /**
   * The scoped environment this node reads inherited values from.
   *
   * Null means the node uses the default environment values. The
   * environment is assigned by the graph builder when a node or an
   * ancestor provides environment values.
   */
  public environment: UiEnvironment | null = null;

  /**
   * Shapes the node's modifiers put in its own paint pass, merged in
   * modifier order.
   *
   * Null until a modifier decorates, so the cost to an undecorated
   * node is the one null check each renderer already makes per node,
   * and a tree of ten thousand plain boxes pays nothing. Written only
   * through `UiModifierHost.decorate`; see `rendering/Decorations.ts`
   * for what a shape means and where it lands.
   */
  public decorations: readonly DecorationShape[] | null = null;

  /**
   * How this node's properties get from one value to the next.
   *
   * Null until the element declares a `transition`, so the cost to a
   * tree without one is a field read on the property write path — the
   * same shape, and the same argument, as `overrides` above.
   */
  public transitions: UiNodeTransitions | null = null;

  hasChildren(): boolean {
    return this.firstChild !== null;
  }

  isDirty(): boolean {
    return this.dirtyFlags !== DirtyFlags.None;
  }

  getProperty<T>(property: NodeProperty): T | undefined {
    return this.properties.get(property) as T | undefined;
  }

  setProperty<T>(property: NodeProperty, value: T): void {
    this.properties.set(property, value);
  }
}
