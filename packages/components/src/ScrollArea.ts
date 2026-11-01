import { combineLatest, distinctUntilChanged, map, type Observable } from 'rxjs';
import {
  Box,
  Column,
  linearGradient,
  percent,
  ScrollView,
  scrollPosition,
  UiEnvironmentKeys,
  type UiChild,
  type UiColorValue,
  type UiGradient
} from 'gesso-core';

import {
  AnimationService,
  createComponent,
  input,
  internalState,
  type ComponentContext,
  type Inputs
} from 'gesso-framework';
import { Button } from './Button';
import { followedChildren, layoutOf, modifiersOf, type ControlLayoutProps } from './internals';

/**
 * A scrolling region that says where it is: a fade over the edge its
 * content runs past, and a way back to the top once it is far from it.
 *
 * The fades are what a person reads as "there is more": at the top
 * while it is scrolled down, at the bottom while more is below, each
 * easing in and out as the content reaches its edge. They blend into
 * the colour the area sits on (`fadeColor`), so they draw nothing over
 * a gap between items and only soften what passes under them.
 *
 * Padding pads the content, inside the scroll bar, as a padded scroller
 * does on the web: the area runs to the edges of what holds it, with its
 * bar at the edge, and its rows keep their distance from the sides. A
 * screen that pads itself instead puts the bar that far in.
 *
 * Back to top is opt-in: `backToTopAfter` is how far down it appears.
 * It is Gesso's small tonal button unless `backToTop` gives the design's
 * own drawing, which the area makes a button of. Pressed, the area
 * scrolls back smoothly on the clock where it is drawn (`UiClock`), so a
 * design tool's board shows it at rest and its player can slow it.
 */
export interface ScrollAreaProps extends ControlLayoutProps {
  children?: UiChild;
  /**
   * Where it is scrolled to, in pixels from the top: set where it starts,
   * and again whenever the value changes. The person's scrolling moves
   * it on from there. A design draws a moment of a list scrolled far
   * down with it.
   */
  scrollY?: number;
  /** Space around the content, inside the scroll bar, in pixels. Defaults to 0. */
  padding?: number;
  /** Space at the content's left and right, over `padding`. */
  paddingX?: number;
  /** Space at the content's top and bottom, over `padding`. */
  paddingY?: number;
  /** How tall a fade is, in pixels; 0 for none. Defaults to 24. */
  fade?: number;
  /** The colour the fades blend into: what the area sits on. Defaults to `background`. */
  fadeColor?: UiColorValue;
  /** Shows a back-to-top button once it is scrolled this far down, in pixels; none when not given. */
  backToTopAfter?: number;
  /** What the button is called, and what the default one says. Defaults to "Back to top". */
  backToTopLabel?: string;
  /** The design's own drawing of the button, made a button by the area. */
  backToTop?: UiChild;
}

/** Closer than this to an edge is at it: less than a pixel is the same pixel. */
const AT_EDGE = 1;

export function ScrollArea(inputs: Inputs<ScrollAreaProps>, ctx: ComponentContext): UiChild {
  const fade = input(inputs.fade, 24);
  const fadeColor = input(inputs.fadeColor, 'background' as UiColorValue);
  const label = input(inputs.backToTopLabel, 'Back to top');
  const animations = ctx.inject(AnimationService);
  // Where it is drawn: a design tool's board settles the scroll back, its player may slow it.
  const clock = ctx.environment(UiEnvironmentKeys.clock);
  const viewport = ctx.bounds('ScrollArea.viewport');
  const content = ctx.bounds('ScrollArea.content');
  /** The offset as laid out, from `scrollPosition`. */
  const offset = internalState(0);
  /** The offset written back, when the button scrolls to the top; the person's own scrolling writes the property itself. */
  const target = internalState<number | undefined>(undefined);

  const scrolledDown = offset.pipe(
    map(y => y > AT_EDGE),
    distinctUntilChanged()
  );
  const moreBelow = combineLatest([offset, viewport, content]).pipe(
    map(([y, port, inside]) => inside.height - port.height - y > AT_EDGE),
    distinctUntilChanged()
  );
  const farDown = combineLatest([offset, input(inputs.backToTopAfter, Number.POSITIVE_INFINITY)]).pipe(
    map(([y, after]) => y >= after),
    distinctUntilChanged()
  );

  ctx.effect(inputs.scrollY, y => {
    if (y !== undefined) {
      target.value = y;
    }
  });

  const toTop = (): void => {
    target.value = offset.value;
    animations.animate(target as unknown as { value: number }, 0, { duration: 'slow', easing: 'standard', clock });
  };

  const band = (edge: 'top' | 'bottom', shown: Observable<boolean>): UiChild =>
    Box({
      position: 'absolute',
      left: 0,
      right: 0,
      [edge]: 0,
      height: fade,
      visible: fade.pipe(map(height => height > 0)),
      backgroundGradient: fadeColor.pipe(map(color => gradientFor(edge, color))),
      opacity: shown.pipe(map(on => (on ? 1 : 0))),
      transition: { opacity: 'fast' },
      pointerEvents: 'none',
      hitTestable: false
    });

  return Box(
    { ...layoutOf(inputs), modifiers: modifiersOf(inputs), position: 'relative', overflow: 'hidden' },
    ScrollView(
      {
        width: percent(100),
        height: percent(100),
        scrollY: target.pipe(map(y => y ?? undefined)),
        modifiers: [viewport.modifier, scrollPosition({ onChange: at => (offset.value = at.y) })]
      },
      Column(
        {
          width: percent(100),
          modifiers: [content.modifier],
          ...paddingOf(inputs)
        },
        followedChildren(inputs.children, () => Column())
      )
    ),
    band('top', scrolledDown),
    band('bottom', moreBelow),
    inputs.backToTopAfter.pipe(
      map(after =>
        after === undefined
          ? []
          : [
              Box(
                {
                  key: 'backToTop',
                  position: 'absolute',
                  right: 16,
                  bottom: 16,
                  opacity: farDown.pipe(map(on => (on ? 1 : 0))),
                  pointerEvents: farDown.pipe(map(on => (on ? 'auto' : 'none'))),
                  transition: { opacity: 'fast' }
                },
                inputs.backToTop.pipe(
                  map(drawn =>
                    drawn === undefined
                      ? [createComponent(Button, { label, size: 'small', variant: 'tonal', onClick: toTop })]
                      : [Box({ role: 'button', label, focusable: true, cursor: 'pointer', onClick: toTop }, drawn)]
                  )
                )
              )
            ]
      )
    )
  );
}

/** A band of `color` at an edge, fading to the same colour at no opacity away from it. */
function gradientFor(edge: 'top' | 'bottom', color: UiColorValue): UiGradient {
  // CSS's compass: π runs top to bottom, 0 bottom to top; the solid end is at the edge.
  return linearGradient(edge === 'top' ? Math.PI : 0, [{ color }, { color, opacity: 0 }]);
}

/** The padding props given, passed on to the content as they were. */
function paddingOf(inputs: Inputs<ScrollAreaProps>): Record<string, unknown> {
  const passed: Record<string, unknown> = {};
  for (const name of ['padding', 'paddingX', 'paddingY'] as const) {
    if (inputs[name].value !== undefined) {
      passed[name] = inputs[name];
    }
  }
  return passed;
}
