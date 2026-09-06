import type { UiNode } from '../graph/UiNode';
import {
  dragSessionFor,
  type UiDragPayload,
  type UiDragResult,
  type UiDragSession,
  type UiDragState,
  type UiDropEffect,
  type UiDropZone
} from '../input/UiDragSession';
import { UiEventType, type UiGestureEvent, type UiPointerEvent } from '../input/UiInputEvent';
import { defineModifier, type UiModifier } from './UiModifier';
import type { UiModifierHost } from './UiModifierHost';

/**
 * Keeps a zone registered with the session for the graph it is in.
 *
 * A modifier attaches before its node is linked into the tree: the
 * builder writes an element's props, attaches its modifiers and builds
 * its children, and only then makes the edge to its parent. A zone
 * that resolved its session once at attach would therefore register
 * with a session keyed on itself, and would be invisible to every drag
 * that started anywhere else. So the session is re-resolved whenever
 * there is a reason to think the answer changed: at attach, at the
 * node's first layout, and when a drag begins on the node. The
 * registration moves with it.
 */
class ZoneRegistration {
  private session: UiDragSession | null = null;
  private release: (() => void) | null = null;

  constructor(private readonly zone: UiDropZone) {}

  sync(): UiDragSession {
    const next = dragSessionFor(this.zone.node);
    if (next !== this.session) {
      this.release?.();
      this.release = next.addZone(this.zone);
      this.session = next;
    }
    return next;
  }

  dispose(): void {
    this.release?.();
    this.release = null;
    this.session = null;
  }
}

/** How fast a drag near a container's edge scrolls it, and from how far. */
export interface AutoScrollOptions {
  /** How close to the edge, in pixels, the pointer has to come. Default 48. */
  readonly edge?: number;
  /** Pixels per second at the very edge. Default 900. */
  readonly speed?: number;
}

export interface DropTargetOptions {
  /**
   * Which payloads this zone will take: a type, several types, or a
   * predicate for a zone whose answer depends on the payload's data.
   */
  readonly accepts: string | readonly string[] | ((payload: UiDragPayload) => boolean);
  /**
   * The drag was let go here. What it did, so the source can say
   * whether the thing moved or was copied; returning nothing means
   * `'move'`, which is what almost every drop is.
   */
  readonly onDrop: (payload: UiDragPayload, at: { readonly x: number; readonly y: number }) => UiDropEffect | void;
  /** A payload this zone accepts arrived over it. */
  readonly onEnter?: (payload: UiDragPayload) => void;
  /** It moved while over the zone. */
  readonly onOver?: (payload: UiDragPayload, at: { readonly x: number; readonly y: number }) => void;
  /** It left, or the drag ended elsewhere. */
  readonly onLeave?: () => void;
  /**
   * Properties to write while an accepted payload is over the zone, in
   * the shape `interactive` uses for hover and press:
   * `{ borderColor: 'accent', backgroundColor: 'surfaceRaised' }`.
   *
   * A drop zone that does not light up is a drop zone nobody finds. It
   * is here rather than left to the application because the state is
   * the modifier's and an application cannot see it without keeping a
   * copy.
   */
  readonly over?: Readonly<Record<string, unknown>>;
  /**
   * Whether a drag held near this container's edge scrolls it.
   *
   * Only meaningful on a scroll container, and the reason a long list
   * is reorderable at all: without it the only rows you can reach are
   * the ones already on screen. Off by default, since a zone that is
   * not a scroller has nothing to scroll.
   */
  readonly autoScroll?: boolean | AutoScrollOptions;
}

export interface DragSourceOptions {
  /**
   * What is being carried. A function when the payload depends on
   * state that changes between renders, which is most of them.
   */
  readonly payload: UiDragPayload | (() => UiDragPayload);
  /**
   * Whether the drag opens on a press and a move, or only after a long
   * press. Default `'press'`, matching `draggable`, and for the same
   * reason: the recognizer resolves a press that moves immediately to a
   * Pan and only a held press to a Drag.
   */
  readonly start?: 'press' | 'longPress';
  /** Properties to write while the drag runs. */
  readonly dragging?: Readonly<Record<string, unknown>>;
  /**
   * The drag ended. `result` is null when it was let go over nothing
   * that would take it, and `velocity` is the speed it was travelling
   * at, in pixels per second, ready for a spring that carries the node
   * back.
   */
  readonly onEnd?: (result: UiDragResult | null, velocity: { readonly x: number; readonly y: number }) => void;
}

