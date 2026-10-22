import { BehaviorSubject, combineLatest, map } from 'rxjs';
import {
  type UiNodeRef,
  Box,
  Column,
  Row,
  Text,
  type UiChild,
  type UiKeyboardEvent,
  type UiPointerEvent,
  type LayoutBox,
  percent,
  measure
} from 'gesso-core';

import { input, type ComponentContext, type Inputs } from 'gesso-framework';
import { controlled } from './controlled';
import { trackFocus, type ControlFocus } from './focus';
import {
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  foregroundToken,
  keymap,
  layoutOf,
  type ControlLayoutProps,
  modifiersOf
} from './internals';
import { clamp, fractionOf, pageStep, readsRightToLeft, snap, thumbLayer, trackFill, valueAt } from './sliderTrack';

/**
 * A span chosen from a range: a low value and a high one, each with a
 * thumb of its own.
 *
 * It is `Slider` twice over one track. Each thumb is its own tab stop
 * and its own `slider` to an assistive technology, because a person
 * moves one end of a price range at a time and has to be told which end
 * they are holding. The two never cross: a thumb pushed into the other
 * stops `minDistance` short of it, by the keyboard and by the pointer
 * alike, so a reported pair is always `[low, high]` with `low <= high`.
 */
export interface RangeSliderProps extends ControlLayoutProps {
  /**
   * Receives the node of the minimum thumb, the first tab stop, which
   * is what a form focuses when the field failed validation.
   */
  ref?: UiNodeRef;
  /**
   * The pair to show, low then high. Supplying it makes the slider
   * controlled. A pair given out of order, or outside the range, is
   * drawn sorted and clamped rather than drawn crossed.
   */
  value?: readonly [number, number];
  /** The pair to start at, for a slider that owns its own. Defaults to the whole range. */
  defaultValue?: readonly [number, number];
  /** Called with the new pair, already clamped, snapped and in order, whenever either end moves. */
  onChange?: (value: readonly [number, number]) => void;
  min?: number;
  max?: number;
  step?: number;
  /**
   * The least gap the two thumbs keep between them. Zero, the default,
   * lets them meet; a booking range that must be at least one night
   * long passes `1`.
   */
  minDistance?: number;
  /**
   * Names the whole control, and is the stem the two thumbs' names are
   * made from: "Price" names them "Minimum price" and "Maximum price".
   */
  label?: string;
  /**
   * The two thumbs' names, when the derived "Minimum ..." and
   * "Maximum ..." are wrong for the range: a date range's thumbs are
   * "Check in" and "Check out".
   */
  thumbLabels?: readonly [string, string];
  disabled?: boolean;
  /** How a value should be shown and spoken, when the number is not it ("$40"). */
  format?: (value: number) => string;
  /**
   * Draw the track alone, without the label and values above it. The
   * label still names the control and its thumbs for assistive
   * technology.
   */
  labelHidden?: boolean;
}

/**
 * The handles' diameter.
 *
 * A little larger than `Slider`'s optional thumb, because here the
 * thumbs are not optional: they are the only way to tell which end of
 * the span a press or a key will move, and when they meet one has to
 * stay visible round the other.
 */
const THUMB = 16;

/** Which end of the span a key or a drag is moving. */
type End = 'low' | 'high';

/**
 * What a press decided about which thumb to move.
 *
 * `pending` is a press exactly on two thumbs that sit together: either
 * could be meant, and only the direction of the drag that follows says
 * which. The value the press landed on is kept so that direction can be
 * read from it.
 */
type Grip = { readonly end: End } | { readonly end: 'pending'; readonly from: number };

