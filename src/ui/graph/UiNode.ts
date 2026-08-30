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
