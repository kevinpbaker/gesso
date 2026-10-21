import { map, type Observable } from 'rxjs';
import { Box, Row, percent, resolveString, type BoxProps, type LayoutBox, type UiChild, type UiNode } from 'gesso-core';

import { quantize } from './internals';

/**
 * What `Slider` and `RangeSlider` have in common: the arithmetic that
 * turns a pointer or a key into a value and a value into a place on the
 * track, and the layer a thumb is laid out in.
 *
 * Internal, and deliberately not exported from the package. Each of the
 * two components used to carry its own copy, so a fix to one (the thumb
 * that sat short of the end of the fill, say, or the press that read
 * backwards right to left) had to be remembered and made again in the
 * other. With one copy it lands in both.
 */

/** The fill's colour: the accent, or the disabled foreground. */
export function trackFill(disabled: Observable<boolean>): Observable<string> {
  return disabled.pipe(map(off => (off ? 'controlForegroundDisabled' : 'controlAccent')));
}

/**
 * Whether a slider reads right to left, asked of one of its nodes at
 * the moment a key or a press arrives.
 *
 * The layout mirrors on its own under `textDirection: 'rtl'`, so the
 * fill and the thumbs grow from the right without anything here
 * knowing. What has to be told is the two things that turn a position
 * or a key into a value: without it a press near the right edge of a
 * track filled from the right read as nearly the maximum, and Right made
 * the fill longer by moving it left.
 */
export function readsRightToLeft(node: UiNode | null): boolean {
  return node !== null && resolveString(node, 'textDirection') === 'rtl';
}

/** `n`, held between `low` and `high`. */
export function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n));
}

/**
 * The value a pointer at `x` means, as a fraction of the range counted
 * from where the track starts, which right to left is its right edge.
 *
 * A pointer outside the track means the nearer end. Before the track
 * has been measured there is no answer, and the caller decides what
 * that means for it.
 */
export function valueAt(x: number, box: LayoutBox, rtl: boolean, min: number, max: number): number | null {
  if (box.width <= 0) {
    return null;
  }
  const along = clamp((x - box.x) / box.width, 0, 1);
  const fraction = rtl ? 1 - along : along;
  return min + fraction * (max - min);
}

/** How far along the track a value sits, from zero to one. An empty range puts everything at its start. */
export function fractionOf(value: number, min: number, max: number): number {
  return max === min ? 0 : clamp((value - min) / (max - min), 0, 1);
}

/**
 * A value snapped to the step and then held between `floor` and
 * `ceiling`, which default to the range.
 *
 * Snapping is counted from `min` across the whole range, so every thumb
 * on a track lands on the same grid. The bounds are applied after
 * snapping, so a step that would carry a thumb past another one stops
 * against it rather than being rounded past it.
 */
export function snap(value: number, min: number, max: number, step: number, floor = min, ceiling = max): number {
  return clamp(quantize(value, min, max, step), floor, ceiling);
}

/** What Page Up and Page Down move by: a tenth of the range, and never less than a step. */
export function pageStep(min: number, max: number, step: number): number {
  return Math.max(step, (max - min) / 10);
}

/**
 * A thumb, centred on `fraction` of the track, in a layer of its own
 * over it.
 *
 * A layer rather than a child of the fill, because a thumb is several
 * times the fill's height: inside it the thumb would either be clipped
 * or stretch the track it is supposed to sit on. The layer is the
 * track's own height and place, so centring in it puts the thumb on the
 * line, overhanging it evenly. A spacer as wide as the fraction is
 * followed by the thumb, pulled back by half its width so it is centred
 * on the value rather than starting at it. The start margin rather than
 * the left one, because right to left the value is on the spacer's left.
 *
 * Neither box may shrink. At the top of the range the spacer is the
 * whole row and the thumb's far half overhangs it, and a row out of
 * room shrinks its children to fit, which drew the thumb short of the
 * end of the fill.
 *
 * `props` is everything else the thumb is: its colour, and for a thumb
 * that is a control of its own, its ref, role and keys.
 */
export function thumbLayer(fraction: Observable<number>, diameter: number, props: BoxProps): UiChild {
  return Row(
    { width: percent(100), height: 6, y: 'center', hitTestable: false },
    Box({ width: fraction.pipe(map(part => percent(part * 100))), height: 0, flexShrink: 0 }),
    Box({
      ...props,
      width: diameter,
      height: diameter,
      flexShrink: 0,
      borderRadius: diameter / 2,
      marginStart: -diameter / 2
    })
  );
}
