import { defaultMotion, type UiSpringSpec, type UiSpringToken } from '../environment/UiMotion';
import type { AnimatedCell, UiEasing } from '../animation';
import type { UiNode } from '../graph/UiNode';
import { defineModifier } from './UiModifier';
import type { UiModifierHost } from './UiModifierHost';

export interface AnimateLayoutOptions {
  /** The spring that carries the node home. Named, or given outright. */
  spring?: UiSpringToken | UiSpringSpec;
  /** Use a tween of this many milliseconds instead of a spring. */
  duration?: number;
  easing?: UiEasing;
  /** Movements smaller than this are not worth animating. */
  threshold?: number;
}

/**
 * Animates a node from where it was to where layout has just put it.
 *
 * The classic FLIP: the node's box moved between two frames, so it is
 * drawn back at the old place and released. What is worth writing down
 * is where each half comes from, because both were already here.
 *
 * **The old box comes from `LayoutNotifier`, not from L7's slab
 * records.** Those are the prerequisite and they
 * do not exist — `LayoutRecord.ts` mentions slabs only in a comment
 * about a future Worker transfer. B2 built the thing this actually
 * needs: a per-node, opt-in notification after any frame that moved a
 * box, which already keeps the last box it reported. That is exactly
 * the old/new pair, it costs nothing when nothing is listening, and
 * building a second mechanism beside it would have been the mistake.
 *
 * **The offset is the transform's translation.** It used to be a
 * relative `left`/`top` on a `position: relative` node, and
 * the reason is this: `UiTransform.x`/`.y` are the
 * transform's *pivot*, both renderers compose `T(pivot)·R·S·T(-pivot)`,
 * and there was no translation field to use. The cost it recorded was
 * that a tick marked Layout rather than Paint, so the animating
 * subtree was re-placed from its relayout boundary on every frame of
 * every animation. `UiTransform` now has `translateX`/`translateY`,
 * which both renderers and the hit tester apply outside the pivot, so
 * that cost is simply gone: a reordering list marks Paint and the
 * layout engine does not run. It also means the modifier no longer
 * cares what an element's own `position`, `left` or `top` are, and the
 * two warnings that existed only to say so are gone with it.
 *
 * **It animates a reorder, and follows everything else.** The two look
 * identical to anything watching boxes and want opposite behaviour: a
 * node that changed places should be drawn back where it was and
 * released, while a node that moved because its neighbour grew should
 * simply move with it. Holding it still would be the neighbour growing
 * *through* it, which is what the first version of this did — the
 * example's expanding card was drawn over the card below it, in the
 * browser, on the first click. So the modifier absorbs a move only
 * when its parent's `childOrderVersion` has changed, which is exactly
 * "something was inserted, moved or removed here" and is one integer
 * comparison. A window resize is followed rather than animated for the
 * same reason.
 *
 * The listener also has to tell its own movement apart from the
 * layout's, because writing an offset moves the box the notifier
 * reports. It does that by subtracting the offset it wrote: what it
 * watches is the node's place in the *flow*. An interruption springs
 * from wherever the node had got to, which is what a list reordered
 * twice in quick succession should look like.
 */
export const animateLayout = defineModifier<AnimateLayoutOptions | undefined>({
  name: 'animateLayout',
  attach(host, args) {
    new LayoutAnimation(host, args ?? {}).attach();
  }
});

class LayoutAnimation {
  /** Where the node sat in the flow when we last heard, or null before the first layout. */
  private flowX = 0;
  private flowY = 0;
  private seen = false;
  /** The parent and its child-order version when we last heard. */
  private parent: UiNode | null = null;
  private childOrder = -1;
  /** What we are currently offsetting by, and therefore what to subtract. */
  private offsetX = 0;
  private offsetY = 0;
  /** What the element declared, which our offset is added to. */
  private basePivotX = 0;
  private basePivotY = 0;
  private baseScaleX = 1;
  private baseScaleY = 1;
  private baseRotation = 0;

  private readonly cellX: AnimatedCell<number>;
  private readonly cellY: AnimatedCell<number>;

  constructor(
    private readonly host: UiModifierHost,
    private readonly options: AnimateLayoutOptions
  ) {
    // Each write is one override, which the cascade restores on detach.
    this.cellX = this.makeCell(
      () => this.offsetX,
      next => this.setOffset(next, this.offsetY)
    );
    this.cellY = this.makeCell(
      () => this.offsetY,
      next => this.setOffset(this.offsetX, next)
    );
  }