/**
 * Somewhere a drag can be put down.
 *
 * `draggable` moves a node's transform and stops, and for a year that
 * was the whole of dragging: every application that needed a drag to
 * *mean* something wrote its own hit testing over its own coordinates.
 * Segue's queue did, over a row height constant and a rounded division.
 *
 * The zone registers itself with the session for its graph and answers
 * three questions: where am I, would I take this, and what did the drop
 * do. Everything else is the session's, so two applications cannot
 * disagree about it: which of several overlapping zones wins, when enter
 * and leave fire, and what a drop reports back to the source.
 *
 * The box it reports is `layoutBox()`, which is where the node is
 * *seen*: a row scrolled half off the top of a list is half a drop
 * target, exactly as it looks.
 */
const dropTargetKind = defineModifier<DropTargetOptions>({
  name: 'dropTarget',
  attach(host, options) {
    zones.set(host, new DropTarget(host, options).attach());
  },
  update(host, options) {
    zones.get(host)?.setOptions(options);
  }
});

const zones = new WeakMap<UiModifierHost, DropTarget>();

export function dropTarget(options: DropTargetOptions): UiModifier<DropTargetOptions> {
  return dropTargetKind(options);
}

class DropTarget implements UiDropZone {
  private readonly registration = new ZoneRegistration(this);
  private scrolling: ReturnType<typeof setInterval> | null = null;
  private toward = 0;

  constructor(
    private readonly host: UiModifierHost,
    private options: DropTargetOptions
  ) {}

  get node(): UiNode {
    return this.host.node;
  }

  attach(): this {
    this.registration.sync();
    this.host.onLayout(() => this.registration.sync());
    this.host.own(() => {
      this.stopScrolling();
      this.registration.dispose();
    });
    return this;
  }

  setOptions(options: DropTargetOptions): void {
    this.options = options;
  }

  boxOf() {
    return this.host.layoutBox();
  }

  accepts(payload: UiDragPayload): boolean {
    const rule = this.options.accepts;
    if (typeof rule === 'function') {
      return rule(payload);
    }
    if (typeof rule === 'string') {
      return rule === payload.type;
    }
    return rule.includes(payload.type);
  }

  enter(state: UiDragState): void {
    for (const [property, value] of Object.entries(this.options.over ?? {})) {
      this.host.set(property, value);
    }
    this.options.onEnter?.(state.payload);
    this.over(state);
  }

  over(state: UiDragState): void {
    this.options.onOver?.(state.payload, { x: state.x, y: state.y });
    this.updateAutoScroll(state);
  }

  leave(): void {
    for (const property of Object.keys(this.options.over ?? {})) {
      this.host.clear(property);
    }
    this.stopScrolling();
    this.options.onLeave?.();
  }

  drop(state: UiDragState): UiDropEffect {
    return this.options.onDrop(state.payload, { x: state.x, y: state.y }) ?? 'move';
  }

  // ---------------------------------------------------------------------
  // Auto-scroll
  // ---------------------------------------------------------------------

  /**
   * Scrolls the container while the drag is held near one of its edges.
   *
   * The rate is driven by a timer rather than by pointer movement, and
   * it has to be: the gesture a person makes is to hold the card still
   * at the top of the list and wait, which produces no pointer events
   * at all. The interval is cleared when the drag leaves, when it ends,
   * and when the modifier detaches, so nothing survives the node.
   */
  private updateAutoScroll(state: UiDragState): void {
    const settings = this.options.autoScroll;
    if (settings === undefined || settings === false) {
      return;
    }
    const box = this.host.layoutBox();
    const offset = this.host.scrollOffset();
    if (box === null || offset === null) {
      return;
    }
    const edge = (settings === true ? undefined : settings.edge) ?? 48;
    const speed = (settings === true ? undefined : settings.speed) ?? 900;
    const fromTop = state.y - box.y;
    const fromBottom = box.y + box.height - state.y;
    let fraction = 0;
    if (fromTop < edge) {
      fraction = -(edge - Math.max(fromTop, 0)) / edge;
    } else if (fromBottom < edge) {
      fraction = (edge - Math.max(fromBottom, 0)) / edge;
    }
    this.toward = fraction * speed;
    if (this.toward === 0) {
      this.stopScrolling();
      return;
    }
    if (this.scrolling === null) {
      this.scrolling = setInterval(() => this.stepScroll(), SCROLL_TICK_MS);
    }
  }

