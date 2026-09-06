import { BehaviorSubject, type Observable } from 'rxjs';

import {
  Box,
  motion,
  percent,
  type MotionStateInput,
  type MotionTiming,
  type UiChild,
  type UiElement,
  type UiLength
} from '@gesso/core';
import type { ComponentContext, Inputs } from './FunctionComponent';

/**
 * Keeps a child on screen while it leaves.
 *
 * `ROADMAP.md` §F4 closed with one thing deliberately open: *"No exit
 * animation. A dialog still leaves on the frame it closes. An exit
 * needs the tree to keep a node that has logically left, which is a
 * component-lifetime question F4 does not settle."* This settles it,
 * and the answer is that the node is not kept — the **definition** is.
 *
 * **Why not in the reconciler.** The obvious move is to make
 * `UiGraphBuilder.removeSubtree` hold a node that wants to animate
 * out. It does not survive contact. The held node has no definition,
 * so every later reconcile has to be taught to look past it; its id is
 * still in the graph's index, so the same element returning collides
 * with it; and its component host must not be released, which means
 * the resolver has to learn about animation. That is three new
 * problems in the one part of the system whose correctness everything
 * else rests on, bought for one feature.
 *
 * Keeping the definition instead costs nothing anywhere else. This
 * component subscribes to a list of children, notices when one stops
 * appearing in it, and goes on rendering that one — as an ordinary
 * child, with an ordinary host — until its exit animation reports that
 * it is done. Then it stops, and the ordinary removal path runs,
 * unchanged and unaware that anything unusual happened. It is what
 * `AnimatePresence` does and what a Svelte `transition:` does, for
 * this reason.
 *
 * **It is a stack, and that is not incidental.** Each child is laid
 * out absolutely inside a positioned container, so a child on its way
 * out holds no space and the one arriving does not wait for it. That
 * is exactly what a screen transition wants — the two screens overlap
 * for as long as the transition lasts — and it is why this is the
 * right shape for a route outlet, a dialog and a toast, and the wrong
 * shape for a row leaving a list, where the neighbours must close the
 * gap behind it. A list wants `animateLayout` on the rows that stay.
 */
export interface PresenceProps {
  /**
   * The children, keyed. A child that stops appearing is animated out
   * rather than removed.
   *
   * Identity is the element's `key`. Without one a child is keyed by
   * its position, which for the single swapping child this is most
   * often used for is the same thing — but a list must key its
   * children, exactly as it must anywhere else in this framework.
   */
  children?: UiChild | readonly UiChild[];
  /** Where a child starts when it appears. Omitted means it just appears. */
  enter?: MotionStateInput;
  /**
   * Where a child goes as it leaves. Omitted means it just goes, on
   * the frame it stops being asked for, exactly as it did before this
   * component existed.
   *
   * An `enter` or `exit` that changes opacity dims everything inside
   * the child, including any `sharedElement` morphing across the
   * change — see `RouteTransition` for why the two do not compose and
   * what it looks like when you try.
   */
  exit?: MotionStateInput;
  /**
   * `together` (the default) — the arriving child enters while the
   * departing one leaves, and for a moment both are on screen. What a
   * shared-element transition needs, since the morph is measured off
   * the element that is still standing there.
   *
   * `wait` — the departing child finishes leaving before the arriving
   * one is built at all. Right when the two would read as clutter on
   * top of each other, and wrong whenever anything is shared.
   */
  mode?: 'together' | 'wait';
  /** How the enter and the exit are timed. One timing serves both. */
  timing?: MotionTiming;
  /** The container's size. Both default to filling whatever it is given. */
  width?: UiLength | number;
  height?: UiLength | number;
  /**
   * A ceiling on how long a child may take to leave, in milliseconds.
   *
   * Insurance rather than policy. An exit that never settles — a
   * spring given absurd numbers, an element unmounted before it ever
   * had a frame — would otherwise keep a whole screen mounted for
   * good, and a leak that looks like a rendering bug is the worst
   * kind. Two seconds by default, far longer than any exit anyone
   * should be writing.
   */
  exitTimeout?: number;
}

/** One child that is on screen: its definition, and whether it is going. */
interface PresenceEntry {
  readonly key: string;
  child: UiChild;
  leaving: boolean;
  /** Bumped when a child comes back before it finished leaving. */
  generation: number;
}

const DEFAULT_EXIT_TIMEOUT_MS = 2000;