  attach(): void {
    // Read once, in the element's own values: what the modifier writes
    // is the element's transform with a translation added, so a node
    // that also rotates keeps rotating while it slides.
    const declared = this.host.get<Record<string, unknown> | undefined>('transform');
    if (declared !== undefined && declared !== null) {
      this.basePivotX = numberOr(declared.x, 0);
      this.basePivotY = numberOr(declared.y, 0);
      this.baseScaleX = numberOr(declared.scaleX, 1);
      this.baseScaleY = numberOr(declared.scaleY, 1);
      this.baseRotation = numberOr(declared.rotation, 0);
    }
    // The listener fires on any frame that moved the node's *visible*
    // box, which includes a scroll; what it reads is `flowBox`, which
    // does not. So a scroll wakes it and it correctly decides nothing
    // moved. This was found in the browser: with the visible box, every
    // row of the list lagged behind the page scroll and caught up.
    this.host.onLayout(() => this.handleLayout());
  }

  private makeCell(read: () => number, write: (offset: number) => void): AnimatedCell<number> {
    return {
      get value(): number {
        return read();
      },
      set value(next: number) {
        write(next);
      }
    };
  }

  /**
   * Writes the offset as the transform's translation, or takes it away.
   *
   * Back at zero the override is dropped rather than written as an
   * identity translation, so the node ends up with exactly what the
   * element declared — which for nearly every element is no transform
   * at all, and therefore no `hasTransform` in its paint state and no
   * matrix multiply per frame.
   */
  private setOffset(x: number, y: number): void {
    this.offsetX = x;
    this.offsetY = y;
    if (x === 0 && y === 0) {
      this.host.clear('transform');
      return;
    }
    this.host.set('transform', {
      x: this.basePivotX,
      y: this.basePivotY,
      translateX: x,
      translateY: y,
      scaleX: this.baseScaleX,
      scaleY: this.baseScaleY,
      rotation: this.baseRotation
    });
  }

  private handleLayout(): void {
    const box = this.host.flowBox();
    if (box === null) {
      return;
    }
    // The translation is paint-only, so the flow box the notifier
    // reports never contains it — but the subtraction is kept because
    // the node's place in the flow is still what this watches, and a
    // renderer that ever folded the transform into layout would break
    // silently without it.
    const flowX = box.x;
    const flowY = box.y;
    const parent = this.host.node.parent;
    const childOrder = parent === null ? -1 : parent.childOrderVersion;
    const reordered = parent !== this.parent || childOrder !== this.childOrder;
    this.parent = parent;
    this.childOrder = childOrder;
    if (!this.seen) {
      this.seen = true;
      this.flowX = flowX;
      this.flowY = flowY;
      return;
    }
    const dx = this.flowX - flowX;
    const dy = this.flowY - flowY;
    this.flowX = flowX;
    this.flowY = flowY;
    if (!reordered) {
      // Nothing changed places, so this is the layout itself moving —
      // a neighbour resizing, a window resizing, a container growing.
      // The node follows it, and whatever spring is already running
      // keeps decaying the offset it has. Absorbing this would hold
      // the node still while its neighbour grew into it.
      return;
    }
    const threshold = this.options.threshold ?? 0.5;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
      // Either nothing moved, or the only thing that moved was us.
      return;
    }
    // Keep it where it appears, then let it go. Adding to the current
    // offset rather than replacing it is what makes an interrupted
    // reorder continue from where it had got to.
    this.cellX.value = this.offsetX + dx;
    this.cellY.value = this.offsetY + dy;
    this.release(this.cellX);
    this.release(this.cellY);
  }

  private release(cell: AnimatedCell<number>): void {
    if (cell.value === 0) {
      return;
    }
    if (this.options.duration !== undefined) {
      this.host.animate(cell, 0, { duration: this.options.duration, easing: this.options.easing });
      return;
    }
    const named = this.options.spring ?? 'snappy';
    this.host.spring(cell, 0, {
      spring: typeof named === 'string' ? defaultMotion.springs[named] : named,
      // Half a pixel: closer than this is the same pixel on a 1× screen
      // and within one on a 2×, so continuing to schedule frames for it
      // would be paying for a movement nobody can see.
      restDelta: 0.5
    });
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
