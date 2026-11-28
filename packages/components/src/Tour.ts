import { combineLatest, map, of, switchMap, type Observable, type Subscription } from 'rxjs';

import {
  Box,
  Column,
  fade,
  motion,
  percent,
  Row,
  Text,
  UiEnvironmentKeys,
  type UiChild,
  type UiNode,
  type UiNodeRef
} from 'gesso-core';
import {
  AnimationService,
  createComponent,
  FocusService,
  InspectionService,
  input,
  internalState,
  themeTokenCell,
  type ComponentContext,
  type InternalState,
  type Inputs,
  type OverlayPlacement,
  type OverlayRect
} from 'gesso-framework';
import { Button } from './Button';
import { controlled } from './controlled';
import { keymap } from './internals';
import { useOverlay } from './overlay';
import { controlTokens } from './tokens';
import { orWord, wordsFor } from './messages';

/**
 * An element a tour can point at: give it `ref={target.ref}`, and name
 * the target in a step. A cell rather than a node, because a component
 * runs before the refs of what it draws are called.
 */
export interface TourTarget {
  readonly ref: UiNodeRef;
  /** The element, once it is drawn; null before and after. */
  readonly node: InternalState<UiNode | null>;
}

/** A target to point a tour's step at. */
export function tourTarget(): TourTarget {
  const node = internalState<UiNode | null>(null);
  return { node, ref: drawn => (node.value = drawn) };
}

/** One stop on a tour: what it points at, and what it says there. */
export interface TourStep {
  /** The element it shows. Without one, the card sits in the middle of the screen, over a plain dim. */
  readonly target?: TourTarget;
  readonly title: string;
  readonly body?: string;
  /** The side of the target the card opens on. Default `bottom`; `start` and `end` follow the reading direction. */
  readonly side?: 'bottom' | 'top' | 'start' | 'end';
  /** Room around this step's target, in place of the tour's `padding`: 0 for a bar at a window's edge, whose room would light what is beside it. */
  readonly padding?: number;
}

export interface TourProps {
  readonly steps?: readonly TourStep[];
  /**
   * The step shown, from 0, for an application that owns it; `null`
   * when the tour is not shown.
   */
  step?: number | null;
  /** The step it starts at, for a tour that owns its own. Default 0: shown from the start. */
  defaultStep?: number | null;
  /** Called with the step it asks to move to, and `null` when it is finished or closed. */
  onStepChange?: (step: number | null) => void;
  /** Room between the target and the edge of the lit hole around it, in pixels. Default 8. */
  padding?: number;
  /** The last step's button. Default "Done". */
  doneLabel?: string;
  /**
   * Whether the card keeps the keyboard. Default true: a walk through a
   * screen, read a step at a time, where the target can be pressed but
   * focus stays in the card.
   *
   * False is for a tutorial that has the person do each step: the card
   * takes the keyboard as a step opens, but the target can take it from
   * there, so a field in the hole can be typed in and a control that
   * opens something by taking focus opens it. Presses outside the hole
   * are still taken by the dim. Escape and the arrow keys work while the
   * card has the keyboard.
   *
   * A step whose target holds the place the person last worked in, the
   * field they typed in on the step before, gives the keyboard back to
   * that place instead of the card, so they carry on typing after Next
   * without a click.
   */
  modal?: boolean;
}

/** Far enough past any screen that the dim and the blockers reach every edge of it. */
const BEYOND = 10000;

/**
 * A guided walk through a screen, one element at a time: everything
 * but the element dims, and a card beside it says what it is, with
 * Back, Next and a count. Escape closes it, as do its ✕ (End tour) and
 * Done on the last step; the arrow keys step through it.
 *
 * The dim is a hole cut around the target, its corners rounded, that
 * follows the target through scrolling and layout as any anchored
 * overlay does. Presses on the dim are taken and do nothing, so the
 * page under it stays as the tour left it; the target itself, in the
 * hole, can still be pressed. A step with no target dims everything
 * and centres its card.
 *
 * Drawn inside an `OverlayScope`, as a design tool's player draws a
 * screen, the dim covers that screen and nothing else. On a settled
 * clock, a design tool's board, it is drawn at rest.
 */
