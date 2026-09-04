import { combineLatest, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { type ComponentContext, type Inputs, internalState, AnimationService } from '@gesso/framework';
import {
  type UiChild,
  spring,
  type UiSpringToken,
  type UiTheme,
  type UiColors,
  type UiColor,
  parseColor,
  animateLayout
} from '@gesso/core';
import { Board } from './board/BoardContract';
import { BORDER, gessoColors, gessoTheme, LINEN, POSITIVE, SURFACE, SURFACE_RAISED } from './brand';

/**
 * A sprint board that moves.
 *
 * Everything on this page is animated and **nothing on it re-renders**.
 * A component's body runs once; an animation is a value changing over
 * time, not a tree being rebuilt, and this example exists to make the
 * difference concrete on a screen where cards move, grow, pop and
 * disappear.
 *
 * The four ways to ask for motion are all here, and they are worth
 * telling apart:
 *
 *   - **`transition` on an element.** The expanded card's `height` and
 *     its detail's `opacity` are ordinary bound props. `transition`
 *     says how they travel; no code in the card starts an animation,
 *     and taking the prop away leaves a working card that jumps.
 *   - **`animateLayout` as a modifier.** Nothing declares where a card
 *     animates *from*: layout does. The modifier reads the box the
 *     card had last frame, draws it back there and springs it home, so
 *     a move between lanes, a reorder, and the shove a growing card
 *     gives its neighbours are all the same one line.
 *   - **`spring(cell, to)` for a gesture.** Pressing a card springs it
 *     to 96% and releasing springs it back. Springs have no duration:
 *     press and release faster than it can settle and the second
 *     spring inherits the first's velocity, so it bends instead of
 *     restarting.
 *   - **`animate(cell, to, …)` for a sequence.** The undo bar slides
 *     in on a tween, and slides out on one whose completion is what
 *     finally clears it from the store — which is how an app does an
 *     exit animation today, by keeping the node and driving it, since
 *     nothing in the framework holds a node that has logically left.
 *
 * **Watch `ticks` in the status bar.** It is F4's phase, and it reads
 * `0.00 ms` whenever the board is still — not because the phase is
 * cheap but because an idle app schedules no frames at all. Move a
 * card and it wakes; let it settle and it goes quiet again.
 *
 * **Reduced motion is honoured, not ignored.** The switch stands in
 * for the platform's `prefers-reduced-motion`, which arrives from the
 * shell and lands on the same call. With it on, every animation here
 * writes its target immediately: the board still works, the end state
 * is identical, and no animation frame is scheduled at all.
 */

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

export type Lane = 'todo' | 'doing' | 'done';
export const LANES: readonly Lane[] = ['todo', 'doing', 'done'];
const LANE_TITLES: Record<Lane, string> = { todo: 'To do', doing: 'In progress', done: 'Done' };

export type TagName = 'layout' | 'render' | 'input';

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly tag: TagName;
  readonly points: number;
  readonly detail: string;
}

export const TASKS: readonly Task[] = [
  {
    id: 't1',
    title: 'Flex gap on the cross axis',
    tag: 'layout',
    points: 3,
    detail: 'Row and column gap resolve before the line is broken, not after.'
  },
  {
    id: 't2',
    title: 'Rounded clip on the GPU',
    tag: 'render',
    points: 5,
    detail: 'One SDF per corner; the path backend traces the same rectangle.'
  },
  {
    id: 't3',
    title: 'Wheel deltas on a trackpad',
    tag: 'input',
    points: 2,
    detail: 'Pixel deltas already carry inertia; discrete ticks do not.'
  },
  {
    id: 't4',
    title: 'Sticky header offsets',
    tag: 'layout',
    points: 3,
    detail: 'The header moves with the scroller and stops at the top of its own box.'
  },
  {
    id: 't5',
    title: 'Glyph atlas eviction',
    tag: 'render',
    points: 8,
    detail: 'Least recently drawn, per size and weight, with the raster kept until the frame ends.'
  },
  {
    id: 't6',
    title: 'IME composition ordering',
    tag: 'input',
    points: 5,
    detail: 'Composition text is not input; the buffer only sees the commit.'
  },
  {
    id: 't7',
    title: 'Relayout boundaries',
    tag: 'layout',
    points: 5,
    detail: 'A node whose size cannot change its parent starts its own layout pass.'
  }
];

