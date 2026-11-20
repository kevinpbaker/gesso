import { BehaviorSubject, combineLatest, distinctUntilChanged, map, type Observable } from 'rxjs';

import { internalState, type ComponentContext, type InternalState } from 'gesso-framework';
import {
  Box,
  Paint,
  decorated,
  measure,
  measureFlow,
  type DecorationShape,
  type FocusRingOptions,
  type LayoutBox,
  type UiChild,
  type UiCursor,
  type UiKeyboardEvent,
  type UiModifier,
  type UiNode,
  type UiPointerEvent,
  type UiSemanticState
} from 'gesso-core';
import {
  BOX_HANDLES,
  boxHandleCursor,
  boxHandlePoint,
  holdAngle,
  pointInRect,
  readoutText,
  rectContains,
  rectFrom,
  rectsTouch,
  resizeRect,
  snapMove,
  snapPoint,
  unionRect,
  type BoxHandle,
  type CanvasPoint,
  type CanvasRect,
  type SnapGuide,
  type SnapHit,
  type SnapTarget
} from './geometry';
import {
  EMPTY_OVERLAY,
  HANDLE_SIZE,
  paintCanvasOverlay,
  type CanvasOverlayColors,
  type CanvasOverlayState
} from './overlay';

/**
 * One thing on the canvas, as the application describes it to the
 * editor: where it is, what it is called, and how it can be handled.
 * The editor never holds the application's model; it holds these, which
 * the application rebuilds from its model whenever the model changes.
 */
export interface CanvasShape {
  /** Stable across rebuilds: what selections and edits name it by. */
  readonly id: string;
  /** Its box, in the canvas's own pixels. */
  readonly bounds: CanvasRect;
  /** What a screen reader and an agent call it: `Rectangle, 300 × 200 mm`. */
  readonly label: string;
  /** More, said after the name: where it is, what it is joined to. */
  readonly description?: string;
  /**
   * How it is handled when chosen alone: `'box'` (the default) puts the
   * eight handles on its box, `'none'` gives it none, and a list gives
   * it handles of its own, as a line's two ends or a polygon's corners.
   * Several shapes chosen together share one box round all of them.
   */
  readonly handles?: 'box' | 'none' | readonly CanvasHandle[];
  /** Not chosen by a click or a marquee, as a shape on a locked layer. Still in the mirror. */
  readonly locked?: boolean;
  /**
   * Whether a point is on it, within `slack` canvas pixels: a line or a
   * circle's rim rather than its whole box. Its box when left out.
   */
  readonly hit?: (point: CanvasPoint, slack: number) => boolean;
  /** Points other things snap to: its ends, corners, centre, middles. */
  readonly snapPoints?: readonly SnapTarget[];
  /**
   * The point a move of it snaps to the grid by: a corner or an end, so
   * its numbers stay round. Its box's top left when left out.
   */
  readonly anchor?: CanvasPoint;
  /**
   * The shapes this one follows, by id: a dimension glued to a rectangle's
   * corner moves when the rectangle does. While any of them is moved or
   * reshaped it is not snapped to, where it was or where it goes.
   */
  readonly movesWith?: readonly string[];
}

/** A handle of a shape's own. */
export interface CanvasHandle {
  /** What the edit names it by: `'start'`, `'end'`, `'3'`. */
  readonly id: string;
  readonly at: CanvasPoint;
  /** The point Shift holds the drag at 45° round: a line end's other end. */
  readonly anchor?: CanvasPoint;
  readonly cursor?: UiCursor;
  /** `'none'` leaves it undrawn, for a handle the application draws itself (a turning handle's circle). Default `'square'`. */
  readonly look?: 'square' | 'none';
  /** False drags it freely, unsnapped and with no angle held: a turning handle steps by its own rule. Default true. */
  readonly snaps?: boolean;
}

/** Where an edit is: begun, moving, let go, or called off with Escape. */
export type CanvasEditPhase = 'start' | 'live' | 'end' | 'cancel';

/**
 * What the person is doing to the shapes, reported to the application,
 * which changes its model and hands the editor new shapes. Every edit
 * goes `start`, then any number of `live`, then `end` or `cancel`, and
 * every value is the total since `start`, not a step: apply it to what
 * the model was at `start`. That makes one edit one undo step however
 * many frames it took (open a transaction at `start`, commit it at
 * `end`, roll it back at `cancel`), and an edit the model refused part
 * of does not drift.
 */
export type CanvasEdit = CanvasEditKind & {
  /** The keys held when it was made, for an application whose own rules take them: Shift to square a box. */
  readonly modifiers?: { readonly shift: boolean; readonly alt: boolean };
};

