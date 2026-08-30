import { defaultMotion, type UiSpringSpec, type UiSpringToken } from '../environment/UiMotion';
import type { AnimatedCell, UiEasing } from '../animation';
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
 * records.** `ROADMAP.md` §F4 names those as the prerequisite and they
 * do not exist — `LayoutRecord.ts` mentions slabs only in a comment
 * about a future Worker transfer. B2 built the thing this actually
 * needs: a per-node, opt-in notification after any frame that moved a
 * box, which already keeps the last box it reported. That is exactly
 * the old/new pair, it costs nothing when nothing is listening, and
 * building a second mechanism beside it would have been the mistake.
 *
 * **The offset is `left`/`top` on a relative node, not a transform.**
 * `UiTransform.x`/`.y` are the transform's *pivot* — both renderers
 * compose `T(pivot)·R·S·T(-pivot)`, so `{ x: 50, y: 50 }` alone moves
 * nothing — and there is no translation field. A relative offset is
 * CSS's own answer (`assignBox` already applies one: the node keeps
 * its place in the flow and is drawn offset), it is tested, and it
 * needs no renderer change, which §F4 asks for above everything else.
 * What it costs is that a tick marks Layout rather than Paint, so the
 * animating subtree is re-placed each frame from its relayout
 * boundary; `decisions/0029` has the measurement.
 *
 * The listener has to tell its own movement apart from the layout's,
 * because writing an offset moves the box the notifier reports. It
 * does that by subtracting the offset it wrote: what it watches is the
 * node's place in the *flow*, and only a change there starts a new
 * animation. An interruption therefore springs from wherever the node
 * had got to, which is what a list reordered twice in quick succession
 * should look like.
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
  /** What we are currently offsetting by, and therefore what to subtract. */
  private offsetX = 0;
  private offsetY = 0;
  /** What the element declared, which our offset is added to. */
  private baseLeft = 0;
  private baseTop = 0;
  private usable = true;

  /** Built in `attach`, once the element's own left/top are known. */
  private cellX: AnimatedCell<number> | null = null;
  private cellY: AnimatedCell<number> | null = null;

  constructor(
    private readonly host: UiModifierHost,
    private readonly options: AnimateLayoutOptions
  ) {}

  attach(): void {
    const position = this.host.get<string | undefined>('position');
    if (position === 'absolute' || position === 'sticky') {
      warnPositioned(position);
      this.usable = false;
      return;
    }
    const left = this.host.get<unknown>('left');
    const top = this.host.get<unknown>('top');
    if ((left !== undefined && typeof left !== 'number') || (top !== undefined && typeof top !== 'number')) {
      warnTypedOffset();
      this.usable = false;
      return;
    }
    this.baseLeft = typeof left === 'number' ? left : 0;
    this.baseTop = typeof top === 'number' ? top : 0;
    // Each write is one override, which the cascade restores on detach.
    this.cellX = this.makeCell(
      () => this.offsetX,
      next => this.setOffset(next, this.offsetY)
    );
    this.cellY = this.makeCell(
      () => this.offsetY,
      next => this.setOffset(this.offsetX, next)
    );
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
   * Writes the offset as a relative `left`/`top`, or takes it away.
   *
   * Back at zero the overrides are dropped rather than written as
   * zeroes, so the node ends up with exactly what the element declared
   * — which for nearly every element is no `position` at all, and
   * therefore a static node again. `decisions/0022` calls that
   * restoring "nothing at all", and it matters here because a node
   * left `position: relative` is a positioned node for paint order and
   * for anything anchored to it.
   */
  private setOffset(x: number, y: number): void {
    this.offsetX = x;
    this.offsetY = y;
    if (x === 0 && y === 0) {
      this.host.clear('left');
      this.host.clear('top');
      this.host.clear('position');
      return;
    }
    this.host.set('position', 'relative');
    if (x === 0) {
      this.host.clear('left');
    } else {
      this.host.set('left', this.baseLeft + x);
    }
    if (y === 0) {
      this.host.clear('top');
    } else {
      this.host.set('top', this.baseTop + y);
    }
  }

  private handleLayout(): void {
    const cellX = this.cellX;
    const cellY = this.cellY;
    const box = this.host.flowBox();
    if (!this.usable || cellX === null || cellY === null || box === null) {
      return;
    }
    const flowX = box.x - this.offsetX;
    const flowY = box.y - this.offsetY;
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
    const threshold = this.options.threshold ?? 0.5;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
      // Either nothing moved, or the only thing that moved was us.
      return;
    }
    // Keep it where it appears, then let it go. Adding to the current
    // offset rather than replacing it is what makes an interrupted
    // reorder continue from where it had got to.
    cellX.value = this.offsetX + dx;
    cellY.value = this.offsetY + dy;
    this.release(cellX);
    this.release(cellY);
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

let warnedPositioned = false;

function warnPositioned(position: string): void {
  if (warnedPositioned) {
    return;
  }
  warnedPositioned = true;
  console.warn(
    `animateLayout() does nothing on a '${position}' node: it animates by writing a relative left/top offset, ` +
      `and those properties are that node's actual position. Put it on the element inside instead.`
  );
}

let warnedTypedOffset = false;

function warnTypedOffset(): void {
  if (warnedTypedOffset) {
    return;
  }
  warnedTypedOffset = true;
  console.warn(
    `animateLayout() does nothing on an element whose 'left' or 'top' is a typed length (percent, fr, auto): ` +
      `the animation adds pixels to whatever the element declared, and there is no pixel value to add to.`
  );
}