export function Presence(inputs: Inputs<PresenceProps>, ctx: ComponentContext): UiChild {
  /** What is on screen: departing children first, so arrivals paint over them. */
  let entries: PresenceEntry[] = [];
  /** In `wait` mode, the children held back until the screen is clear. */
  let held: PresenceEntry[] | null = null;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const output = new BehaviorSubject<readonly UiChild[]>([]);
  let disposed = false;

  const clearTimer = (key: string): void => {
    const timer = timers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(key);
    }
  };

  const layerFor = (entry: PresenceEntry): UiChild =>
    Box(
      {
        key: entry.key,
        // A stack: every child fills the container and none of them
        // holds space from another. See the note on this component.
        position: 'absolute',
        left: 0,
        top: 0,
        width: percent(100),
        height: percent(100),
        // Each layer is its own top layer. A `lift`ed element inside a
        // child escapes whatever clips it within that child, and stops
        // there: without this it would be painted over every layer,
        // and a screen on its way out would fly its morphing artwork
        // across the screen arriving behind it. See the `liftBoundary`
        // property.
        liftBoundary: true,
        modifiers: [
          motion({
            ...inputs.timing.value,
            initial: inputs.enter.value,
            state: entry.leaving ? (inputs.exit.value ?? null) : null,
            onSettled: entry.leaving ? () => settle(entry) : undefined
          })
        ]
      },
      entry.child
    );

  const emit = (): void => {
    if (!disposed) {
      output.next(entries.map(layerFor));
    }
  };

  /** A child has finished leaving, so it may finally be dropped. */
  const settle = (entry: PresenceEntry): void => {
    const index = entries.indexOf(entry);
    if (!entry.leaving || index === -1) {
      return;
    }
    clearTimer(entry.key);
    entries.splice(index, 1);
    releaseHeld();
    emit();
  };

  /**
   * `wait` mode lets its arrivals in once the last departure is over,
   * which is the only moment they can be built without overlapping
   * what they replace.
   */
  const releaseHeld = (): void => {
    if (held === null || entries.some(entry => entry.leaving)) {
      return;
    }
    entries.push(...held);
    held = null;
  };

  const armTimeout = (entry: PresenceEntry): void => {
    clearTimer(entry.key);
    timers.set(
      entry.key,
      setTimeout(() => {
        timers.delete(entry.key);
        settle(entry);
      }, inputs.exitTimeout.value ?? DEFAULT_EXIT_TIMEOUT_MS)
    );
  };

  const apply = (children: UiChild | readonly UiChild[] | undefined): void => {
    const next = normalize(children);
    const wanted = new Set(next.map(child => child.key));
    // Anything still wanted is refreshed in place, so a child that came
    // back mid-exit keeps its node — and its scroll position, and its
    // component's state — rather than being rebuilt from nothing.
    const staying: PresenceEntry[] = [];
    for (const { key, child } of next) {
      const existing = entries.find(entry => entry.key === key) ?? held?.find(entry => entry.key === key);
      if (existing === undefined) {
        staying.push({ key, child, leaving: false, generation: 0 });
        continue;
      }
      if (existing.leaving) {
        clearTimer(key);
        existing.leaving = false;
        existing.generation++;
      }
      existing.child = child;
      staying.push(existing);
    }
    const hasExit = inputs.exit.value !== undefined;
    const leaving = hasExit ? entries.filter(entry => entry.leaving || !wanted.has(entry.key)) : [];
    for (const entry of leaving) {
      if (!entry.leaving) {
        entry.leaving = true;
        armTimeout(entry);
      }
    }
    for (const entry of entries) {
      if (!wanted.has(entry.key) && !leaving.includes(entry)) {
        clearTimer(entry.key);
      }
    }
    if (inputs.mode.value === 'wait' && leaving.length > 0) {
      entries = leaving;
      held = staying;
    } else {
      entries = [...leaving, ...staying];
      held = null;
    }
    emit();
  };

  const subscription = inputs.children.subscribe(children => apply(children));

  ctx.onUnmount(() => {
    disposed = true;
    subscription.unsubscribe();
    for (const key of timers.keys()) {
      clearTimer(key);
    }
    output.complete();
  });

  return Box(
    {
      // Positioned, because its children are: without this they would
      // resolve against whichever positioned ancestor happened to be
      // above, which is usually the whole screen.
      position: 'relative',
      width: inputs.width.value ?? percent(100),
      height: inputs.height.value ?? percent(100)
    },
    output as Observable<readonly UiChild[]>
  );
}

/** A child list flattened and keyed, with the empties dropped. */
function normalize(children: UiChild | readonly UiChild[] | undefined): readonly { key: string; child: UiChild }[] {
  if (children === undefined || children === null) {
    return [];
  }
  const list = Array.isArray(children) ? (children as readonly UiChild[]) : [children as UiChild];
  const keyed: { key: string; child: UiChild }[] = [];
  for (const [index, child] of list.entries()) {
    if (child === undefined || child === null) {
      continue;
    }
    keyed.push({ key: keyOf(child, index), child });
  }
  return keyed;
}

/**
 * A child's identity: its own `key` when it has one, its position
 * otherwise.
 *
 * Both shapes are read because both appear here — a plain element
 * carries its key in `props`, and a component element carries it
 * beside them.
 */
function keyOf(child: UiChild, index: number): string {
  const element = child as Partial<UiElement> & { key?: unknown };
  const declared = (element.props as { key?: unknown } | undefined)?.key ?? element.key;
  return declared === undefined || declared === null ? `#${index}` : String(declared);
}
