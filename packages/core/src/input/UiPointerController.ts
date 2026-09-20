import type { UiNode } from '../graph/UiNode';
import {
  MOUSE_POINTER,
  noKeyModifiers,
  UiEventType,
  UiPointerEvent,
  type UiKeyModifiers,
  type UiPointerDevice
} from './UiInputEvent';
import type { HitTester } from './UiHitTester';
import { UiInputDispatcher } from './UiInputDispatcher';
import type { GestureInput } from './UiGestureRecognizer';
import type { ScrollSink } from './UiWheelController';
import type { ScrollbarAxis } from '../layout/Scrollbars';

export interface PointerControllerOptions {
  /**
   * Maximum distance (px) a press may travel between pointerdown and
   * pointerup and still count as a Click.
   */
  slop?: number;
  /**
   * The same allowance for a finger.
   *
   * A tap is not a click held still. The contact point moves as the
   * finger flattens and lifts, and four pixels of travel — the mouse
   * allowance — is routinely exceeded by a tap the person considers
   * perfectly stationary. At that threshold a touchscreen loses
   * roughly every other tap, silently: the PointerUp fires and no
   * Click follows it.
   */
  touchSlop?: number;
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
  /**
   * Scrolling backend for scrollbar interaction: dragging a thumb,
   * paging on a track press, and revealing bars as the pointer nears
   * them. Without it scrollbars are display only.
   */
  scrollSink?: ScrollSink;
  /**
   * Invoked when the hovered node changes, after the PointerLeave and
   * PointerEnter events have been dispatched. The layout inspector
   * follows the pointer through this.
   */
  onHoverChange?: (node: UiNode | null) => void;
  /**
   * Default pointer behaviour for editable text: a press places the
   * caret (or selects a word, a line), a drag extends the selection.
   * Applied after the app's listeners, and skipped when the pointerdown
   * was defaultPrevented.
   */
  editing?: {
    isEditable(node: UiNode): boolean;
    pointerDown(node: UiNode, x: number, y: number, modifiers: UiKeyModifiers): void;
    pointerMove(node: UiNode, x: number, y: number): void;
    pointerUp(): void;
  };
  /**
   * Default pointer behaviour for text nobody types into: a press on
   * it starts a selection, a drag extends it, a press anywhere else
   * clears it. Applied after the app's listeners, on the same terms as
   * `editing`, and never for a press that landed on an editable —
   * that one has its own selection.
   *
   * The drag is fed raw canvas coordinates rather than the pressed
   * node, because a selection is the one gesture that has to cross
   * node boundaries while the press is captured.
   */
  selection?: {
    pointerDown(node: UiNode | null, x: number, y: number, modifiers: UiKeyModifiers): void;
    pointerMove(x: number, y: number): void;
    pointerUp(): void;
    clear(): void;
    /**
     * The pointer moved with nothing pressed. An inline link is a run
     * of a paragraph rather than a node, so its hover cannot come from
     * `onHoverChange`, which fires only when the node changes; the
     * point inside the node is the whole question.
     */
    pointerHover?(node: UiNode | null, x: number, y: number): void;
  };
}

