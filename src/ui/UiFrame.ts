import { DirtyFlags } from './DirtyFlags';
import type { UiFrameTime } from './UiFrameClock';
import type { UiNode } from './UiNode';

/**
 * The unit of work produced by one scheduler frame.
 *
 * The dirty nodes and their flags are snapshotted when the
 * frame is collected, so a node dirtied again while the frame
 * is being processed belongs to the next frame.
 */
export class UiFrame {
  constructor(
    public readonly id: number,
    public readonly time: UiFrameTime,
    private readonly dirty: ReadonlyMap<UiNode, DirtyFlags>
  ) {}

  get nodes(): UiNode[] {
    return [...this.dirty.keys()];
  }

  get size(): number {
    return this.dirty.size;
  }

  isEmpty(): boolean {
    return this.dirty.size === 0;
  }

  dirtyFlagsFor(node: UiNode): DirtyFlags {
    return this.dirty.get(node) ?? DirtyFlags.None;
  }
}
