import type { LayoutBox } from '../layout/LayoutTypes';
import type { UiNode } from '../graph/UiNode';

/**
 * What an arriving element is told when it takes a name: where the
 * element it is replacing was standing, and how to make that element
 * step aside once the replacement is actually in place.
 */
export interface SharedClaim {
  /** The previous holder's last box, or null when nothing held the name. */
  readonly box: LayoutBox | null;
  /** Hides the previous holder. Idempotent, and a no-op when there was none. */
  yieldPrevious(): void;
}

/** What one name's current holder is, and where it last was. */
interface Holder {
  readonly node: UiNode;
  /** Its box as of the last layout that moved it. Null before the first. */
  box: LayoutBox | null;
  /** Told to get out of the way when another node takes the name. */
  yield: () => void;
}

/**
 * Who currently owns each shared-element name, and where they were.
 *
 * This is the whole of the shared-element mechanism's memory, and it
 * is deliberately tiny: a name, the node holding it, and that node's
 * last box. Everything the transition looks like is the modifier's
 * business; this only answers "was something else called that a moment
 * ago, and where was it?".
 *
 * **Why a registry and not a diff of two trees.** The browser's View
 * Transitions API snapshots the old document, applies the change, and
 * animates pseudo-elements between two rasters, because the DOM it
 * started with is gone by the time it can measure. Gesso has a
 * retained graph: both nodes are real, live, and measurable at the
 * same moment, so the transition can be FLIP on the real thing —
 * interruptible, continuous, and free of the snapshot.
 *
 * **Why it is order-independent.** `UiGraphBuilder.reconcile` creates
 * the new children of a parent before it removes the unmatched old
 * ones, so a naive "the leaving node hands over to the arriving one"
 * would be handing over in the wrong direction. Keying by name instead
 * means the arriving node asks *whoever holds this name* where it is,
 * and it does not matter at all whether that node has left yet.
 *
 * Per runtime, for the same reason `AnimationDriver` and the media
 * caches are: the playground runs several runtimes in one worker, and
 * a module-level registry would let one runtime's card hand its box to
 * another runtime's page.
 */
export class UiSharedElements {
  private readonly holders = new Map<string, Holder>();

  /**
   * Takes a name for a node, and answers where the previous holder is
   * standing — and how to tell it to get out of the way.
   *
   * **The yield is handed back rather than performed.** The previous
   * holder does have to disappear, because the arriving node is about
   * to be drawn over exactly where it stands and two copies of one
   * thing is a double image rather than a transition; the CSS version
   * of this effect says the same thing as
   * `::view-transition-old(name) { display: none }`.
   *
   * But it must not disappear *yet*. A claim happens during
   * reconciliation, and the arriving node has no box until the frame
   * lays out — so yielding here leaves a window in which neither
   * element is drawn. For a transform morph that window is closed
   * within the same frame; for a geometry morph, which cannot write a
   * box after layout has run, it is a whole frame long, and a whole
   * frame with neither the old card nor the new one is a flash of the
   * page behind them. It was exactly that visible.
   *
   * So the caller yields the previous holder at the moment it actually
   * takes its place. Until then both are on screen, in the same
   * position, which is indistinguishable from one.
   *
   * A null box is the ordinary case: an element that is simply
   * appearing has nothing to morph from and should enter instead.
   */
  claim(name: string, node: UiNode, onYield: () => void): SharedClaim {
    const previous = this.holders.get(name);
    this.holders.set(name, { node, box: null, yield: onYield });
    if (previous === undefined || previous.node === node) {
      return { box: previous?.box ?? null, yieldPrevious: () => {} };
    }
    let yielded = false;
    return {
      box: previous.box,
      yieldPrevious: () => {
        if (!yielded) {
          yielded = true;
          previous.yield();
        }
      }
    };
  }

  /** Records where a node is now, so whoever takes the name next knows. */
  report(name: string, node: UiNode, box: LayoutBox): void {
    const holder = this.holders.get(name);
    if (holder === undefined || holder.node !== node) {
      return;
    }
    holder.box = box;
  }

  /**
   * Gives up a name, if this node still holds it.
   *
   * Guarded on identity because detach order is not the reverse of
   * attach order across a tree change: the leaving node's modifier
   * detaches *after* the arriving one has already claimed the name,
   * and an unguarded release would delete the arriving node's entry.
   */
  release(name: string, node: UiNode): void {
    if (this.holders.get(name)?.node === node) {
      this.holders.delete(name);
    }
  }

  /** The names currently held, for specs and the inspector. */
  get names(): readonly string[] {
    return [...this.holders.keys()];
  }

  clear(): void {
    this.holders.clear();
  }
}