/** A thumb drag in progress. */
interface ScrollbarDrag {
  node: UiNode;
  axis: ScrollbarAxis;
  /** Pointer position along the axis when the drag started. */
  startPointer: number;
  /** Scroll offset when the drag started. */
  startScroll: number;
  /** Scroll offset per pixel of thumb travel. */
  scale: number;
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
 *     `slop` px (`touchSlop` for a finger, which never holds as still
 *     as a mouse), pointerdown did not call preventDefault(), and no
 *     gesture recognizer claimed the press.
 *   - pointercancel aborts the press and never produces a Click.
 *   - Contacts: a press is owned by the contact that started it, and
 *     the moves and releases of any other contact are ignored until it
 *     ends. A second finger therefore cannot drag a widget the first
 *     one is holding. Every contact is still *reported* to the gesture
 *     recognizer, which is what a pinch is made of; being refused the
 *     press and being unheard are two different things.
 *   - Context menu: a press of the secondary button alone dispatches
 *     PointerDown and then ContextMenu at the same point, and
 *     establishes no press at all, so nothing is dragged, nothing is
 *     focused and no Click follows the release. A finger asks for the
 *     same thing by holding, which the gesture recognizer answers.
 *   - Touch hover: a finger's hover is dropped when it lifts, because
 *     the finger is no longer anywhere. A mouse keeps its hover.
 *   - Scrollbars: a press on a scroll container's thumb starts a drag
 *     that moves the content with the pointer; a press on the track
 *     beside a visible thumb pages one viewport toward the pointer.
 *     Neither reaches the content under the bar. Nearing a bar while
 *     idle reveals it.
 *
 * When a gesture recognizer is supplied it is fed the press sequence
 * and synthesizes LongPress/Pan/Drag through the same dispatcher.
 *
 * The controller is single-press: a pointerdown while already
 * pressing is ignored.
 */
export class UiPointerController {
  private readonly slop: number;
  private readonly touchSlop: number;
  private readonly gestures: GestureInput | null;
  private readonly onPress: ((node: UiNode) => void) | null;
  private readonly scrollSink: ScrollSink | null;
  private readonly onHoverChange: ((node: UiNode | null) => void) | null;
  private readonly editing: PointerControllerOptions['editing'];
  private readonly selection: PointerControllerOptions['selection'];

  private hoverNode: UiNode | null = null;

  private downTarget: UiNode | null = null;
  private downX = 0;
  private downY = 0;
  private downDefaultPrevented = false;
  /**
   * The contact that owns the press in progress, or null when idle.
   *
   * Everything from the pointerdown to the release is routed by this
   * id. Without it a second finger landing on the canvas mid-drag
   * feeds its own moves to the node the *first* finger pressed, and
   * the drag jumps between the two contacts.
   */
  private activePointer: UiPointerDevice | null = null;

  private scrollbarDrag: ScrollbarDrag | null = null;

  constructor(
    private readonly hitTester: HitTester,
    private readonly dispatcher: UiInputDispatcher,
    options: PointerControllerOptions = {}
  ) {
    this.slop = options.slop ?? 4;
    this.touchSlop = options.touchSlop ?? 10;
    this.gestures = options.gestures ?? null;
    this.onPress = options.onPress ?? null;
    this.scrollSink = options.scrollSink ?? null;
    this.onHoverChange = options.onHoverChange ?? null;
    this.editing = options.editing;
    this.selection = options.selection;
  }

  /** The node currently under the pointer, or null over empty space. */
  /** Where the pointer was last seen, in canvas space; null before it has been. */
  get position(): { readonly x: number; readonly y: number } | null {
    return this.lastPosition;
  }

  private lastPosition: { x: number; y: number } | null = null;

  get hoveredNode(): UiNode | null {
    return this.hoverNode;
  }

  /** The node the current press started on, or null when idle. */
  get pressedNode(): UiNode | null {
    return this.downTarget;
  }

  /** The scroll container whose thumb is being dragged, or null. */
  get draggingScrollbarOf(): UiNode | null {
    return this.scrollbarDrag?.node ?? null;
  }