export function RangeSlider(inputs: Inputs<RangeSliderProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const disabled = input(inputs.disabled, false);
  const min = input(inputs.min, 0);
  const max = input(inputs.max, 100);
  const step = input(inputs.step, 1);
  const minDistance = input(inputs.minDistance, 0);
  const labelHidden = input(inputs.labelHidden, false);
  // The forwarded ref goes to the minimum thumb, the first tab stop.
  const lowFocus = trackFocus(ctx, inputs.ref);
  const highFocus = trackFocus(ctx);
  const track = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
  const pair = controlled<readonly [number, number]>({
    component: 'RangeSlider',
    name: 'value',
    source: inputs.value,
    initial: inputs.defaultValue,
    fallback: [min.value, max.value],
    onChange: inputs.onChange
  });

  /**
   * The pair as it is drawn: in range and in order.
   *
   * A controlled value is whatever the application wrote, and an
   * application can write `[80, 20]` or `[-5, 500]`. Drawing that
   * literally would put the fill's start after its end, so the pair is
   * sorted and clamped here, once, and both the drawing and the next
   * key press start from the same tidy pair.
   */
  const tidy = (value: readonly [number, number], low: number, high: number): readonly [number, number] => {
    const a = clamp(value[0], low, high);
    const b = clamp(value[1], low, high);
    return a <= b ? [a, b] : [b, a];
  };
  const shown = combineLatest([pair.value, min, max]).pipe(map(([value, low, high]) => tidy(value, low, high)));
  const current = (): readonly [number, number] => tidy(pair.current(), min.value, max.value);

  /**
   * The values one end may take while the other stays where it is.
   *
   * The low thumb may go from `min` to `minDistance` short of the high
   * one, and the high thumb from `minDistance` past the low one to
   * `max`. These are also what each thumb announces as its own minimum
   * and maximum, so a screen reader's "50, minimum 0, maximum 70" is
   * the truth about how far that thumb can go.
   */
  const boundsOf = (end: End, [low, high]: readonly [number, number], gap: number): readonly [number, number] =>
    end === 'low' ? [min.value, Math.max(min.value, high - gap)] : [Math.min(max.value, low + gap), max.value];

  /**
   * Moves one end to a value, snapped to the step and held inside what
   * that end may reach, and reports the new pair if anything moved.
   *
   * `snap` counts the grid from `min` across the whole range, the same
   * grid `Slider` uses, so the two thumbs land on the same grid, and
   * applies the bounds after snapping: a step that would cross the
   * other thumb stops against it rather than being rounded past it.
   */
  const set = (end: End, next: number): void => {
    if (disabled.value) {
      return;
    }
    const now = current();
    const [floor, ceiling] = boundsOf(end, now, minDistance.value);
    const placed = snap(next, min.value, max.value, step.value, floor, ceiling);
    const result: readonly [number, number] = end === 'low' ? [placed, now[1]] : [now[0], placed];
    if (result[0] !== now[0] || result[1] !== now[1]) {
      pair.change(result);
    }
  };
  const valueOf = (end: End): number => current()[end === 'low' ? 0 : 1];
  const page = (): number => pageStep(min.value, max.value, step.value);

  /**
   * Whether the slider reads right to left, asked at the moment a key
   * or a press arrives, exactly as `Slider` asks it. Either thumb's
   * node will do, since they sit in the same subtree; the low one is
   * asked.
   */
  const rtl = (): boolean => readsRightToLeft(lowFocus.node() ?? highFocus.node());

  /** The keymap for one thumb. Every binding clamps through `set`, so none can cross the other thumb. */
  const keysFor = (end: End): ((event: UiKeyboardEvent) => void) => {
    const by = (delta: number) => () => set(end, valueOf(end) + delta);
    /** Right is more left to right, and less right to left. Up and Down never flip. */
    const across = (delta: number) => () => set(end, valueOf(end) + (rtl() ? -delta : delta));
    return keymap({
      ArrowRight: across(step.value),
      ArrowUp: by(step.value),
      ArrowLeft: across(-step.value),
      ArrowDown: by(-step.value),
      PageUp: () => set(end, valueOf(end) + page()),
      PageDown: () => set(end, valueOf(end) - page()),
      // As far as this thumb may go, which for the low thumb's End and
      // the high thumb's Home is the other thumb, less the gap.
      Home: () => set(end, boundsOf(end, current(), minDistance.value)[0]),
      End: () => set(end, boundsOf(end, current(), minDistance.value)[1])
    });
  };

  /** A pointer inside the track is a fraction of the range, from where the track starts. */
  const toValue = (event: UiPointerEvent): number | null => valueAt(event.x, track.value, rtl(), min.value, max.value);

  /**
   * Which thumb a press at `at` takes hold of: the nearer one.
   *
   * Two thumbs at the same distance are either sitting together, or
   * the press is exactly half way between them. Sitting together, a
   * press to one side of them can only mean the thumb on that side, and
   * a press on them means whichever way the drag then goes, so that is
   * left pending. Half way between distinct thumbs either is a fair
   * answer, and the low one is taken.
   */
  const gripAt = (at: number): Grip => {
    const [low, high] = current();
    const toLow = Math.abs(at - low);
    const toHigh = Math.abs(at - high);
    if (toLow < toHigh) {
      return { end: 'low' };
    }
    if (toHigh < toLow) {
      return { end: 'high' };
    }
    if (low !== high) {
      return { end: 'low' };
    }
    if (at < low) {
      return { end: 'low' };
    }
    if (at > high) {
      return { end: 'high' };
    }
    return { end: 'pending', from: at };
  };

  let grip: Grip | null = null;
  const focusOf = (end: End): ControlFocus => (end === 'low' ? lowFocus : highFocus);

  /**
   * Moves the gripped thumb to the pointer.
   *
   * A pending grip resolves here, on the first movement that leaves the
   * value it was pressed at: toward the bottom of the range takes the
   * low thumb, toward the top the high one. That is read in values
   * rather than pixels, so right to left a drag leftward, which is
   * toward the top there, takes the high thumb without anything here
   * having to know.
   */
  const follow = (event: UiPointerEvent): void => {
    event.stopPropagation();
    if (disabled.value) {
      return;
    }
    const at = toValue(event);
    if (at === null) {
      return;
    }
    // A local, because a narrowing of the closure's `grip` does not
    // survive the calls in between.
    let held = grip ?? gripAt(at);
    if (held.end === 'pending') {
      if (at === held.from) {
        grip = held;
        return;
      }
      held = { end: at < held.from ? 'low' : 'high' };
      focusOf(held.end).focus();
    }
    grip = held;
    set(held.end, at);
  };

  const press = (event: UiPointerEvent): void => {
    event.stopPropagation();
    if (disabled.value) {
      return;
    }
    const at = toValue(event);
    if (at === null) {
      return;
    }
    const held = gripAt(at);
    grip = held;
    // A pending grip focuses the low thumb for now, so the keyboard is
    // somewhere sensible even if no drag follows; the drag moves focus
    // to the high thumb if that turns out to be the one.
    focusOf(held.end === 'pending' ? 'low' : held.end).focus();
    if (held.end !== 'pending') {
      set(held.end, at);
    }
  };

  const fractions = combineLatest([shown, min, max]).pipe(
    map(([[low, high], bottom, top]): readonly [number, number] => [
      fractionOf(low, bottom, top),
      fractionOf(high, bottom, top)
    ])
  );
  const say = (n: number, format: ((value: number) => string) | undefined): string =>
    format === undefined ? String(n) : format(n);
  const spoken = combineLatest([shown, inputs.format]).pipe(
    map(([[low, high], format]) => `${say(low, format)} – ${say(high, format)}`)
  );
  const names = combineLatest([label, inputs.thumbLabels]).pipe(
    map(([stem, given]): readonly [string, string] => given ?? derivedNames(stem))
  );

  const thumb = (end: End): UiChild => {
    const index = end === 'low' ? 0 : 1;
    const focus = focusOf(end);
    const bounds = combineLatest([shown, minDistance, min, max]).pipe(map(([now, gap]) => boundsOf(end, now, gap)));
    // A layer of its own over the track, as `Slider` lays its thumb.
    return thumbLayer(fractions.pipe(map(parts => parts[index])), THUMB, {
      ref: focus.ref,
      // The track under it takes the press and decides which thumb
      // it meant, which is the nearer one and so almost always this
      // one; letting the thumb take it too would make the two thumbs
      // overlapping at one end a question of paint order.
      hitTestable: false,
      focusable: true,
      disabled,
      modifiers: [CONTROL_FOCUS_RING],
      // A ring in the track's own colour, so two thumbs sitting
      // together still read as two.
      borderWidth: 2,
      borderColor: 'controlBackground',
      backgroundColor: trackFill(disabled),
      role: 'slider',
      label: names.pipe(map(both => both[index])),
      valueNow: shown.pipe(map(now => now[index])),
      valueMin: bounds.pipe(map(range => range[0])),
      valueMax: bounds.pipe(map(range => range[1])),
      valueText: combineLatest([shown, inputs.format]).pipe(map(([now, format]) => say(now[index], format))),
      onKeyDown: keysFor(end)
    });
  };

  return Column(
    {
      ...layoutOf(inputs),
      modifiers: modifiersOf(inputs),
      // No gap above a label that is not there, for the reason
      // `Slider` gives: `visible` does not affect layout.
      gap: labelHidden.pipe(map(hidden => (hidden ? 0 : 6))),
      role: 'group',
      label,
      disabled
    },
    Row(
      {
        gap: 8,
        y: 'center',
        visible: labelHidden.pipe(map(hidden => !hidden)),
        height: labelHidden.pipe(map(hidden => (hidden ? 0 : undefined))),
        overflow: 'hidden'
      },
      Text({ text: label, color: foregroundToken(disabled), textStyle: 'bodySmall', selectable: false }),
      Text({ text: spoken, color: foregroundToken(disabled), textStyle: 'bodySmall', selectable: false })
    ),
    Box(
      {
        // The strip measures itself, so a pointer position is a
        // fraction of the range; it is the full width of the track.
        modifiers: [CONTROL_INTERACTION, measure(track)],
        height: 20,
        y: 'center',
        borderRadius: 4,
        // Pan rather than Drag, as in `Slider`: a thumb has to follow
        // the pointer from the first pixel, not after a long press. And
        // Drag too, as there, for a press held still before it moves.
        onPanStart: follow,
        onPanMove: follow,
        onDragStart: follow,
        onDragMove: follow,
        onPointerDown: press
      },
      Box(
        {
          height: 6,
          width: percent(100),
          borderRadius: 3,
          borderWidth: 1,
          borderColor: 'controlBorder',
          backgroundColor: 'controlBackground',
          x: 'start',
          y: 'center'
        },
        // The selected span: a spacer to the low value, then the fill
        // to the high one. Both are percentages of the track, so the
        // span is laid out rather than computed per frame, and mirrors
        // with the row right to left.
        Row(
          { width: percent(100), height: 4, hitTestable: false },
          Box({ width: fractions.pipe(map(([low]) => percent(low * 100))), height: 0 }),
          Box({
            height: 4,
            width: fractions.pipe(map(([low, high]) => percent((high - low) * 100))),
            borderRadius: 2,
            backgroundColor: trackFill(disabled)
          })
        )
      ),
      // The high thumb last, so it is drawn over the low one when the
      // two sit together at the top of the range, where it is the one
      // that can move.
      thumb('low'),
      thumb('high')
    )
  );
}

/**
 * "Minimum price" and "Maximum price" from "Price".
 *
 * The stem is lower-cased at its first letter so it reads as one
 * phrase, unless it starts with an abbreviation ("CPU load"), which
 * keeps its capitals. With no label at all the thumbs are still told
 * apart, as "Minimum" and "Maximum".
 */
function derivedNames(stem: string): readonly [string, string] {
  const trimmed = stem.trim();
  if (trimmed.length === 0) {
    return ['Minimum', 'Maximum'];
  }
  const phrase = /^[A-Z]{2}/.test(trimmed) ? trimmed : trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  return [`Minimum ${phrase}`, `Maximum ${phrase}`];
}
