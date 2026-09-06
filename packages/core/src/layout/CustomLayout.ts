import type { Constraints, Size } from './LayoutTypes';

/**
 * How many times one child may be measured in a single call to a
 * protocol's `layout`.
 *
 * Two, because two is what the engine's own flex algorithm needs: a
 * base measurement at the item's content size, and a second one once
 * the main axis is resolved so a cross size that depends on it comes
 * out right. A protocol that needs a third measurement of the same
 * child is almost always measuring inside a loop over its siblings,
 * which is the shape that turns a linear pass into a quadratic one, so
 * the third throws rather than running.
 *
 * The cap is per child, so the total across a call can never exceed
 * twice the number of children however the protocol distributes them.
 */
export const MAX_MEASURES_PER_CHILD = 2;

/**
 * One child of a custom layout, as its protocol sees it.
 *
 * Deliberately not a `UiNode`. A protocol is application code running
 * inside the layout pass, and the four things here are the whole
 * budget: it can ask a child how big it is at a given size, read what
 * it last answered, read the value the element declared as
 * `layoutData`, and say where it goes. It cannot reach the node, its
 * record, its siblings' records or the engine, so there is no way for
 * it to move a box the pass is not expecting to move, and no way for
 * it to read geometry that this pass has not computed yet.
 *
 * A handle lives for exactly one call. Holding one and using it later
 * throws, because a `place` that landed after the pass had ended would
 * write a box nothing invalidated.
 */
export interface UiLayoutChild {
  /** Its position among the container's in-flow children, from zero. */
  readonly index: number;
  /**
   * Whatever the element declared as `layoutData`: a weight, a lane, a
   * timestamp. The protocol decides what the value means; the engine
   * only carries it.
   */
  readonly data: unknown;
  /**
   * Measures the child under `constraints` and returns the size it
   * takes, margins excluded.
   *
   * At most `MAX_MEASURES_PER_CHILD` times per call. A child that is
   * never measured is measured once by the engine, under the same
   * constraints the container was given, so a protocol that only
   * arranges fixed-size children need not measure at all.
   */
  measure(constraints: Constraints): Size;
  /** What the last `measure` returned, or a zero size before the first. */
  readonly size: Size;
  /**
   * Puts the child's border box at a point in the container's content
   * box, `start` running from the edge the reading starts at.
   *
   * Under `textDirection="rtl"` that edge is the right one and the
   * engine mirrors the coordinate, so a layout written once is laid out
   * both ways round. A protocol that needs to know which way it is
   * being mirrored reads `UiLayoutContext.direction`.
   *
   * `margin` on a child is not applied: only the protocol knows what
   * the space between two of its own children means, and a margin the
   * engine added behind its back would move boxes it had placed.
   */
  place(start: number, top: number): void;
  /**
   * Where `place` last put the child, in the same coordinates, or null
   * when this pass has not placed it. Read by `explain`.
   */
  readonly position: { readonly start: number; readonly top: number } | null;
}

/** What a protocol is told about the container it is laying out. */
export interface UiLayoutContext {
  /** Which way the container reads, so a protocol can be asymmetric on purpose. */
  readonly direction: 'ltr' | 'rtl';
  /** The container's content box, padding excluded, when the axis is definite. */
  readonly definiteWidth: number | undefined;
  readonly definiteHeight: number | undefined;
}

/**
 * A layout an application writes itself: the analogue of SwiftUI's
 * `Layout` and Compose's `Layout {}`.
 *
 * A masonry, a radial arrangement, a timeline and a tag cloud are all
 * one function over the children's sizes, and none of them is
 * expressible in flex or in grid. Before this they were written with
 * `position: 'absolute'` and a `ctx.bounds()` subscription, which put
 * the arrangement one frame behind the sizes it was arranged from and
 * made every such component measure its own children twice.
 *
 * The protocol speaks the engine's own vocabulary. `Constraints` is
 * the same class the engine hands down, `Size` is what a measurement
 * returns, and the size the protocol returns is clamped by the node's
 * own `width`, `minWidth` and the rest exactly as a Row's content size
 * is. That is the point of the shape: a custom layout is another
 * container, not a hole in the pass.
 *
 * Hold the protocol object still. It is a property value, compared with
 * `Object.is` like every other, so a fresh object per render marks the
 * node dirty on every frame. Build it once at module scope, or
 * memoise it on the parameters it closes over.
 *
 * See `layout/conformance` for what the engine is graded against, and
 * `apps/playground/src/examples/MasonryApp.tsx` for a masonry written
 * against these exports alone.
 */
export interface UiLayoutProtocol {
  /** Names the arrangement in `explain` and in an error. */
  readonly name: string;
  /**
   * Measures the children, places them, and returns the size the
   * content needs.
   *
   * Called twice per pass over a node whose layout is not memoised:
   * once while measuring, when the returned size is what the container
   * reports to its parent and `place` does nothing, and once while
   * placing, when the constraints are the resolved content box and the
   * `place` calls are what assign the boxes. Both calls see the same
   * children in the same order, so a protocol that is a function of its
   * arguments needs no state between them, and one that keeps state
   * anyway will be wrong the first time a memo hit skips a measurement.
   */
  layout(children: readonly UiLayoutChild[], constraints: Constraints, context: UiLayoutContext): Size;
  /**
   * Sentences describing the arrangement, for `LayoutEngine.explain`.
   *
   * Called after a pass, never during one, and given handles that can
   * be read but neither measured nor placed. Say the things the boxes
   * do not: how many columns there are, which one a child landed in,
   * what was left over. `formatExplanation` prints them under the
   * node's own reasons.
   */
  explain?(children: readonly UiLayoutChild[], size: Size, context: UiLayoutContext): readonly string[];
}

/** Whether a property value is a usable layout protocol. */
export function isLayoutProtocol(value: unknown): value is UiLayoutProtocol {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as UiLayoutProtocol).name === 'string' &&
    typeof (value as UiLayoutProtocol).layout === 'function'
  );
}
