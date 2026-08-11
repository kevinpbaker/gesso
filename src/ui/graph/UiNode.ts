import { DirtyFlags } from './DirtyFlags';
import { type UiNodeType } from './UiNodeType';
import type { UiEnvironment } from '../environment/UiEnvironment';

export type NodeId = string;
export type NodeProperty = string;

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
   * The scoped environment this node reads inherited values from.
   *
   * Null means the node uses the default environment values. The
   * environment is assigned by the graph builder when a node or an
   * ancestor provides environment values.
   */
  public environment: UiEnvironment | null = null;

  /**
   * Records environment values this node resolved so that reactive
   * environment changes can invalidate only nodes that depend on
   * them.
   */
  public readonly environmentDependencies = new Map<string, unknown>();

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