/** The kinds of `CanvasEdit`, without what every one carries. */
export type CanvasEditKind =
  | {
      readonly kind: 'move';
      readonly ids: readonly string[];
      readonly dx: number;
      readonly dy: number;
      readonly phase: CanvasEditPhase;
      readonly snap: SnapHit | null;
    }
  | {
      readonly kind: 'resize';
      readonly ids: readonly string[];
      readonly handle: BoxHandle;
      /** The box at `start`: one shape's, or the box round several. */
      readonly from: CanvasRect;
      readonly to: CanvasRect;
      readonly phase: CanvasEditPhase;
      readonly snap: SnapHit | null;
    }
  | {
      readonly kind: 'handle';
      readonly id: string;
      readonly handle: string;
      readonly from: CanvasPoint;
      readonly to: CanvasPoint;
      readonly phase: CanvasEditPhase;
      readonly snap: SnapHit | null;
    }
  | {
      readonly kind: 'draw';
      readonly tool: string;
      readonly from: CanvasPoint;
      readonly to: CanvasPoint;
      readonly phase: CanvasEditPhase;
      readonly snap: SnapHit | null;
    };

export interface CanvasSnapOptions {
  /** How near, in screen pixels, a point has to come to snap. Default 8. */
  readonly reach?: number;
  /** A grid, in canvas pixels, for what snaps to nothing else. */
  readonly grid?: number;
  /** Where the grid's lines cross, in canvas pixels: the application's own origin. 0, 0 when left out. */
  readonly gridOrigin?: CanvasPoint;
  /** Shift holds a line or a handle to multiples of this many degrees. Default 45. */
  readonly angle?: number;
  /**
   * The application's own snaps, tried first for a point being drawn or
   * dragged: a tangent, a perpendicular, a point on a curve. Null for
   * none here, and the editor's own snapping follows.
   */
  readonly toPoint?: (
    point: CanvasPoint,
    context: { readonly from: CanvasPoint | null; readonly ids: readonly string[] }
  ) => SnapHit | null;
}

export interface CanvasEditingOptions {
  /** The shapes, in the order they are drawn: the last is on top and is hit first. */
  readonly shapes: Observable<readonly CanvasShape[]>;
  /** The chosen shapes' ids. Pass a cell to share it (an inspector, a layers list); one is made otherwise. */
  readonly selection?: InternalState<readonly string[]>;
  /** The shape under the pointer, the same way: a layers list that highlights a row shares it. */
  readonly hovered?: InternalState<string | null>;
  /** A drawing tool: while not null, a drag draws (`draw` edits) instead of choosing and moving. */
  readonly tool?: Observable<string | null>;
  readonly onEdit?: (edit: CanvasEdit) => void;
  /** Delete or Backspace with shapes chosen. */
  readonly onDelete?: (ids: readonly string[]) => void;
  /**
   * A press, before the editor does anything with it: a tool that
   * places points one click at a time takes them here. True keeps the
   * editor from choosing or starting a drag.
   */
  readonly onPress?: (point: CanvasPoint, event: UiPointerEvent) => boolean;
  /** Snapping, or false for none. Holding ⌘ or Ctrl turns it off for a drag. */
  readonly snap?: CanvasSnapOptions | false;
  /**
   * What the readout beside the pointer says for an edit; undefined for
   * the editor's own words, null for no readout. The editor's own are in
   * canvas pixels unless `units` says otherwise.
   */
  readonly readout?: (edit: CanvasEdit) => string | null | undefined;
  /** The application's units for the editor's own readout: pixels per unit, the unit's name, and whether y runs up. */
  readonly units?: { readonly scale: number; readonly unit: string; readonly yUp?: boolean };
  /** Whether a marquee chooses what it touches (the default) or only what it holds whole. */
  readonly marquee?: 'touch' | 'contain';
  /** How far an arrow key moves the chosen shapes, in canvas pixels; Shift ten times. Default 1. */
  readonly nudge?: number;
  /** With shapes chosen, Tab and Shift+Tab choose the next and the previous. Default true. */
  readonly tabSelects?: boolean;
  /**
   * Whether several chosen shapes share eight handles on the box round
   * them, a `resize` with all their ids. Default true; false for an
   * application that resizes one shape at a time.
   */
  readonly groupHandles?: boolean;
  readonly colors?: CanvasOverlayColors;
  /**
   * A ring round the canvas while it has the keyboard, and none while a
   * field beside it has it, so it is always clear where the next key
   * goes. Unlike a control's ring, it shows after a click as well as
   * after Tab: a canvas is clicked far more than it is tabbed to. True
   * for the theme's ring, or the options `focusRing` takes. It is drawn
   * on the node `modifiers` is on; the node that takes focus calls
   * `handlers.onFocus` and `handlers.onBlur` (`CanvasEditor` does).
   * Default false.
   */
  readonly focusRing?: boolean | FocusRingOptions;
}

/**
 * What `canvasEditing` gives the node the application draws its
 * shapes in. Spread `handlers` onto it, put `modifiers` on it, and add
 * `overlay` and `shapeNodes` as its last children. `CanvasEditor` does
 * exactly that; an application with its own pointer handling calls the
 * handlers from its own and keeps what it needs.
 */
