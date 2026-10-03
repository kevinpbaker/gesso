import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiFrameTime } from './UiFrameClock';
import type { UiNode } from '../graph/UiNode';

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

  /**
   * The dirty nodes as an array.
   *
   * Copies, so it is the wrong thing to reach for on the frame path:
   * prefer `entries()` to walk them, and `anyFlags` to ask a question
   * about them. It stays because a caller that needs to hold the list
   * past the walk, or to index into it, wants a copy and should get an
   * honest one rather than a view that changes underneath it.
   */
  get nodes(): UiNode[] {
    return [...this.dirty.keys()];
  }

  /**
   * The dirty nodes with their flags, without copying either.
   *
   * The pairing matters as much as the absence of a copy. Walking
   * `nodes` and calling `dirtyFlagsFor` on each one asks the map for
   * something it just handed over, so a frame of a thousand dirty
   * nodes paid an array and a thousand lookups to learn what iterating
   * the entries says for free.
   */
  entries(): IterableIterator<[UiNode, DirtyFlags]> {
    return this.dirty.entries();
  }

  /**
   * Whether any node in the frame carries one of `flags`.
   *
   * The question the runtime actually asks three times a frame: does
   * this frame need layout, does it need semantics, did it change the
   * tree. Answering it here lets it stop at the first node that says
   * yes, which on a frame that does need layout is usually the first
   * node looked at.
   */
  anyFlags(flags: DirtyFlags): boolean {
    for (const value of this.dirty.values()) {
      if ((value & flags) !== 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * This frame and `later` as one: every node in either, with the
   * flags it carried in both.
   *
   * What the phases after layout read when layout ran more than once
   * in a frame (see `UiScheduler.recollect`): a node dirtied by a
   * layout listener has to be re-meant and redrawn like any other
   * node the frame changed.
   */
  merged(later: UiFrame): UiFrame {
    if (later.isEmpty()) {
      return this;
    }
    const dirty = new Map(this.dirty);
    for (const [node, flags] of later.entries()) {
      dirty.set(node, (dirty.get(node) ?? DirtyFlags.None) | flags);
    }
    return new UiFrame(this.id, this.time, dirty);
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