  private stepScroll(): void {
    const offset = this.host.scrollOffset();
    if (offset === null || this.toward === 0) {
      this.stopScrolling();
      return;
    }
    const next = Math.max(0, offset.y + (this.toward * SCROLL_TICK_MS) / 1000);
    if (next === offset.y) {
      return;
    }
    // The property, not an override: the runtime scrolls a container by
    // writing `scrollY` and the engine clamps it to the content on the
    // next pass, so writing it here is the same scroll a wheel makes.
    this.host.node.setProperty('scrollY', next);
    this.host.requestFrame();
  }

  private stopScrolling(): void {
    if (this.scrolling !== null) {
      clearInterval(this.scrolling);
      this.scrolling = null;
    }
    this.toward = 0;
  }
}

/** How often an auto-scroll advances. One frame at 60 Hz. */
const SCROLL_TICK_MS = 16;

/**
 * Opens a drag carrying a payload, and reports where it was put down.
 *
 * It moves nothing. `draggable` already moves a node with the pointer
 * and does it well, so this is the other half rather than a second copy
 * of the first: put both on the element and the card follows the
 * pointer and knows what it is. Splitting them is also what lets a drag
 * source be something that does *not* move, like a swatch that stays
 * where it is while a colour is carried off it.
 */
const dragSourceKind = defineModifier<DragSourceOptions>({
  name: 'dragSource',
  attach(host, options) {
    sources.set(host, new DragSource(host, options).attach());
  },
  update(host, options) {
    sources.get(host)?.setOptions(options);
  }
});

const sources = new WeakMap<UiModifierHost, DragSource>();

export function dragSource(options: DragSourceOptions): UiModifier<DragSourceOptions> {
  return dragSourceKind(options);
}

class DragSource {
  private session: UiDragSession | null = null;
  private dragging = false;

  constructor(
    private readonly host: UiModifierHost,
    private options: DragSourceOptions
  ) {}

  attach(): this {
    const longPress = this.options.start === 'longPress';
    this.host.on(longPress ? UiEventType.DragStart : UiEventType.PanStart, event =>
      this.begin(event as UiPointerEvent)
    );
    this.host.on(longPress ? UiEventType.DragMove : UiEventType.PanMove, event => this.move(event as UiPointerEvent));
    this.host.on(longPress ? UiEventType.DragEnd : UiEventType.PanEnd, event => this.end(event as UiGestureEvent));
    this.host.own(() => {
      if (this.dragging) {
        this.session?.cancel();
      }
    });
    return this;
  }

  setOptions(options: DragSourceOptions): void {
    this.options = options;
  }

  private begin(event: UiPointerEvent): void {
    const payload = typeof this.options.payload === 'function' ? this.options.payload() : this.options.payload;
    this.dragging = true;
    // Resolved here rather than at attach: a modifier attaches before
    // its node is linked into the tree, and by the time a gesture
    // reaches it the node is where it belongs.
    this.session = dragSessionFor(this.host.node);
    this.session.begin(payload, event.x, event.y, this.host.node);
    for (const [property, value] of Object.entries(this.options.dragging ?? {})) {
      this.host.set(property, value);
    }
  }

  private move(event: UiPointerEvent): void {
    if (!this.dragging) {
      return;
    }
    this.session?.move(event.x, event.y);
  }

  private end(event: UiGestureEvent): void {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    for (const property of Object.keys(this.options.dragging ?? {})) {
      this.host.clear(property);
    }
    const result = this.session?.end() ?? null;
    this.options.onEnd?.(result, { x: event.velocityX ?? 0, y: event.velocityY ?? 0 });
  }
}