const TASKS_BY_ID = new Map(TASKS.map(task => [task.id, task]));

export type LaneOrder = Readonly<Record<Lane, readonly string[]>>;

const INITIAL_ORDER: LaneOrder = {
  todo: ['t1', 't4', 't7'],
  doing: ['t2', 't6'],
  done: ['t3', 't5']
};

/** How the board moves. The picker changes this; every card reads it. */
export type MotionName = UiSpringToken | 'tween';
export const MOTIONS: readonly MotionName[] = ['gentle', 'snappy', 'stiff', 'tween'];

/** What a card's `animateLayout` is given, for a chosen motion. */
export function layoutMotion(motion: MotionName): { spring?: UiSpringToken; duration?: number } {
  return motion === 'tween' ? { duration: 420 } : { spring: motion };
}

/** The move that can be taken back. */
export interface UndoEntry {
  readonly id: string;
  readonly lane: Lane;
  readonly index: number;
  readonly label: string;
}

export interface BoardView {
  readonly order: LaneOrder;
  readonly selected: string | null;
  readonly undo: UndoEntry | null;
  readonly motion: MotionName;
}

/** Where a task currently is, or null when the board does not hold it. */
export function locate(order: LaneOrder, id: string): { lane: Lane; index: number } | null {
  for (const lane of LANES) {
    const index = order[lane].indexOf(id);
    if (index !== -1) {
      return { lane, index };
    }
  }
  return null;
}

/** Takes a task out of wherever it is and puts it back at `lane`/`index`. */
export function place(order: LaneOrder, id: string, lane: Lane, index: number): LaneOrder {
  const next: Record<Lane, string[]> = {
    todo: [...order.todo],
    doing: [...order.doing],
    done: [...order.done]
  };
  for (const key of LANES) {
    const at = next[key].indexOf(id);
    if (at !== -1) {
      next[key].splice(at, 1);
    }
  }
  next[lane].splice(Math.max(0, Math.min(index, next[lane].length)), 0, id);
  return next;
}

/**
 * The board application: lanes, what is picked, and one step of undo.
 *
 * Genuine application state — it outlives any one view and another
 * screen could reasonably care — so it lives behind the barrier rather
 * than beside the components that draw it.
 */
export class BoardModel {
  readonly order = internalState<LaneOrder>(INITIAL_ORDER);
  readonly selected = internalState<string | null>(null);
  readonly undo = internalState<UndoEntry | null>(null);
  readonly motion = internalState<MotionName>('snappy');

  readonly board: Observable<BoardView> = combineLatest([this.order, this.selected, this.undo, this.motion]).pipe(
    map(([order, selected, undo, motion]) => ({ order, selected, undo, motion }))
  );

  /** Moves a card one lane left or right, keeping its row where it can. */
  shift(payload: { id: string; delta: number }): void {
    const from = locate(this.order.value, payload.id);
    if (from === null) {
      return;
    }
    const lane = LANES[LANES.indexOf(from.lane) + payload.delta];
    if (lane === undefined) {
      return;
    }
    this.record(payload.id, from.lane, from.index, `moved to ${LANE_TITLES[lane]}`);
    this.order.value = place(this.order.value, payload.id, lane, from.index);
  }

  /** Moves a card up or down within its own lane. */
  reorder(payload: { id: string; delta: number }): void {
    const from = locate(this.order.value, payload.id);
    if (from === null) {
      return;
    }
    const index = from.index + payload.delta;
    if (index < 0 || index >= this.order.value[from.lane].length) {
      return;
    }
    this.record(payload.id, from.lane, from.index, 'reordered');
    this.order.value = place(this.order.value, payload.id, from.lane, index);
  }

  /**
   * One card open at a time: two expanded cards is a list, not a
   * detail. Named `toggleCard` rather than `select` because `select`
   * is `Store`'s own — it is how a component reads a slice.
   */
  toggleCard(id: string): void {
    this.selected.value = this.selected.value === id ? null : id;
  }