  /**
   * Pointer press. Hit-tests at the point, establishes hover, and
   * dispatches PointerDown to the pressed node. Subsequent moves and
   * the up are routed to that node until release.
   */
  pointerDown(
    x: number,
    y: number,
    buttons = 1,
    modifiers: UiKeyModifiers = noKeyModifiers(),
    pointer: UiPointerDevice = MOUSE_POINTER
  ): UiPointerEvent {
    this.lastPosition = { x, y };
    const event = new UiPointerEvent(UiEventType.PointerDown, x, y, buttons, modifiers, pointer);
    if (this.downTarget !== null || this.scrollbarDrag !== null) {
      // The press stays with the contact that started it. The contact
      // is still reported, because "a second finger landed" is exactly
      // what a pinch is made of, and dropping it here is what
      // left touch input unfinished.
      this.gestures?.contactDown?.(pointer, x, y, this.downTarget, modifiers);
      return event;
    }
    const hit = this.hitTester.hitTest(x, y);
    if (hit?.scrollbar !== undefined && this.scrollSink !== null) {
      this.activePointer = pointer;
      this.pressScrollbar(hit.node, hit.scrollbar.axis, hit.scrollbar.onThumb, x, y);
      return event;
    }
    const target = hit?.node ?? null;
    this.updateHover(target, x, y, buttons, modifiers, pointer);
    if (target !== null && isSecondaryButton(buttons)) {
      // A right press is a question, not a gesture: it asks what can be
      // done with the node under it. No press is established, so no
      // drag begins, no Click is synthesized on the release and the
      // focus a left press would have taken is left where it was.
      this.dispatcher.dispatch(event, target);
      if (!event.defaultPrevented) {
        this.dispatcher.dispatch(
          new UiPointerEvent(UiEventType.ContextMenu, x, y, buttons, modifiers, pointer),
          target
        );
      }
      return event;
    }
    this.gestures?.contactDown?.(pointer, x, y, target, modifiers);
    if (target !== null) {
      this.dispatcher.dispatch(event, target);
      this.gestures?.pointerDown(event, target);
      if (!event.defaultPrevented) {
        this.onPress?.(target);
        if (this.editing !== undefined && this.editing.isEditable(target)) {
          this.editing.pointerDown(target, x, y, modifiers);
          this.selection?.clear();
        } else {
          this.selection?.pointerDown(target, x, y, modifiers);
        }
      }
    } else {
      // A press on empty space drops the selection, as it does on a page.
      this.selection?.pointerDown(null, x, y, modifiers);
    }
    this.downTarget = target;
    this.downX = x;
    this.downY = y;
    this.downDefaultPrevented = event.defaultPrevented;
    this.activePointer = pointer;
    return event;
  }

  /**
   * Pointer movement. While a press is active the move is routed to
   * the pressed node (capture); otherwise it hit-tests, updates
   * hover enter/leave, and dispatches PointerMove to the hovered
   * node. Returns null when the move lands on empty space.
   */
  pointerMove(
    x: number,
    y: number,
    buttons = 0,
    modifiers: UiKeyModifiers = noKeyModifiers(),
    pointer: UiPointerDevice = MOUSE_POINTER
  ): UiPointerEvent | null {
    this.lastPosition = { x, y };
    this.gestures?.contactMove?.(pointer, x, y);
    if (!this.ownsPress(pointer)) {
      return null;
    }
    if (this.scrollbarDrag !== null) {
      this.dragScrollbar(x, y);
      return null;
    }
    if (this.downTarget !== null) {
      const event = new UiPointerEvent(UiEventType.PointerMove, x, y, buttons, modifiers, pointer);
      this.dispatcher.dispatch(event, this.downTarget);
      this.gestures?.pointerMove(event, this.downTarget);
      if (!event.defaultPrevented) {
        if (this.editing !== undefined && this.editing.isEditable(this.downTarget)) {
          this.editing.pointerMove(this.downTarget, x, y);
        } else if (!this.downDefaultPrevented) {
          // A press the app cancelled started no selection, so the
          // moves after it are not extending one either.
          this.selection?.pointerMove(x, y);
        }
      }
      return event;
    }
    if (this.scrollSink?.revealScrollbars !== undefined) {
      // Nearing a bar shows it, so there is something to grab.
      const zone = this.hitTester.scrollbarZoneAt(x, y);
      if (zone !== null) {
        this.scrollSink.revealScrollbars(zone.node);
      }
    }
    const target = this.hitTester.hitTest(x, y)?.node ?? null;
    this.updateHover(target, x, y, buttons, modifiers, pointer);
    this.selection?.pointerHover?.(target, x, y);
    if (target === null) {
      return null;
    }
    const event = new UiPointerEvent(UiEventType.PointerMove, x, y, buttons, modifiers, pointer);
    this.dispatcher.dispatch(event, target);
    return event;
  }