export function Tour(inputs: Inputs<TourProps>, ctx: ComponentContext): UiChild {
  const padding = input(inputs.padding, 8);
  const say = wordsFor(ctx);
  const doneLabel = orWord(inputs.doneLabel, say('gesso.tour.done'));
  const modal = input(inputs.modal, true);
  const focus = ctx.inject(FocusService);
  const inspection = ctx.inject(InspectionService);
  const animations = ctx.inject(AnimationService);
  // Where it is drawn: a design tool's board settles the glide, its player may slow it.
  const clock = ctx.environment(UiEnvironmentKeys.clock);
  const hole = useOverlay(ctx, 'tour-dim');
  const card = useOverlay(ctx, 'tour-card');
  const tokens = themeTokenCell(controlTokens);
  const step = controlled<number | null>({
    component: 'Tour',
    name: 'step',
    source: inputs.step,
    initial: inputs.defaultStep,
    fallback: 0,
    onChange: inputs.onStepChange
  });

  let placeholder: UiNode | null = null;
  /** The card's node while focus is kept in it. */
  let trapped: UiNode | null = null;
  /** The card's node, while it is drawn. The overlay keeps the same node from step to step. */
  let cardNode: UiNode | null = null;
  /** The step a tour that is not modal last gave the keyboard for, so it is given once a step. */
  let given: object | null = null;
  /** Where the keyboard last was outside the card, for a tour that is not modal: where the person works. */
  let working: UiNode | null = null;
  ctx.effect(focus.focused, node => {
    if (node !== null && !modal.value && (cardNode === null || !within(node, cardNode))) working = node;
  });
  const release = (): void => {
    if (trapped !== null) {
      const scope = trapped;
      trapped = null;
      focus.releaseTrap(scope);
    }
  };

  const steps = (): readonly TourStep[] => inputs.steps.value ?? [];
  const go = (to: number | null): void => step.change(to === null || to < 0 || to >= steps().length ? null : to);

  /** The step shown, with its target's node: null for none shown, undefined for a step that has no target. */
  const shown: Observable<{ at: number; node: UiNode | null | undefined } | null> = combineLatest([
    inputs.steps,
    step.value
  ]).pipe(
    switchMap(([all, at]) => {
      const current = at === null ? undefined : all?.[at];
      if (at === null || current === undefined) {
        return of(null);
      }
      return current.target === undefined
        ? of({ at, node: undefined })
        : current.target.node.pipe(map(node => ({ at, node })));
    })
  );

  const cardFor = (at: number): UiChild => {
    const all = steps();
    const current = all[at]!;
    const last = at === all.length - 1;
    /** This step, as the card shows it: the card's node is the same from step to step. */
    const opened = {};
    const mine = (node: UiNode | null): void => {
      if (node === null) {
        cardNode = null;
        return;
      }
      cardNode = node;
      if (trapped === node || given === opened) {
        return;
      }
      if (modal.value) {
        release();
        trapped = node;
        focus.trap(node);
      } else {
        // The keyboard to the card as the step opens, free to go to the target from there; or back to where the
        // person was working, if that is in the step's target. On the next turn: a ref fires before the overlay
        // holding the card is in the tree, where focus would be refused.
        given = opened;
        const target = current.target?.node.value ?? null;
        setTimeout(() => {
          if (given !== opened || cardNode !== node) return;
          const place = working;
          if (place !== null && target !== null && within(place, target)) {
            focus.focus(place, { preventScroll: true });
            if (focus.focused.value === place) return;
          }
          focus.focus(node, { preventScroll: true });
        }, 0);
      }
    };
    return Column(
      {
        ref: mine,
        width: 280,
        maxWidth: percent(100),
        gap: 8,
        padding: 16,
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: tokens.select(t => t.radius.sheet),
        boxShadows: 'large',
        role: 'dialog',
        label: current.title,
        description: current.body ?? '',
        // The card's home for the keyboard, as a dialog's is, without a
        // stop of its own in the Tab cycle.
        focusable: true,
        tabStop: false,
        onKeyDown: keymap({
          Escape: () => go(null),
          ArrowRight: () => go(last ? null : at + 1),
          ArrowLeft: () => go(Math.max(0, at - 1))
        }),
        modifiers: [motion({ initial: fade, duration: 'fast', easing: 'decelerate' })]
      },
      Row(
        { y: 'start', gap: 8 },
        Text({ text: current.title, textStyle: 'title', color: 'text', flex: 1, minWidth: 0 }),
        // The pointer's way out at any step, beside Escape for the keyboard.
        createComponent(Button, {
          label: say('gesso.tour.end'),
          variant: 'plain',
          size: 'small',
          onClick: () => go(null),
          children: Text({ text: '✕', color: 'textMuted', fontSize: 14 })
        })
      ),
      ...(current.body === undefined ? [] : [Text({ text: current.body, textStyle: 'body', color: 'textMuted' })]),
      Row(
        { y: 'center', gap: 8, paddingTop: 4 },
        Text({
          text: say('gesso.stepOf', { step: at + 1, count: all.length }),
          textStyle: 'bodySmall',
          color: 'textMuted',
          flex: 1
        }),
        ...(at === 0
          ? []
          : [
              createComponent(Button, {
                label: say('gesso.tour.back'),
                size: 'small',
                variant: 'plain',
                onClick: () => go(at - 1)
              })
            ]),
        doneLabel.pipe(
          map(done =>
            createComponent(Button, {
              label: last ? done : say('gesso.tour.next'),
              size: 'small',
              variant: 'filled',
              onClick: () => go(last ? null : at + 1)
            })
          )
        )
      )
    );
  };

  /**
   * The dim with its hole, laid over the target: a rounded box whose
   * shadow is the dim, and around it four boxes reaching past the
   * screen that take the presses the dim would let through.
   */
  const dim = (): UiChild => {
    const blocker = (edges: Record<string, number>) =>
      Box({ position: 'absolute', ...edges, onPointerDown: () => {}, onWheel: () => {} });
    return Box(
      { position: 'relative', width: percent(100), height: percent(100), hitTestable: false },
      Box({
        width: percent(100),
        height: percent(100),
        borderRadius: tokens.select(t => t.radius.sheet),
        boxShadows: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadRadius: BEYOND, color: 'scrim' }],
        hitTestable: false,
        modifiers: [motion({ initial: fade, duration: 'slow', easing: 'decelerate' })]
      }),
      blocker({ left: -BEYOND, top: -BEYOND, width: 2 * BEYOND, height: BEYOND }),
      blocker({ left: -BEYOND, bottom: -BEYOND, width: 2 * BEYOND, height: BEYOND }),
      blocker({ left: -BEYOND, top: 0, bottom: 0, width: BEYOND }),
      blocker({ right: -BEYOND, top: 0, bottom: 0, width: BEYOND })
    );
  };

  /**
   * The dim while the tour is open: made once when it opens and moved
   * from step to step, never made again, so it does not fade out and in
   * between steps.
   */
  let shownDim: UiChild | null = null;
  /**
   * Where the hole is: over a target, or shrunk to a point (null for the
   * middle of what the tour is drawn in, where it opens on a step with no
   * target); and the
   * glide moving it, if one is. Measured only when a step changes, by
   * which time the tree has been laid out.
   */
  let holeIs: { readonly over: UiNode } | { readonly point: OverlayRect | null } | null = null;
  let glide: { readonly from: OverlayRect; readonly to: OverlayRect; readonly progress: InternalState<number> } | null =
    null;
  /** The room around the hole for the step shown: its own, or the tour's. */
  let gapNow = padding.value;
  const grownBox = (node: UiNode): OverlayRect => {
    const box = inspection.box(node);
    const gap = gapNow;
    return { x: box.x - gap, y: box.y - gap, width: box.width + 2 * gap, height: box.height + 2 * gap };
  };
  const pointAt = (rect: OverlayRect): OverlayRect => ({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    width: 0,
    height: 0
  });
  /** The hole as it is drawn now, in the tree's coordinates and grown by the padding. */
  const holeNow = (): OverlayRect | null => {
    if (glide !== null) {
      return between(glide.from, glide.to, glide.progress.getValue());
    }
    if (holeIs === null) {
      return null;
    }
    // A tour that opened on a step with no target is in the middle of what it is drawn in.
    return 'over' in holeIs
      ? grownBox(holeIs.over)
      : (holeIs.point ?? pointAt(inspection.box(placeholder!.parent ?? placeholder!)));
  };

  /**
   * The hole's part of its anchor while it glides from `from` to `to`:
   * the hole stays anchored, and so follows its anchor through a scroll,
   * while it moves. Undefined once there for a target, which is then the
   * whole of it, as it changes size.
   */
  const gliding = (
    anchor: UiNode,
    from: OverlayRect,
    to: OverlayRect,
    whole: boolean
  ): Observable<OverlayRect | undefined> => {
    const gap = gapNow;
    const base = inspection.box(anchor);
    const part = (hole: OverlayRect): OverlayRect => ({
      x: hole.x + gap - base.x,
      y: hole.y + gap - base.y,
      width: hole.width - 2 * gap,
      height: hole.height - 2 * gap
    });
    const progress = internalState(0);
    const mine = { from, to, progress };
    glide = mine;
    animations.animate(progress as unknown as { value: number }, 1, { duration: 'normal', easing: 'standard', clock });
    return progress.pipe(
      map(t => {
        if (t >= 1 && glide === mine) {
          glide = null;
        }
        return t >= 1 && whole ? undefined : part(between(from, to, t));
      })
    );
  };

  const show = (next: { at: number; node: UiNode | null | undefined } | null): void => {
    if (next === null || next.node === null) {
      // Closed, or its target not drawn yet: nothing over the page until it is.
      card.hide();
      hole.hide();
      shownDim = null;
      holeIs = null;
      glide = null;
      release();
      return;
    }
    const was = shownDim === null ? null : holeNow();
    shownDim ??= dim();
    const current = steps()[next.at]!;
    gapNow = current.padding ?? padding.value;
    const gap = gapNow;
    if (next.node === undefined) {
      // No target: the same dim, its hole shrunk to a point in the middle
      // of where it was, and the card in the middle.
      const point = was === null ? null : pointAt(was);
      holeIs = { point };
      hole.show(shownDim, {
        anchor: placeholder,
        anchorRect:
          was === null || point === null
            ? { x: gap, y: gap, width: -2 * gap, height: -2 * gap }
            : gliding(placeholder!, was, point, false),
        placement: 'over',
        offset: gap,
        environment: placeholder
      });
      card.show(cardFor(next.at), { center: 'both', environment: placeholder });
      return;
    }
    holeIs = { over: next.node };
    hole.show(shownDim, {
      anchor: next.node,
      anchorRect: was === null ? undefined : gliding(next.node, was, grownBox(next.node), true),
      placement: 'over',
      offset: gap,
      environment: placeholder
    });
    card.show(cardFor(next.at), {
      anchor: next.node,
      placement: (current.side ?? 'bottom') as OverlayPlacement,
      offset: gap + 8,
      environment: placeholder
    });
  };

  // Opened once mounted, as a dialog is, so the overlay inherits the
  // theme from the placeholder rather than the default palette.
  let following: Subscription | null = null;
  ctx.onMount(() => {
    following = shown.subscribe(show);
  });
  ctx.onUnmount(() => {
    following?.unsubscribe();
    release();
  });

  return Box({ position: 'absolute', width: 0, height: 0, ref: node => (placeholder = node) });
}

/** Whether `node` is `ancestor` or under it, in the tree as it is now: false for a node taken out of it. */
function within(node: UiNode, ancestor: UiNode): boolean {
  for (let at: UiNode | null = node; at !== null; at = at.parent) {
    if (at === ancestor) return true;
  }
  return false;
}

/** The rectangle a fraction `t` of the way from `a` to `b`. */
function between(a: OverlayRect, b: OverlayRect, t: number): OverlayRect {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t
  };
}
