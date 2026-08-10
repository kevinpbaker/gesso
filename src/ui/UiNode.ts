import { DirtyFlags } from './DirtyFlags';
import { type UiNodeType } from './UiNodeType';

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
   * public parent: UiNode | null = null;
   *
   *   public firstChild: UiNode | null = null;
   *   public lastChild: UiNode | null = null;
   *
   *   public previousSibling: UINode | null = null;
   *   public nextSibling: UiNode | null = null;
   *
   *   public dirtyFlags: DirtyFlags = DirtyFlags.None;
   * Examples:
   *   text     → "Hello"
   *   opacity  → 0.5
   *   visible  → true
   *   width    → 200
   */
  public readonly properties = new Map<NodeProperty, unknown>();

  hasChildren(): boolean {
    return this.firstChild !== null;
  }

  isDirty(): boolean {
    return this.dirtyFlags !== DirtyFlags.None;
  }
}