export interface ReorderableOptions {
  /**
   * Which list this row belongs to. Two lists on one page have
   * different names, so a row cannot be dropped into a list that does
   * not want it.
   */
  readonly list: string;
  /** Where this row currently sits. */
  readonly index: number;
  /**
   * Move the row, now.
   *
   * Called as the drag crosses each row rather than once at the end, so
   * what is on screen is always the real order rather than a preview of
   * one: a drag abandoned half way leaves something coherent behind,
   * and there is no separate "committed" and "shown" order to keep in
   * step.
   */
  readonly onMove: (from: number, to: number) => void;
  /** Which way the row is carried. Default `'y'`. */
  readonly axis?: 'x' | 'y' | 'both';
  /** Whether the row is picked up on a press or on a long press. Default `'press'`. */
  readonly start?: 'press' | 'longPress';
  /** Properties to write on the row while it is being carried. */
  readonly dragging?: Readonly<Record<string, unknown>>;
  /** Told when this row is picked up and put down, for a list that wants to know. */
  readonly onDragChange?: (dragging: boolean) => void;
}

/**
 * A row that can be dragged into a different place in its list.
 *
 * One modifier on the row rather than a component around the list,
 * because a reorderable list is not a widget: it is a list whose rows
 * happen to be draggable, and every application's rows look different.
 *
 * It is a drag source and a drop target on the same node, over the same
 * session, which is what makes the whole thing about twenty lines: the
 * session already answers "which row is the pointer over", and a row
 * that hears an accepted payload enter it knows both indices and can
 * call `onMove` immediately.
 *
 * ## Why the row is placed from its layout box
 *
 * The obvious way to carry a row is to translate it by how far the
 * pointer has moved since the press. That works until the first
 * reorder, at which point the row has *also* been moved by the layout,
 * and the two movements add up: the row runs away from the finger at
 * twice the speed. Segue's hand-written version fixed it by adding a
 * row height back onto the origin each time it crossed one, which is
 * correct only for rows of a fixed height that it had to name a
 * constant for.
 *
 * This holds the grab point instead: where in the row the person took
 * hold of it. The translation is then always `pointer - grab -
 * layoutBox().y`, recomputed on every move *and on every layout*, so a
 * reorder underneath the row corrects itself on the frame it happens
 * and rows of different heights need no arithmetic at all.
 */
const reorderableKind = defineModifier<ReorderableOptions>({
  name: 'reorderable',
  attach(host, options) {
    rows.set(host, new Reorderable(host, options).attach());
  },
  update(host, options) {
    rows.get(host)?.setOptions(options);
  }
});

const rows = new WeakMap<UiModifierHost, Reorderable>();

export function reorderable(options: ReorderableOptions): UiModifier<ReorderableOptions> {
  return reorderableKind(options);
}

/** What a reorder drag carries: the list it came from, and where it is now. */
interface ReorderData {
  list: string;
  index: number;
  /**
   * Whether a move has been committed that the layout has not caught up
   * with yet.
   *
   * A crossing is decided by hit-testing the rows' boxes, and a move
   * changes every box below it, but not until the frame after. Two
   * pointer moves inside one frame would therefore have the second one
   * decided against the boxes the first one has already invalidated,
   * and the list reorders in a way nobody asked for. So a crossing
   * waits for the layout it caused: the flag is set here and cleared by
   * the carried row's own layout notification.
   */
  settling: boolean;
}

/** The payload type a reorder uses, so nothing else can be dropped on a row. */
const REORDER = 'gesso/reorder';

class Reorderable implements UiDropZone {
  private readonly registration = new ZoneRegistration(this);
  private session: UiDragSession | null = null;
  private carried: ReorderData | null = null;
  /** Where in the row the person took hold of it. */
  private grabX = 0;
  private grabY = 0;
  private pointerX = 0;
  private pointerY = 0;
  private dragging = false;

  /** What the element declared, which the translation is added to. */
  private basePivotX = 0;
  private basePivotY = 0;
  private baseScaleX = 1;
  private baseScaleY = 1;
  private baseRotation = 0;

  constructor(
    private readonly host: UiModifierHost,
    private options: ReorderableOptions
  ) {}

  get node(): UiNode {
    return this.host.node;
  }