  /** Deals every card into a lane at random. Every card moves at once. */
  shuffle(): void {
    const ids = TASKS.map(task => task.id).sort(() => Math.random() - 0.5);
    let order: LaneOrder = { todo: [], doing: [], done: [] };
    for (const [at, id] of ids.entries()) {
      const lane = LANES[at % LANES.length];
      order = place(order, id, lane, order[lane].length);
    }
    this.undo.value = null;
    this.order.value = order;
  }
  undoMove(): void {
    const entry = this.undo.value;
    if (entry === null) {
      return;
    }
    this.undo.value = null;
    this.order.value = place(this.order.value, entry.id, entry.lane, entry.index);
  }

  /** Called when the bar has finished sliding out, not when it is asked to. */
  clearUndo(): void {
    this.undo.value = null;
  }
  setMotion(motion: MotionName): void {
    this.motion.value = motion;
  }

  private record(id: string, lane: Lane, index: number, label: string): void {
    this.undo.value = { id, lane, index, label: `${TASKS_BY_ID.get(id)?.title ?? id} — ${label}` };
  }
}

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------

/** The standard palette plus one colour per tag. */
interface BoardColors extends UiColors {
  readonly layout: UiColor;
  readonly render: UiColor;
  readonly input: UiColor;
  readonly surfaceRaised: UiColor;
}

/*
 * The shared Gesso ramp, plus one colour per tag. The board's surfaces
 * are raised a step above the shared background so a card reads as a
 * card; the tag colours are the two warm and green brand-adjacent
 * hues plus one drifted off ultramarine, so three tags stay apart
 * without any of them going neon.
 */
const boardColors: BoardColors = {
  ...gessoColors,
  surface: parseColor(SURFACE)!,
  surfaceRaised: parseColor(SURFACE_RAISED)!,
  border: parseColor(BORDER)!,
  layout: parseColor(LINEN)!,
  render: parseColor(POSITIVE)!,
  input: parseColor('#a98cd0')!
};

const boardTheme: UiTheme = { ...gessoTheme, colors: boardColors };

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** A small pill button. Nothing here animates; the board it moves does. */
function Chip(inputs: Inputs<{ label: string; onPress: () => void; wide?: boolean; on?: boolean }>) {
  const background = inputs.on.pipe(map(on => (on === true ? 'primary' : 'surfaceRaised')));
  const color = inputs.on.pipe(map(on => (on === true ? 'background' : 'textMuted')));
  return (
    <button
      onClick={() => inputs.onPress.value()}
      height={24}
      paddingLeft={inputs.wide.pipe(map(wide => (wide === true ? 12 : 8)))}
      paddingRight={inputs.wide.pipe(map(wide => (wide === true ? 12 : 8)))}
      borderRadius={12}
      backgroundColor={background}
      x="center"
      y="center"
      cursor="pointer">
      <text color={color} fontSize={12} fontWeight={500}>
        {inputs.label}
      </text>
    </button>
  );
}

const CARD_COLLAPSED = 58;
const CARD_EXPANDED = 116;

/**
 * One task.
 *
 * Three animations meet on this node and none of them knows about the
 * others, which is the point:
 *
 *   - `animateLayout` writes a relative `left`/`top` offset when
 *     layout moves the card, and springs it to zero.
 *   - `transition` turns the `height` and `opacity` props below into
 *     movements — the card's own body does not start them, and the
 *     value written is the same value it would have jumped to.
 *   - `press` is a spring on a cell this component owns, driving
 *     `transform`, which is neither layout nor paint state and so
 *     costs nothing but a repaint.
 *
 * `transform`'s `x` and `y` are the **pivot**, not a translation, so
 * half the card's size each is what scales it about its middle.
 */