  /**
   * Pointer release. Dispatches PointerUp to the pressed node and,
   * when the press did not travel beyond the slop and was not
   * cancelled via preventDefault on the down, synthesizes a Click on
   * the same node. Returns null when nothing was pressed.
   */
  pointerUp(
    x: number,
    y: number,
    buttons = 0,
    modifiers: UiKeyModifiers = noKeyModifiers(),
    pointer: UiPointerDevice = MOUSE_POINTER
  ): UiPointerEvent | null {
    this.gestures?.contactUp?.(pointer);
    if (!this.ownsPress(pointer)) {
      return null;
    }
    if (this.scrollbarDrag !== null) {
      this.dragScrollbar(x, y);
      this.scrollbarDrag = null;
      this.activePointer = null;
      return null;
    }
    const target = this.downTarget;
    if (target === null) {
      return null;
    }
    this.downTarget = null;
    this.activePointer = null;
    this.editing?.pointerUp();
    this.selection?.pointerUp();

    const event = new UiPointerEvent(UiEventType.PointerUp, x, y, buttons, modifiers, pointer);
    this.dispatcher.dispatch(event, target);
    this.gestures?.pointerUp(event, target);

    const gestureClaimed = this.gestures?.claimed() ?? false;
    if (!this.downDefaultPrevented && !gestureClaimed) {
      const dx = Math.abs(x - this.downX);
      const dy = Math.abs(y - this.downY);
      const slop = pointer.kind === 'touch' ? this.touchSlop : this.slop;
      if (dx <= slop && dy <= slop) {
        const click = new UiPointerEvent(UiEventType.Click, x, y, buttons, modifiers, pointer);
        this.dispatcher.dispatch(click, target);
      }
    }
    this.releaseHover(x, y, modifiers, pointer);
    return event;
  }

  /**
   * Aborts the active press: dispatches PointerCancel to the pressed
   * node and clears press state so no Click is synthesized.
   */
  pointerCancel(pointer: UiPointerDevice = MOUSE_POINTER): void {
    this.gestures?.contactUp?.(pointer);
    if (!this.ownsPress(pointer)) {
      return;
    }
    this.scrollbarDrag = null;
    this.editing?.pointerUp();
    this.selection?.pointerUp();
    const target = this.downTarget;
    this.downTarget = null;
    this.activePointer = null;
    if (target === null) {
      return;
    }
    const event = new UiPointerEvent(UiEventType.PointerCancel, this.downX, this.downY, 0, noKeyModifiers(), pointer);
    this.dispatcher.dispatch(event, target);
    this.gestures?.pointerCancel();
    this.releaseHover(this.downX, this.downY, noKeyModifiers(), pointer);
  }

  /**
   * Whether an event from this contact should be acted on.
   *
   * While a press is in flight only the contact that started it is
   * heard; a second finger's moves and releases are dropped. When
   * nothing is pressed every contact is heard, so hover still follows
   * a mouse that never pressed anything.
   */
  private ownsPress(pointer: UiPointerDevice): boolean {
    return this.activePointer === null || this.activePointer.id === pointer.id;
  }

  // -------------------------------------------------------------------------
  // Scrollbars
  // -------------------------------------------------------------------------

  /**
   * A press on the thumb starts a drag that maps pointer travel to
   * scroll offset through the thumb's travel range. A press on the
   * track pages one viewport toward the pointer, as classic scrollbars
   * do.
   */
  private pressScrollbar(node: UiNode, axis: ScrollbarAxis, onThumb: boolean, x: number, y: number): void {
    const sink = this.scrollSink!;
    const state = sink.containerState(node);
    const bar = sink.scrollbar?.(node, axis) ?? null;
    if (state === undefined || bar === null) {
      return;
    }
    sink.revealScrollbars?.(node);
    const scroll = axis === 'y' ? state.scrollY : state.scrollX;
    if (onThumb) {
      this.scrollbarDrag = {
        node,
        axis,
        startPointer: axis === 'y' ? y : x,
        startScroll: scroll,
        scale: bar.travel > 0 ? bar.maxScroll / bar.travel : 0
      };
      return;
    }
    // The thumb is in the container's record space; so is the pointer
    // once mapped with toLocal (which is relative to the record origin).
    const local = this.hitTester.toLocal(node, x, y);
    const pointer = axis === 'y' ? local.y : local.x;
    const thumbStartLocal =
      axis === 'y' ? bar.thumb.y - this.recordOrigin(node, 'y') : bar.thumb.x - this.recordOrigin(node, 'x');
    const delta = (pointer < thumbStartLocal ? -1 : 1) * bar.viewport;
    // Animated, for the reason a wheel notch is: pressing the track
    // moves a whole screenful at once, and a screenful arriving
    // instantly gives no sense of which way the content went. A thumb
    // *drag* stays instant and must — it recomputes an absolute target
    // from pointer travel on every move and reads the current offset
    // back, so an animation in flight would have it chasing a position
    // the container is only passing through.
    if (axis === 'y') {
      sink.scrollBy(node, 0, delta, 'smooth');
    } else {
      sink.scrollBy(node, delta, 0, 'smooth');
    }
  }