export interface CanvasEditing {
  /** Measure the canvas node, so a pointer is found in its coordinates whatever the zoom above it. */
  readonly modifiers: readonly UiModifier[];
  readonly handlers: {
    readonly onPointerDown: (event: UiPointerEvent) => void;
    readonly onPointerUp: (event: UiPointerEvent) => void;
    readonly onPointerMove: (event: UiPointerEvent) => void;
    readonly onPointerLeave: () => void;
    readonly onPanStart: (event: UiPointerEvent) => void;
    readonly onPanMove: (event: UiPointerEvent) => void;
    readonly onPanEnd: (event: UiPointerEvent) => void;
    readonly onKeyDown: (event: UiKeyboardEvent) => void;
    /** The canvas took the keyboard: its ring shows, with `focusRing`. */
    readonly onFocus: () => void;
    /** The canvas lost the keyboard: its ring goes. */
    readonly onBlur: () => void;
  };
  /** The same, each saying whether it did anything: for chaining with an application's own. */
  readonly handle: {
    readonly pointerDown: (event: UiPointerEvent) => boolean;
    readonly panStart: (event: UiPointerEvent) => boolean;
    readonly panMove: (event: UiPointerEvent) => boolean;
    readonly panEnd: (event: UiPointerEvent) => boolean;
    readonly key: (event: UiKeyboardEvent) => boolean;
  };
  /** The painted overlay: hover, selection, handles, marquee, guides, snap mark, readout. */
  readonly overlay: UiChild;
  /** One node per shape in the semantics tree: an `option` a screen reader chooses and an agent presses. */
  readonly shapeNodes: UiChild;
  /** The node of the first chosen shape, for the canvas's `activeDescendant`. */
  readonly activeDescendant: Observable<UiNode | null>;
  readonly selection: InternalState<readonly string[]>;
  readonly hovered: InternalState<string | null>;
  /** Whether an edit is going on. */
  readonly editing: Observable<boolean>;
  /** Whether the canvas has the keyboard, as `handlers.onFocus` and `onBlur` say. */
  readonly focused: Observable<boolean>;
  /** The cursor the canvas should show: a resize cursor over a handle, a crosshair with a tool. */
  readonly cursor: Observable<UiCursor | undefined>;
  /** A pointer event's place in canvas pixels. */
  toLocal(event: { readonly x: number; readonly y: number }): CanvasPoint;
  /** Screen pixels per canvas pixel: the zoom above the canvas. */
  scale(): number;
  /**
   * Shows guides, a snap mark and a readout from the application's own
   * drag (a tool the editor does not run), drawn as the editor draws its
   * own. Null clears them.
   */
  show(
    feedback: {
      readonly guides?: readonly SnapGuide[];
      readonly snap?: CanvasPoint | null;
      readonly readout?: { readonly text: string; readonly at: CanvasPoint } | null;
    } | null
  ): void;
}

type Pending =
  | { readonly kind: 'move'; readonly id: string; readonly at: CanvasPoint; readonly shift: boolean }
  | { readonly kind: 'box'; readonly handle: BoxHandle; readonly at: CanvasPoint }
  | { readonly kind: 'own'; readonly id: string; readonly handle: CanvasHandle; readonly at: CanvasPoint }
  | { readonly kind: 'marquee'; readonly at: CanvasPoint; readonly adding: readonly string[] }
  | { readonly kind: 'draw'; readonly tool: string; readonly at: CanvasPoint; readonly snap: SnapHit | null };

type Gesture =
  | {
      readonly kind: 'move';
      readonly ids: readonly string[];
      readonly start: CanvasPoint;
      readonly boxes: readonly CanvasRect[];
      /** The moving shapes' own snap points, where they were at the start. */
      readonly points: readonly SnapTarget[];
      readonly anchor: CanvasPoint | undefined;
      last: CanvasEdit;
    }
  | {
      readonly kind: 'box';
      readonly ids: readonly string[];
      readonly handle: BoxHandle;
      readonly from: CanvasRect;
      readonly start: CanvasPoint;
      last: CanvasEdit;
    }
  | {
      readonly kind: 'own';
      readonly id: string;
      readonly handle: CanvasHandle;
      readonly start: CanvasPoint;
      last: CanvasEdit;
    }
  | { readonly kind: 'marquee'; readonly start: CanvasPoint; readonly adding: readonly string[] }
  | {
      readonly kind: 'draw';
      readonly tool: string;
      readonly from: CanvasPoint;
      readonly fromSnap: SnapHit | null;
      last: CanvasEdit;
    };

const NOWHERE: LayoutBox = { x: 0, y: 0, width: 0, height: 0 };

/**
 * The editing behaviour of a canvas whose shapes the application owns:
 * choosing by click, Shift-click and marquee; the outline under the
 * pointer; moving; the eight handles of a box (a side handle moves that
 * side, Shift on a corner keeps the proportions) or a shape's own;
 * snapping to points, to other shapes' edges and centres and to a grid,
 * with guides and a mark; the readout beside the pointer; keys; and a
 * node per shape in the semantics tree.
 */