function TaskCard(
  inputs: Inputs<{ task: Task; selected: boolean; motion: MotionName; lane: Lane }>,
  ctx: ComponentContext
) {
  const board = ctx.channel(Board);
  const animations = ctx.inject(AnimationService);
  const task = inputs.task.value;
  const laneIndex = LANES.indexOf(inputs.lane.value);

  /** 1 at rest, 0.96 while held. A number, because a spring integrates one. */
  const press = internalState(1);
  const springPress = (to: number): void => {
    animations.spring(press, to, { spring: 'stiff' });
  };

  const height = inputs.selected.pipe(map(on => (on ? CARD_EXPANDED : CARD_COLLAPSED)));

  return (
    <column
      // The modifier list is static per element; its arguments are read
      // when it attaches, which is why the picker's choice is part of
      // the observable that produces these cards.
      modifiers={[animateLayout(layoutMotion(inputs.motion.value))]}
      transition={{ height: spring('gentle'), opacity: 160 }}
      height={height}
      transform={press.pipe(map(scale => ({ x: 128, y: CARD_COLLAPSED / 2, scaleX: scale, scaleY: scale })))}
      padding={10}
      gap={6}
      overflow="hidden"
      backgroundColor="surfaceRaised"
      borderColor={inputs.selected.pipe(map(on => (on ? 'primary' : 'border')))}
      borderWidth={1}
      borderRadius={8}
      cursor="pointer"
      onClick={() => board.send.toggleCard(task.id)}
      onPointerDown={() => springPress(0.96)}
      onPointerUp={() => springPress(1)}
      onPointerLeave={() => springPress(1)}>
      <row gap={8} y="center">
        <box width={6} height={6} borderRadius={3} backgroundColor={task.tag} flexShrink={0} />
        <text color="text" fontSize={13} flexGrow={1} textWrap="none" textOverflow="ellipsis">
          {task.title}
        </text>
        <text color="textMuted" fontSize={11}>
          {`${task.points}`}
        </text>
      </row>

      {/* Bound, not conditional: the node is always here and its opacity
          travels, so there is nothing to add to or remove from the tree. */}
      <text color="textMuted" fontSize={11} opacity={inputs.selected.pipe(map(on => (on ? 1 : 0)))} maxLines={2}>
        {task.detail}
      </text>

      <box flexGrow={1} />

      <row gap={6} opacity={inputs.selected.pipe(map(on => (on ? 1 : 0)))} y="center">
        <Chip label="◀" onPress={() => board.send.shift({ id: task.id, delta: -1 })} />
        <Chip label="▲" onPress={() => board.send.reorder({ id: task.id, delta: -1 })} />
        <Chip label="▼" onPress={() => board.send.reorder({ id: task.id, delta: 1 })} />
        <Chip label="▶" onPress={() => board.send.shift({ id: task.id, delta: 1 })} />
        <text color="textMuted" fontSize={10} flexGrow={1} textAlign="right">
          {LANE_TITLES[LANES[laneIndex]]}
        </text>
      </row>
    </column>
  );
}

/** One lane, and the keyed cards in it. */
function LaneColumn(inputs: Inputs<{ lane: Lane }>, ctx: ComponentContext) {
  const board = ctx.channel(Board);
  const lane = inputs.lane.value;
  const view = board.view.board;

  // Keyed children, so a card that moves is the *same node* moved. A
  // FLIP has nothing to animate from if the node it animates was
  // created this frame.
  const cards: Observable<UiChild[]> = view.pipe(
    map(state =>
      state.order[lane].flatMap(id => {
        const task = TASKS_BY_ID.get(id);
        return task === undefined
          ? []
          : [<TaskCard key={id} task={task} selected={state.selected === id} motion={state.motion} lane={lane} />];
      })
    )
  );

  const count = view.pipe(map(state => `${state.order[lane].length}`));

  return (
    <column
      width={276}
      padding={10}
      gap={8}
      backgroundColor="surface"
      borderColor="border"
      borderWidth={1}
      borderRadius={10}
      selfY="start">
      <row gap={8} y="center">
        <text color="text" fontSize={12} fontWeight={600} flexGrow={1}>
          {LANE_TITLES[lane]}
        </text>
        <text color="textMuted" fontSize={11}>
          {count}
        </text>
      </row>
      <column gap={8}>{cards}</column>
    </column>
  );
}