  /**
   * The record origin along an axis, recovered from toLocal: local
   * coordinates are record coordinates minus the record origin, so
   * mapping the origin itself yields the offset.
   */
  private recordOrigin(node: UiNode, axis: ScrollbarAxis): number {
    const zero = this.hitTester.toLocal(node, 0, 0);
    return axis === 'y' ? -zero.y : -zero.x;
  }

  private dragScrollbar(x: number, y: number): void {
    const drag = this.scrollbarDrag!;
    const sink = this.scrollSink!;
    const state = sink.containerState(drag.node);
    if (state === undefined) {
      return;
    }
    const pointer = drag.axis === 'y' ? y : x;
    const target = drag.startScroll + (pointer - drag.startPointer) * drag.scale;
    const current = drag.axis === 'y' ? state.scrollY : state.scrollX;
    const max = drag.axis === 'y' ? state.maxScrollY : state.maxScrollX;
    const clamped = Math.min(Math.max(target, 0), max);
    if (clamped !== current) {
      if (drag.axis === 'y') {
        sink.scrollBy(drag.node, 0, clamped - current);
      } else {
        sink.scrollBy(drag.node, clamped - current, 0);
      }
    }
    sink.revealScrollbars?.(drag.node);
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
  private updateHover(
    next: UiNode | null,
    x: number,
    y: number,
    buttons: number,
    modifiers: UiKeyModifiers,
    pointer: UiPointerDevice
  ): void {
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
        this.dispatchBoundary(UiEventType.PointerLeave, node, x, y, buttons, modifiers, pointer);
      }
    }
    if (next !== null) {
      const previousChain = previous === null ? new Set<UiNode>() : new Set(this.chain(previous));
      for (const node of this.chain(next)) {
        if (previousChain.has(node)) {
          break;
        }
        this.dispatchBoundary(UiEventType.PointerEnter, node, x, y, buttons, modifiers, pointer);
      }
    }
    this.onHoverChange?.(next);
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
    modifiers: UiKeyModifiers,
    pointer: UiPointerDevice
  ): void {
    const event = new UiPointerEvent(type, x, y, buttons, modifiers, pointer);
    this.dispatcher.dispatch(event, node);
  }

  /**
   * Drops hover when the contact that had it has left the surface.
   *
   * A finger stops existing when it lifts. A mouse does not, so its
   * hover survives the release and the node it was released over stays
   * hovered — which is what a mouse user sees and expects.
   *
   * Without this a tap leaves the tapped node hovered for good: every
   * hover affordance in the app stays lit under the last thing touched,
   * and the next tap somewhere else moves the stuck highlight rather
   * than clearing it. It is the most visible thing that goes wrong when
   * a canvas UI meets a touchscreen.
   */
  private releaseHover(x: number, y: number, modifiers: UiKeyModifiers, pointer: UiPointerDevice): void {
    if (pointer.kind !== 'touch') {
      return;
    }
    this.updateHover(null, x, y, 0, modifiers, pointer);
  }
}

/**
 * Whether the pressed buttons are the secondary one and nothing else.
 *
 * The DOM's `buttons` bitmask, where 2 is the right button. Read as an
 * exact value rather than a bit test on purpose: a press with the left
 * and right buttons together is a press, and treating it as a menu
 * request would take the drag away from anyone whose hand rests on
 * both.
 */
function isSecondaryButton(buttons: number): boolean {
  return buttons === 2;
}