export function canvasEditing(ctx: ComponentContext, options: CanvasEditingOptions): CanvasEditing {
  const selection = options.selection ?? internalState<readonly string[]>([]);
  const hovered = options.hovered ?? internalState<string | null>(null);
  const shapes = new BehaviorSubject<readonly CanvasShape[]>([]);
  ctx.effect(options.shapes, next => shapes.next(next));
  const tool = new BehaviorSubject<string | null>(null);
  if (options.tool !== undefined) {
    ctx.effect(options.tool, next => tool.next(next));
  }
  const screen = new BehaviorSubject<LayoutBox>(NOWHERE);
  const flow = new BehaviorSubject<LayoutBox>(NOWHERE);
  const feedback = new BehaviorSubject<Pick<CanvasOverlayState, 'marquee' | 'guides' | 'snap' | 'readout'>>({
    marquee: null,
    guides: [],
    snap: null,
    readout: null
  });
  const editing = new BehaviorSubject(false);
  const focused = new BehaviorSubject(false);
  const overHandle = new BehaviorSubject<UiCursor | undefined>(undefined);
  const nodes = new Map<string, UiNode>();
  let pending: Pending | null = null;
  let gesture: Gesture | null = null;
  let panned = false;

  const scale = (): number => {
    const s = flow.value.width > 0 ? screen.value.width / flow.value.width : 1;
    return s > 0 && Number.isFinite(s) ? s : 1;
  };
  const toLocal = (event: { readonly x: number; readonly y: number }): CanvasPoint => {
    const s = scale();
    return { x: (event.x - screen.value.x) / s, y: (event.y - screen.value.y) / s };
  };
  const byId = (id: string): CanvasShape | undefined => shapes.value.find(shape => shape.id === id);
  const chosen = (): CanvasShape[] => selection.value.map(byId).filter((s): s is CanvasShape => s !== undefined);
  const select = (ids: readonly string[]): void => {
    const current = selection.value;
    if (current.length !== ids.length || current.some((id, i) => id !== ids[i])) {
      selection.value = ids;
    }
  };
  const emit = (edit: CanvasEdit): void => options.onEdit?.(edit);
  const snapping = (event: {
    readonly modifiers: { readonly meta: boolean; readonly ctrl: boolean };
  }): CanvasSnapOptions | null =>
    options.snap === false || event.modifiers.meta || event.modifiers.ctrl ? null : (options.snap ?? {});
  const reach = (snap: CanvasSnapOptions): number => (snap.reach ?? 8) / scale();

  const hitShape = (p: CanvasPoint): CanvasShape | null => {
    const slack = 3 / scale();
    const all = shapes.value;
    for (let i = all.length - 1; i >= 0; i--) {
      const shape = all[i];
      if (shape.locked === true) continue;
      if (shape.hit !== undefined ? shape.hit(p, slack) : pointInRect(p, shape.bounds, slack)) {
        return shape;
      }
    }
    return null;
  };

  /** The box the eight handles are on now, or null. */
  const handleBox = (): CanvasRect | null => {
    const picked = chosen();
    if (picked.length === 0) return null;
    if (picked.length === 1) {
      const handles = picked[0].handles ?? 'box';
      return handles === 'box' ? picked[0].bounds : null;
    }
    return options.groupHandles === false ? null : unionRect(picked.map(shape => shape.bounds));
  };
  const ownHandles = (): readonly CanvasHandle[] => {
    const picked = chosen();
    if (picked.length !== 1) return [];
    const handles = picked[0].handles;
    return Array.isArray(handles) ? handles : [];
  };
  const hitHandle = (p: CanvasPoint): Pending | null => {
    const near = (HANDLE_SIZE / 2 + 2) / scale();
    for (const handle of ownHandles()) {
      if (Math.abs(handle.at.x - p.x) <= near && Math.abs(handle.at.y - p.y) <= near) {
        return { kind: 'own', id: selection.value[0], handle, at: p };
      }
    }
    const box = handleBox();
    if (box !== null) {
      for (const handle of BOX_HANDLES) {
        const at = boxHandlePoint(box, handle);
        if (Math.abs(at.x - p.x) <= near && Math.abs(at.y - p.y) <= near) {
          return { kind: 'box', handle, at: p };
        }
      }
    }
    return null;
  };

  /**
   * What a drag snaps to, as it was when the drag began: what moves with
   * the dragged shapes (a dimension glued to a corner) must not become a
   * target, and the targets need not be gathered again every frame.
   */
  let frozenTargets: { boxes: CanvasRect[]; points: SnapTarget[] } | null = null;
  /** Everything not being moved, to snap to. */
  const othersOf = (ids: readonly string[]): { boxes: CanvasRect[]; points: SnapTarget[] } => {
    if (frozenTargets !== null) return frozenTargets;
    const moving = new Set(ids);
    const boxes: CanvasRect[] = [];
    const points: SnapTarget[] = [];
    for (const shape of shapes.value) {
      if (moving.has(shape.id) || shape.movesWith?.some(id => moving.has(id)) === true) continue;
      boxes.push(shape.bounds);
      points.push(...(shape.snapPoints ?? boxPoints(shape.bounds)));
    }
    return { boxes, points };
  };

  const pointSnap = (
    p: CanvasPoint,
    event: UiPointerEvent,
    ids: readonly string[],
    from: CanvasPoint | null
  ): { point: CanvasPoint; hit: SnapHit | null } => {
    const snap = snapping(event);
    if (snap === null) return { point: p, hit: null };
    const own = snap.toPoint?.(p, { from, ids });
    if (own !== null && own !== undefined) return { point: own.point, hit: own };
    return snapPoint(p, othersOf(ids).points, { reach: reach(snap), grid: snap.grid, gridOrigin: snap.gridOrigin });
  };

  const readout = (edit: CanvasEdit, at: CanvasPoint): CanvasOverlayState['readout'] => {
    const own = options.readout?.(edit);
    if (own === null) return null;
    const units = options.units;
    const opts = units === undefined ? {} : { scale: units.scale, unit: units.unit, yUp: units.yUp };
    let text = own;
    if (text === undefined) {
      switch (edit.kind) {
        case 'move':
          text = readoutText('move', { x: 0, y: 0 }, { x: edit.dx, y: edit.dy }, opts);
          break;
        case 'resize':
          text = readoutText(
            'box',
            { x: edit.to.x, y: edit.to.y },
            { x: edit.to.x + edit.to.width, y: edit.to.y + edit.to.height },
            opts
          );
          break;
        case 'handle': {
          const anchor = gesture?.kind === 'own' ? gesture.handle.anchor : undefined;
          text =
            anchor === undefined
              ? readoutText('move', edit.from, edit.to, opts)
              : readoutText('length', anchor, edit.to, opts);
          break;
        }
        default:
          text = readoutText('length', edit.from, edit.to, opts);
      }
    }
    return { text, at };
  };

  const showEdit = (edit: CanvasEdit, at: CanvasPoint): void => {
    feedback.next({
      marquee: null,
      guides: edit.snap?.guides ?? [],
      snap: edit.snap !== null && edit.snap.kind !== 'grid' && edit.snap.guides.length === 0 ? edit.snap.point : null,
      readout: readout(edit, at)
    });
  };
  const clearFeedback = (): void => feedback.next({ marquee: null, guides: [], snap: null, readout: null });

  // -------------------------------------------------------------------------
  // Pointer
  // -------------------------------------------------------------------------

  const pointerDown = (event: UiPointerEvent): boolean => {
    const p = toLocal(event);
    panned = false;
    pending = null;
    if (options.onPress?.(p, event) === true) {
      return true;
    }
    const drawing = tool.value;
    if (drawing !== null) {
      const snapped = pointSnap(p, event, [], null);
      pending = { kind: 'draw', tool: drawing, at: snapped.point, snap: snapped.hit };
      return true;
    }
    const onHandle = hitHandle(p);
    if (onHandle !== null) {
      pending = onHandle;
      return true;
    }
    const shape = hitShape(p);
    const shift = event.modifiers.shift;
    if (shape === null) {
      if (!shift) select([]);
      pending = { kind: 'marquee', at: p, adding: shift ? selection.value : [] };
      return true;
    }
    const isChosen = selection.value.includes(shape.id);
    if (shift) {
      select(isChosen ? selection.value.filter(id => id !== shape.id) : [...selection.value, shape.id]);
    } else if (!isChosen) {
      select([shape.id]);
    }
    pending = { kind: 'move', id: shape.id, at: p, shift };
    return true;
  };

  const pointerUp = (_event: UiPointerEvent): void => {
    // A click (no drag) on one of several chosen shapes chooses it alone.
    if (!panned && pending?.kind === 'move' && !pending.shift && selection.value.length > 1) {
      select([pending.id]);
    }
    if (!panned) pending = null;
  };

  const panStart = (event: UiPointerEvent): boolean => {
    const start = pending;
    if (start === null) return false;
    panned = true;
    pending = null;
    const modifiers = { shift: event.modifiers.shift, alt: event.modifiers.alt };
    switch (start.kind) {
      case 'move': {
        const ids = selection.value.includes(start.id) ? selection.value : [start.id];
        frozenTargets = othersOf(ids);
        const moving = ids.map(byId).filter((shape): shape is CanvasShape => shape !== undefined);
        const boxes = moving.map(shape => shape.bounds);
        const points = shapes.value.some(shape => shape.snapPoints !== undefined)
          ? moving.flatMap(shape => shape.snapPoints ?? boxPoints(shape.bounds))
          : [];
        const first: CanvasEdit = { kind: 'move', ids, dx: 0, dy: 0, phase: 'start', snap: null, modifiers };
        gesture = { kind: 'move', ids, start: start.at, boxes, points, anchor: byId(start.id)?.anchor, last: first };
        break;
      }
      case 'box': {
        const from = handleBox();
        if (from === null) return false;
        frozenTargets = othersOf(selection.value);
        const first: CanvasEdit = {
          modifiers,
          kind: 'resize',
          ids: selection.value,
          handle: start.handle,
          from,
          to: from,
          phase: 'start',
          snap: null
        };
        gesture = { kind: 'box', ids: selection.value, handle: start.handle, from, start: start.at, last: first };
        break;
      }
      case 'own': {
        frozenTargets = othersOf([start.id]);
        const first: CanvasEdit = {
          modifiers,
          kind: 'handle',
          id: start.id,
          handle: start.handle.id,
          from: start.handle.at,
          to: start.handle.at,
          phase: 'start',
          snap: null
        };
        gesture = { kind: 'own', id: start.id, handle: start.handle, start: start.at, last: first };
        break;
      }
      case 'marquee':
        gesture = { kind: 'marquee', start: start.at, adding: start.adding };
        editing.next(true);
        return true;
      case 'draw': {
        frozenTargets = othersOf([]);
        const first: CanvasEdit = {
          modifiers,
          kind: 'draw',
          tool: start.tool,
          from: start.at,
          to: start.at,
          phase: 'start',
          snap: start.snap
        };
        gesture = { kind: 'draw', tool: start.tool, from: start.at, fromSnap: start.snap, last: first };
        break;
      }
    }
    editing.next(true);
    emit(gesture.last);
    return true;
  };

  const panMove = (event: UiPointerEvent): boolean => {
    const g = gesture;
    if (g === null) return false;
    const p = toLocal(event);
    switch (g.kind) {
      case 'marquee': {
        feedback.next({ marquee: rectFrom(g.start, p), guides: [], snap: null, readout: null });
        return true;
      }
      case 'move': {
        let dx = p.x - g.start.x;
        let dy = p.y - g.start.y;
        if (event.modifiers.shift) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        let hit: SnapHit | null = null;
        const snap = snapping(event);
        const box = unionRect(g.boxes);
        if (snap !== null && box !== null) {
          const moved = { ...box, x: box.x + dx, y: box.y + dy };
          const others = othersOf(g.ids);
          const shifted = snapMove(moved, others.boxes, {
            reach: reach(snap),
            grid: snap.grid,
            gridOrigin: snap.gridOrigin,
            anchor: g.anchor === undefined ? undefined : { x: g.anchor.x + dx, y: g.anchor.y + dy },
            points: g.points.map(q => ({ x: q.x + dx, y: q.y + dy })),
            targets: others.points
          });
          dx += event.modifiers.shift && dx === 0 ? 0 : shifted.dx;
          dy += event.modifiers.shift && dy === 0 ? 0 : shifted.dy;
          hit = shifted.hit;
        }
        g.last = { kind: 'move', ids: g.ids, dx, dy, phase: 'live', snap: hit, modifiers: keys(event) };
        break;
      }
      case 'box': {
        const corner = boxHandlePoint(g.from, g.handle);
        const raw = { x: corner.x + p.x - g.start.x, y: corner.y + p.y - g.start.y };
        const snapped = pointSnap(raw, event, g.ids, null);
        const to = resizeRect(
          g.from,
          g.handle,
          snapped.point.x - corner.x,
          snapped.point.y - corner.y,
          event.modifiers.shift
        );
        g.last = {
          kind: 'resize',
          ids: g.ids,
          handle: g.handle,
          from: g.from,
          to,
          phase: 'live',
          snap: snapped.hit,
          modifiers: keys(event)
        };
        break;
      }
      case 'own': {
        const raw = { x: g.handle.at.x + p.x - g.start.x, y: g.handle.at.y + p.y - g.start.y };
        const anchor = g.handle.anchor ?? null;
        const free = g.handle.snaps === false;
        let snapped = free ? { point: raw, hit: null } : pointSnap(raw, event, [g.id], anchor);
        if (!free && event.modifiers.shift && anchor !== null) {
          snapped = { point: holdAngle(anchor, raw, snapAngle()), hit: null };
        }
        g.last = {
          modifiers: keys(event),
          kind: 'handle',
          id: g.id,
          handle: g.handle.id,
          from: g.handle.at,
          to: snapped.point,
          phase: 'live',
          snap: snapped.hit
        };
        break;
      }
      case 'draw': {
        let snapped = pointSnap(p, event, [], g.from);
        if (event.modifiers.shift) {
          snapped = { point: holdAngle(g.from, p, snapAngle()), hit: null };
        }
        g.last = {
          kind: 'draw',
          tool: g.tool,
          from: g.from,
          to: snapped.point,
          phase: 'live',
          snap: snapped.hit,
          modifiers: keys(event)
        };
        break;
      }
    }
    emit(g.last);
    showEdit(g.last, p);
    return true;
  };

  const keys = (event: UiPointerEvent) => ({ shift: event.modifiers.shift, alt: event.modifiers.alt });

  const snapAngle = (): number => (options.snap === false ? 45 : (options.snap?.angle ?? 45));

  const panEnd = (event: UiPointerEvent): boolean => {
    const g = gesture;
    if (g === null) return false;
    gesture = null;
    frozenTargets = null;
    editing.next(false);
    if (g.kind === 'marquee') {
      const area = rectFrom(g.start, toLocal(event));
      const mode = options.marquee ?? 'touch';
      const inside = shapes.value
        .filter(shape => shape.locked !== true)
        .filter(shape => (mode === 'contain' ? rectContains(area, shape.bounds) : rectsTouch(area, shape.bounds)))
        .map(shape => shape.id);
      select([...g.adding, ...inside.filter(id => !g.adding.includes(id))]);
      clearFeedback();
      return true;
    }
    emit({ ...g.last, phase: 'end' } as CanvasEdit);
    clearFeedback();
    return true;
  };

  const cancel = (): boolean => {
    const g = gesture;
    if (g === null) return false;
    gesture = null;
    frozenTargets = null;
    editing.next(false);
    if (g.kind !== 'marquee') {
      emit({ ...g.last, phase: 'cancel' } as CanvasEdit);
    }
    clearFeedback();
    return true;
  };

  const pointerMove = (event: UiPointerEvent): void => {
    if (gesture !== null || event.buttons !== 0) return;
    const p = toLocal(event);
    if (tool.value !== null) {
      overHandle.next('crosshair');
      if (hovered.value !== null) hovered.value = null;
      return;
    }
    const onHandle = hitHandle(p);
    overHandle.next(
      onHandle === null
        ? undefined
        : onHandle.kind === 'box'
          ? boxHandleCursor(onHandle.handle)
          : onHandle.kind === 'own'
            ? (onHandle.handle.cursor ?? 'move')
            : undefined
    );
    const id = onHandle === null ? (hitShape(p)?.id ?? null) : null;
    if (hovered.value !== id) hovered.value = id;
  };

  const pointerLeave = (): void => {
    if (hovered.value !== null) hovered.value = null;
    overHandle.next(undefined);
  };

  // -------------------------------------------------------------------------
  // Keys
  // -------------------------------------------------------------------------

  const keyEdit = (edit: CanvasEdit): void => {
    emit({ ...edit, phase: 'start' } as CanvasEdit);
    emit({ ...edit, phase: 'end' } as CanvasEdit);
  };

  const key = (event: UiKeyboardEvent): boolean => {
    const ids = selection.value;
    const mod = event.modifiers.meta || event.modifiers.ctrl;
    switch (event.key) {
      case 'Escape':
        if (cancel()) return true;
        if (ids.length > 0) {
          select([]);
          return true;
        }
        return false;
      case 'Delete':
      case 'Backspace':
        if (ids.length === 0 || options.onDelete === undefined) return false;
        options.onDelete(ids);
        return true;
      case 'a':
      case 'A':
        if (!mod) return false;
        select(shapes.value.filter(shape => shape.locked !== true).map(shape => shape.id));
        return true;
      case 'Tab': {
        if (ids.length === 0 || options.tabSelects === false || mod) return false;
        const open = shapes.value.filter(shape => shape.locked !== true);
        if (open.length === 0) return false;
        const at = open.findIndex(shape => shape.id === ids[ids.length - 1]);
        const next = (at + (event.modifiers.shift ? -1 : 1) + open.length) % open.length;
        select([open[next].id]);
        return true;
      }
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (ids.length === 0 || mod) return false;
        const step = (options.nudge ?? 1) * (event.modifiers.shift ? 10 : 1);
        const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
        const sign = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
        if (event.modifiers.alt) {
          // Alt and an arrow: the far side in or out, the keyboard's resize.
          const from = handleBox();
          if (from === null) return false;
          const handle: BoxHandle = horizontal ? 'e' : 's';
          const to = resizeRect(from, handle, horizontal ? sign * step : 0, horizontal ? 0 : sign * step);
          keyEdit({ kind: 'resize', ids, handle, from, to, phase: 'end', snap: null });
          return true;
        }
        keyEdit({
          kind: 'move',
          ids,
          dx: horizontal ? sign * step : 0,
          dy: horizontal ? 0 : sign * step,
          phase: 'end',
          snap: null
        });
        return true;
      }
      default:
        return false;
    }
  };

  // -------------------------------------------------------------------------
  // What is drawn, and what is in the semantics tree
  // -------------------------------------------------------------------------

  const state: Observable<CanvasOverlayState> = combineLatest([shapes, selection, hovered, feedback, editing]).pipe(
    map(([all, ids, over, fb, busy]): CanvasOverlayState => {
      const picked = ids.map(id => all.find(shape => shape.id === id)).filter((s): s is CanvasShape => s !== undefined);
      const box = busy && gesture?.kind !== 'marquee' ? null : handleBox();
      const own = busy ? [] : ownHandles().flatMap(handle => (handle.look === 'none' ? [] : [handle.at]));
      const hover =
        over === null || ids.includes(over) || busy ? null : (all.find(shape => shape.id === over)?.bounds ?? null);
      return {
        ...EMPTY_OVERLAY,
        hovered: hover,
        selected: picked.map(shape => shape.bounds),
        box,
        points: own,
        ...fb
      };
    })
  );

  const size = flow.pipe(
    map(box => ({ width: box.width, height: box.height })),
    distinctUntilChanged((a, b) => a.width === b.width && a.height === b.height)
  );

  const overlay = Paint({
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    hitTestable: false,
    paint: combineLatest([state, size, screen]).pipe(
      map(([now, area]) => {
        const s = scale();
        return {
          inputs: [now, area.width, area.height, s],
          draw: surface => paintCanvasOverlay(surface, now, area, s, options.colors)
        };
      })
    )
  });

  const structure = shapes.pipe(
    map(all => all.map(shape => shape.id).join('\u0000')),
    distinctUntilChanged()
  );
  const shapeNodes = Box(
    { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, pointerEvents: 'none' },
    structure.pipe(
      map(() =>
        shapes.value.map(initial => {
          const live = shapes.pipe(
            map(all => all.find(shape => shape.id === initial.id) ?? initial),
            distinctUntilChanged()
          );
          return Box({
            key: initial.id,
            ref: (node: UiNode | null) => {
              if (node === null) nodes.delete(initial.id);
              else nodes.set(initial.id, node);
            },
            position: 'absolute',
            left: live.pipe(map(shape => shape.bounds.x)),
            top: live.pipe(map(shape => shape.bounds.y)),
            width: live.pipe(map(shape => Math.max(1, shape.bounds.width))),
            height: live.pipe(map(shape => Math.max(1, shape.bounds.height))),
            // Not hit by the pointer, which the canvas answers; a press
            // from the semantics mirror (a screen reader, an agent) still
            // reaches it, and chooses it.
            pointerEvents: 'none',
            role: 'option',
            label: live.pipe(map(shape => shape.label)),
            description: live.pipe(map(shape => shape.description ?? '')),
            disabled: live.pipe(map(shape => shape.locked === true)),
            states: selection.pipe(map(ids => (ids.includes(initial.id) ? (['selected'] as UiSemanticState[]) : []))),
            onClick: () => {
              if (byId(initial.id)?.locked !== true) select([initial.id]);
            }
          });
        })
      )
    )
  );

  const activeDescendant = selection.pipe(
    map(ids => (ids.length === 0 ? null : (nodes.get(ids[0]) ?? null))),
    distinctUntilChanged()
  );

  const cursor = combineLatest([overHandle, editing, tool]).pipe(
    map(([over, busy, drawing]): UiCursor | undefined =>
      drawing !== null ? 'crosshair' : busy && gesture?.kind === 'move' ? 'move' : over
    ),
    distinctUntilChanged()
  );

  const ring =
    options.focusRing === undefined || options.focusRing === false
      ? null
      : ringShapes(options.focusRing === true ? {} : options.focusRing);
  const ringModifier =
    ring === null
      ? []
      : [
          decorated(
            focused.pipe(
              distinctUntilChanged(),
              map(on => (on ? ring : NO_SHAPES))
            )
          )
        ];

  return {
    modifiers: [measure(screen), measureFlow(flow), ...ringModifier],
    handlers: {
      onPointerDown: event => {
        pointerDown(event);
      },
      onPointerUp: pointerUp,
      onPointerMove: pointerMove,
      onPointerLeave: pointerLeave,
      onPanStart: event => {
        panStart(event);
      },
      onPanMove: event => {
        panMove(event);
      },
      onPanEnd: event => {
        panEnd(event);
      },
      onKeyDown: event => {
        if (key(event)) event.preventDefault();
      },
      onFocus: () => focused.next(true),
      onBlur: () => focused.next(false)
    },
    handle: { pointerDown, panStart, panMove, panEnd, key },
    overlay,
    shapeNodes,
    activeDescendant,
    selection,
    hovered,
    editing,
    focused,
    cursor,
    toLocal,
    scale,
    show: next => {
      if (next === null) {
        clearFeedback();
        return;
      }
      feedback.next({
        marquee: null,
        guides: next.guides ?? [],
        snap: next.snap ?? null,
        readout: next.readout ?? null
      });
    }
  };
}

