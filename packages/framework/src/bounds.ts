import type { Subject } from 'rxjs';

import { measure, type LayoutBox, type UiModifier } from 'gesso-core';
import { InternalState } from './InternalState';

/** A box that has not been laid out yet: the value before the first frame. */
const NOWHERE: LayoutBox = { x: 0, y: 0, width: 0, height: 0 };

/**
 * A node's box, as a cell.
 *
 * `ctx.bounds()` hands one out and the modifier on it fills it, so the
 * arithmetic a pointer position needs starts from a value rather than
 * from `new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 })`
 * and a `measure(subject)` beside it. It is an ordinary cell: read it
 * with `.value` in a handler, bind it, or derive from it.
 *
 *   const track = ctx.bounds();
 *   <box modifiers={[track.modifier]} onPointerMove={e => at(e.x - track.value.x)} />
 *
 * **It reports a move, and only a move.** `measure` is built on
 * `LayoutNotifier`, which fires for every layout fact a node's listeners
 * could care about, and one of those is a scroll offset that changed
 * while the box stayed exactly where it was. A
 * cell that emitted for those would wake everything derived from it on
 * every frame of every scroll, for a box that did not move, which is
 * the defect this exists to avoid. So an equal box is dropped here,
 * where the comparison is four numbers, rather than by a
 * `distinctUntilChanged` at each of the places that read it.
 *
 * There is no `ctx.bounds(ref)`. A box is reported by a modifier, which
 * is how a node is reached from outside the layout engine everywhere
 * else in this framework, and a ref would be a second way of naming the
 * same node with nothing else built on it.
 */
export class BoundsCell extends InternalState<LayoutBox> {
  /** Put this on the element whose box the cell should hold. */
  readonly modifier: UiModifier<Subject<LayoutBox>>;

  constructor() {
    super(NOWHERE);
    this.modifier = measure(this);
  }

  /** Writes a box, unless it is the one already held. */
  override next(box: LayoutBox): void {
    const held = super.getValue();
    if (held.x === box.x && held.y === box.y && held.width === box.width && held.height === box.height) {
      return;
    }
    super.next(box);
  }
}

/**
 * A bounds cell outside a component, for a class component or a test.
 * Inside a function component `ctx.bounds()` is the same thing, and it
 * completes with the component.
 */
export function bounds(label?: string): BoundsCell {
  const cell = new BoundsCell();
  if (label !== undefined) {
    cell.label = label;
  }
  return cell;
}