/**
 * The undo bar, and the answer to "how do I animate something out?".
 *
 * Its node is always in the tree; what changes is a cell driving its
 * `top` and `opacity`. Sliding out is an `animate()` whose returned
 * Observable completes when the movement is over, and *that* is when
 * the store is told to forget the move. Nothing in the framework keeps
 * a node that has logically left — `decisions/0029` says why — so an
 * app that wants an exit owns the node until the animation is done.
 */
function UndoBar(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const board = ctx.channel(Board);
  const animations = ctx.inject(AnimationService);
  const slide = internalState(0);
  let shown = false;

  ctx.onUnmount(() => animations.stop(slide));

  board.view.board.subscribe(view => {
    const wanted = view.undo !== null;
    if (wanted === shown) {
      return;
    }
    shown = wanted;
    if (wanted) {
      animations.animate(slide, 1, { duration: 'slow', easing: 'decelerate' });
      return;
    }
    animations.animate(slide, 0, { duration: 'fast', easing: 'accelerate' });
  });

  const dismiss = (): void => {
    // Slide out first, and let the store forget only once it is gone.
    shown = false;
    animations.animate(slide, 0, { duration: 'fast', easing: 'accelerate' }).subscribe({
      complete: () => board.send.clearUndo()
    });
  };

  const label = board.view.board.pipe(map(view => view.undo?.label ?? ''));

  return (
    <row
      position="absolute"
      left={0}
      right={0}
      bottom={slide.pipe(map(t => -48 + 64 * t))}
      x="center"
      visible={slide.pipe(map(t => t > 0.02))}
      opacity={slide}>
      <row
        gap={12}
        y="center"
        paddingLeft={14}
        paddingRight={10}
        height={38}
        borderRadius={19}
        backgroundColor="surfaceRaised"
        borderColor="border"
        borderWidth={1}>
        <text color="text" fontSize={12}>
          {label}
        </text>
        <Chip label="Undo" wide onPress={() => board.send.undoMove()} />
        <Chip label="Dismiss" wide onPress={dismiss} />
      </row>
    </row>
  );
}

/** The picker: how the board moves, and whether it moves at all. */
function MotionPanel(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const board = ctx.channel(Board);
  const animations = ctx.inject(AnimationService);
  const chosen = board.view.board.pipe(map(view => view.motion));

  return (
    <row gap={16} y="center" paddingLeft={4} paddingRight={4} flexWrap="wrap">
      <text color="textMuted" fontSize={11} fontWeight={600}>
        MOTION
      </text>
      {MOTIONS.map(motion => (
        <Chip
          key={motion}
          label={motion}
          wide
          on={chosen.pipe(map(current => current === motion))}
          onPress={() => board.send.setMotion(motion)}
        />
      ))}
      <box width={1} height={18} backgroundColor="border" />
      <Chip label="Shuffle" wide onPress={() => board.send.shuffle()} />
      <box flexGrow={1} />
      <Chip
        label="Reduced motion"
        wide
        on={animations.reducedMotion}
        onPress={() => animations.applyReducedMotion(!animations.reducedMotion.value)}
      />
      <text color="textMuted" fontSize={11} width={150} textWrap="none">
        {animations.reducedMotion.pipe(map(on => (on ? 'everything snaps' : 'the shell normally sets it')))}
      </text>
    </row>
  );
}

export function BoardApp(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const animations = ctx.inject(AnimationService);
  const hint = combineLatest([animations.reducedMotion]).pipe(
    map(([reduced]) =>
      reduced
        ? 'Reduced motion is on: the board still works, the end state is identical, and no animation frame is scheduled.'
        : 'Press a card to open it; the arrows move it. Watch `ticks` in the bar below fall back to 0.00 when the board settles.'
    )
  );

  return (
    <column theme={boardTheme} backgroundColor="background" padding={20} gap={14} flexGrow={1} position="relative">
      <column gap={4}>
        <text color="text" fontSize={20} fontWeight={600}>
          Sprint board
        </text>
        <text color="textMuted" fontSize={12}>
          {hint}
        </text>
      </column>

      <MotionPanel />

      <row gap={14} y="stretch">
        {LANES.map(lane => (
          <LaneColumn key={lane} lane={lane} />
        ))}
      </row>

      <UndoBar />
    </column>
  );
}