const NO_SHAPES: readonly DecorationShape[] = [];

/**
 * The canvas's ring, as `focusRing` draws one: a band `offset` clear of
 * the node and `width` thick. Drawn here rather than by `focusRing`
 * because that one shows only for the keyboard's focus, and because the
 * node the kit measures need not be the node that takes focus.
 */
function ringShapes(options: FocusRingOptions): readonly DecorationShape[] {
  const width = options.width ?? 2;
  const offset = options.offset ?? 2;
  return [
    {
      kind: 'stroke',
      color: options.color ?? 'focusRing',
      lineWidth: width,
      outset: offset + width,
      ...(options.radius === undefined ? {} : { radius: options.radius }),
      ...(options.after === undefined ? {} : { after: options.after })
    }
  ];
}

/** A box's corners, side middles and centre: what a shape with no snap points of its own snaps by. */
export function boxPoints(r: CanvasRect): SnapTarget[] {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return [
    { x: r.x, y: r.y, kind: 'corner' },
    { x: r.x + r.width, y: r.y, kind: 'corner' },
    { x: r.x + r.width, y: r.y + r.height, kind: 'corner' },
    { x: r.x, y: r.y + r.height, kind: 'corner' },
    { x: cx, y: r.y, kind: 'middle' },
    { x: r.x + r.width, y: cy, kind: 'middle' },
    { x: cx, y: r.y + r.height, kind: 'middle' },
    { x: r.x, y: cy, kind: 'middle' },
    { x: cx, y: cy, kind: 'centre' }
  ];
}