  attach(): this {
    const declared = this.host.get<Record<string, unknown> | null | undefined>('transform');
    if (declared !== undefined && declared !== null) {
      this.basePivotX = numberOr(declared.x, 0);
      this.basePivotY = numberOr(declared.y, 0);
      this.baseScaleX = numberOr(declared.scaleX, 1);
      this.baseScaleY = numberOr(declared.scaleY, 1);
      this.baseRotation = numberOr(declared.rotation, 0);
    }
    this.registration.sync();

    const longPress = this.options.start === 'longPress';
    if (longPress) {
      // A held finger is also how a touchscreen asks for a context
      // menu, and a row that is about to be picked up is not asking a
      // question about itself. Refusing the default on the LongPress is
      // the escape hatch the recognizer documents for exactly this.
      this.host.on(UiEventType.LongPress, event => event.preventDefault());
    }
    this.host.on(longPress ? UiEventType.DragStart : UiEventType.PanStart, event =>
      this.begin(event as UiPointerEvent)
    );
    this.host.on(longPress ? UiEventType.DragMove : UiEventType.PanMove, event => this.move(event as UiPointerEvent));
    this.host.on(longPress ? UiEventType.DragEnd : UiEventType.PanEnd, () => this.end());
    // A reorder underneath the row moves the row; the translation is
    // recomputed from the new box so it stays under the finger.
    this.host.onLayout(() => {
      this.registration.sync();
      if (this.carried !== null) {
        // The move this row is carrying has landed; the next crossing
        // is decided against boxes that are up to date.
        this.carried.settling = false;
      }
      this.place();
    });
    this.host.own(() => {
      this.registration.dispose();
      if (this.dragging) {
        this.session?.cancel();
      }
    });
    return this;
  }

  setOptions(options: ReorderableOptions): void {
    this.options = options;
  }

  // ---------------------------------------------------------------------
  // The row as a drop target
  // ---------------------------------------------------------------------

  boxOf() {
    return this.host.layoutBox();
  }

  accepts(payload: UiDragPayload): boolean {
    return payload.type === REORDER && (payload.data as ReorderData).list === this.options.list;
  }

  enter(state: UiDragState): void {
    const data = state.payload.data as ReorderData;
    if (data.index === this.options.index || data.settling) {
      return;
    }
    this.options.onMove(data.index, this.options.index);
    // The payload follows the row it belongs to, so the next crossing
    // is measured from where the row now is rather than from where it
    // started.
    data.index = this.options.index;
    data.settling = true;
  }

  over(): void {
    // Everything happens on the crossing; there is nothing to do while
    // the pointer stays inside one row.
  }

  leave(): void {
    // The row keeps whatever order the crossings gave it.
  }

  drop(): UiDropEffect {
    return 'move';
  }

  // ---------------------------------------------------------------------
  // The row as a drag source
  // ---------------------------------------------------------------------

  private begin(event: UiPointerEvent): void {
    // The list this row sits in scrolls, and a row being carried is not
    // a pan for it: `UiTouchScroller` listens at the root and would
    // scroll the list under the finger otherwise.
    event.stopPropagation();
    const box = this.host.layoutBox();
    this.grabX = box === null ? 0 : event.x - box.x;
    this.grabY = box === null ? 0 : event.y - box.y;
    this.pointerX = event.x;
    this.pointerY = event.y;
    this.dragging = true;
    this.carried = { list: this.options.list, index: this.options.index, settling: false };
    this.session = this.registration.sync();
    this.session.begin({ type: REORDER, data: this.carried }, event.x, event.y, this.host.node);
    for (const [property, value] of Object.entries(this.options.dragging ?? {})) {
      this.host.set(property, value);
    }
    this.options.onDragChange?.(true);
    this.place();
  }

  private move(event: UiPointerEvent): void {
    if (!this.dragging) {
      return;
    }
    event.stopPropagation();
    this.pointerX = event.x;
    this.pointerY = event.y;
    this.place();
    this.session?.move(event.x, event.y);
  }

  private end(): void {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    this.carried = null;
    this.session?.end();
    for (const property of Object.keys(this.options.dragging ?? {})) {
      this.host.clear(property);
    }
    this.host.clear('transform');
    this.options.onDragChange?.(false);
  }

  /**
   * Puts the row where the pointer is holding it.
   *
   * The layout box is the row's place in the list *without* this
   * translation, because a modifier's override moves the paint and not
   * the layout, so subtracting it is what makes the placement absolute
   * rather than cumulative.
   */
  private place(): void {
    if (!this.dragging) {
      return;
    }
    const box = this.host.layoutBox();
    if (box === null) {
      return;
    }
    const axis = this.options.axis ?? 'y';
    const x = axis === 'y' ? 0 : this.pointerX - this.grabX - box.x;
    const y = axis === 'x' ? 0 : this.pointerY - this.grabY - box.y;
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
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
