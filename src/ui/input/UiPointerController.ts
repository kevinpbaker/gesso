import type { UiNode } from '../graph/UiNode';
import { noModifiers, UiEventType, UiPointerEvent, type UiModifiers } from './UiInputEvent';
import type { HitTester } from './UiHitTester';
import { UiInputDispatcher } from './UiInputDispatcher';
import type { GestureInput } from './UiGestureRecognizer';

export interface PointerControllerOptions {
  /**
   * Maximum distance (px) a press may travel between pointerdown and
   * pointerup and still count as a Click.
   */
  slop?: number;
  /**
   * Optional gesture recognizer fed the press sequence. When a
   * gesture is claimed, Click synthesis is suppressed.
   */
  gestures?: GestureInput;
  /**
   * Invoked after a successful (not defaultPrevented) pointerdown on
   * a node. Applications wire focus-on-press here, e.g. forwarding to
   * a focus manager's `focusOnPress`.
   */
  onPress?: (node: UiNode) => void;
}

/**
 * Routes raw pointer input through the dispatcher.
 *
 * The platform adapter feeds it canvas-space positions; application
 * code never sees browser events.
 *
 * Model:
 *   - Hover: while nothing is pressed, the pointer is hit-tested on
 *     every move. PointerMove bubbles from the hovered node, and
 *     PointerEnter / PointerLeave fire on the subtree boundary when
 *     the hovered node changes (target-only, like mouseenter/leave).
 *   - Press capture: from pointerdown until pointerup/cancel, every
 *     pointer event is routed to the node the press started on, even
 *     when the pointer leaves its box. This keeps drags and releases
 *     owned by the pressed widget.
 *   - Click: synthesized on pointerup when the press stayed within
 *     `slop` px, pointerdown did not call preventDefault(), and no
 *     gesture recognizer claimed the press.
 *   - pointercancel aborts the press and never produces a Click.
 *
 * When a gesture recognizer is supplied it is fed the press sequence
 * and synthesizes LongPress/Pan/Drag through the same dispatcher.
 *
 * The controller is single-press: a pointerdown while already
 * pressing is ignored.
 */
export class UiPointerController {
  private readonly slop: number;
  private readonly gestures: GestureInput | null;
  private readonly onPress: ((node: UiNode) => void) | null;

  private hoverNode: UiNode | null = null;

  private downTarget: UiNode | null = null;
  private downX = 0;
  private downY = 0;
  private downDefaultPrevented = false;

  constructor(
    private readonly hitTester: HitTester,
    private readonly dispatcher: UiInputDispatcher,
    options: PointerControllerOptions = {}
  ) {
    this.slop = options.slop ?? 4;
    this.gestures = options.gestures ?? null;
    this.onPress = options.onPress ?? null;
  }

  /** The node currently under the pointer, or null over empty space. */
  get hoveredNode(): UiNode | null {
    return this.hoverNode;
  }

  /** The node the current press started on, or null when idle. */
  get pressedNode(): UiNode | null {
    return this.downTarget;
  }

  /**
   * Pointer press. Hit-tests at the point, establishes hover, and
   * dispatches PointerDown to the pressed node. Subsequent moves and
   * the up are routed to that node until release.
   */
  pointerDown(x: number, y: number, buttons = 1, modifiers: UiModifiers = noModifiers()): UiPointerEvent {
    const event = new UiPointerEvent(UiEventType.PointerDown, x, y, buttons, modifiers);
    if (this.downTarget !== null) {
      return event;
    }
    const target = this.hitTester.hitTest(x, y)?.node ?? null;
    this.updateHover(target, x, y, buttons, modifiers);
    if (target !== null) {
      this.dispatcher.dispatch(event, target);
      this.gestures?.pointerDown(event, target);
      if (!event.defaultPrevented) {
        this.onPress?.(target);
      }
    }
    this.downTarget = target;
    this.downX = x;
    this.downY = y;
    this.downDefaultPrevented = event.defaultPrevented;
    return event;
  }

  /**
   * Pointer movement. While a press is active the move is routed to
   * the pressed node (capture); otherwise it hit-tests, updates
   * hover enter/leave, and dispatches PointerMove to the hovered
   * node. Returns null when the move lands on empty space.
   */
  pointerMove(x: number, y: number, buttons = 0, modifiers: UiModifiers = noModifiers()): UiPointerEvent | null {
    if (this.downTarget !== null) {
      const event = new UiPointerEvent(UiEventType.PointerMove, x, y, buttons, modifiers);
      this.dispatcher.dispatch(event, this.downTarget);
      this.gestures?.pointerMove(event, this.downTarget);
      return event;
    }
    const target = this.hitTester.hitTest(x, y)?.node ?? null;
    this.updateHover(target, x, y, buttons, modifiers);
    if (target === null) {
      return null;
    }
    const event = new UiPointerEvent(UiEventType.PointerMove, x, y, buttons, modifiers);
    this.dispatcher.dispatch(event, target);
    return event;
  }

  /**
   * Pointer release. Dispatches PointerUp to the pressed node and,
   * when the press did not travel beyond the slop and was not
   * cancelled via preventDefault on the down, synthesizes a Click on
   * the same node. Returns null when nothing was pressed.
   */
  pointerUp(x: number, y: number, buttons = 0, modifiers: UiModifiers = noModifiers()): UiPointerEvent | null {
    const target = this.downTarget;
    if (target === null) {
      return null;
    }
    this.downTarget = null;

    const event = new UiPointerEvent(UiEventType.PointerUp, x, y, buttons, modifiers);
    this.dispatcher.dispatch(event, target);
    this.gestures?.pointerUp(event, target);

    const gestureClaimed = this.gestures?.claimed() ?? false;
    if (!this.downDefaultPrevented && !gestureClaimed) {
      const dx = Math.abs(x - this.downX);
      const dy = Math.abs(y - this.downY);
      if (dx <= this.slop && dy <= this.slop) {
        const click = new UiPointerEvent(UiEventType.Click, x, y, buttons, modifiers);
        this.dispatcher.dispatch(click, target);
      }
    }
    return event;
  }

  /**
   * Aborts the active press: dispatches PointerCancel to the pressed
   * node and clears press state so no Click is synthesized.
   */
  pointerCancel(): void {
    if (this.downTarget === null) {
      return;
    }
    const event = new UiPointerEvent(UiEventType.PointerCancel, this.downX, this.downY, 0, noModifiers());
    this.dispatcher.dispatch(event, this.downTarget);
    this.gestures?.pointerCancel();
    this.downTarget = null;
  }

  // -------------------------------------------------------------------------
  // Hover enter/leave
  // -------------------------------------------------------------------------

  /**
   * Reconciles the hovered node after a hit-test change.
   *
   * Ancestor chains are compared as sets: the nodes present in the
   * previous chain but not the next get PointerLeave, and vice versa
   * for PointerEnter. This yields exactly the subtree boundary
   * between the two hovered nodes (the lowest common ancestor is
   * shared and never fires), matching mouseenter/mouseleave.
   */
  private updateHover(next: UiNode | null, x: number, y: number, buttons: number, modifiers: UiModifiers): void {
    if (next === this.hoverNode) {
      return;
    }
    const previous = this.hoverNode;
    this.hoverNode = next;

    if (previous !== null) {
      const nextChain = next === null ? new Set<UiNode>() : new Set(this.chain(next));
      for (const node of this.chain(previous)) {
        if (nextChain.has(node)) {
          break;
        }
        this.dispatchBoundary(UiEventType.PointerLeave, node, x, y, buttons, modifiers);
      }
    }
    if (next !== null) {
      const previousChain = previous === null ? new Set<UiNode>() : new Set(this.chain(previous));
      for (const node of this.chain(next)) {
        if (previousChain.has(node)) {
          break;
        }
        this.dispatchBoundary(UiEventType.PointerEnter, node, x, y, buttons, modifiers);
      }
    }
  }

  /** The node itself followed by its ancestors, innermost first. */
  private chain(node: UiNode): UiNode[] {
    const chain: UiNode[] = [];
    for (let current: UiNode | null = node; current !== null; current = current.parent) {
      chain.push(current);
    }
    return chain;
  }

  private dispatchBoundary(
    type: UiEventType,
    node: UiNode,
    x: number,
    y: number,
    buttons: number,
    modifiers: UiModifiers
  ): void {
    const event = new UiPointerEvent(type, x, y, buttons, modifiers);
    this.dispatcher.dispatch(event, node);
  }
}
