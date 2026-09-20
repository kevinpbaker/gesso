import { BehaviorSubject, combineLatest, map, type Observable } from 'rxjs';
import {
  type UiNodeRef,
  Box,
  Column,
  Row,
  Text,
  type UiChild,
  type UiPointerEvent,
  type LayoutBox,
  percent,
  measure
} from 'gesso-core';

import { input, type ComponentContext, type Inputs } from 'gesso-framework';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import {
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  foregroundToken,
  keymap,
  layoutOf,
  quantize,
  type ControlLayoutProps,
  modifiersOf
} from './internals';

/**
 * A value chosen from a range.
 *
 * Keyboard-operable — arrows, page steps, Home and End — and draggable:
 * `measure` reports the track's box, so a pointer position inside it is
 * a fraction of the range. The drag was deferred in C3 for want of B2's
 * `host.layoutBox()` and retrofitted in C6 with the same shape
 * `SplitPane` uses.
 */
export interface SliderProps extends ControlLayoutProps {
  /** Receives the node that *is* the control, for focus and anchoring. */
  ref?: UiNodeRef;
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  disabled?: boolean;
  /** How the value should be spoken, when the number is not it ("40%"). */
  format?: (value: number) => string;
  /**
   * Draw the track alone, without the label and value above it. The
   * label still names the control for assistive technology. A media
   * player's seek bar and a volume slider want this; a form does not.
   */
  labelHidden?: boolean;
  /**
   * Where the track sits inside the control's hit area.
   *
   * `center` is right for a slider in a form, where the strip around
   * the track is slack on both sides. `start` is for one docked to an
   * edge: a media scrubber sits on the boundary between the picture
   * and the controls under it, and the rest of its strip is the part a
   * pointer is allowed to be imprecise about. Defaults to `center`.
   */
  trackAlign?: 'center' | 'start';
  /**
   * Draw a round handle at the filled end of the track.
   *
   * Off by default, because the track's fill already says where the
   * value is and a handle is a second thing to keep in step. It is on
   * for a media scrubber, where the value is something a person aims
   * at and drags rather than reads: a thumb is the affordance that
   * says so, and it is a bigger target than a six pixel line.
   */
  thumb?: boolean;
}

/**
 * The handle's diameter.
 *
 * Twice the track's height and then some, so it reads as something to
 * take hold of rather than a bump in the line. It overhangs the track
 * vertically, which is deliberate and is why nothing between here and
 * the control's own box may clip.
 */
const THUMB = 12;

export function Slider(inputs: Inputs<SliderProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const disabled = input(inputs.disabled, false);
  const min = input(inputs.min, 0);
  const max = input(inputs.max, 100);
  const step = input(inputs.step, 1);
  const focus = trackFocus(ctx, inputs.ref);
  const track = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
  const value = controlled<number>({
    component: 'Slider',
    name: 'value',
    source: inputs.value,
    initial: inputs.defaultValue,
    fallback: 0,
    onChange: inputs.onChange
  });

  const move = (by: number): void => {
    if (disabled.value) {
      return;
    }
    value.change(quantize(value.current() + by, min.value, max.value, step.value));
  };
  const to = (next: number): void => {
    if (!disabled.value) {
      value.change(quantize(next, min.value, max.value, step.value));
    }
  };
  const page = (): number => Math.max(step.value, (max.value - min.value) / 10);

  /** A pointer inside the track is a fraction of the range. */
  const toValue = (event: UiPointerEvent): number => {
    const box = track.value;
    if (box.width <= 0) {
      return value.current();
    }
    const fraction = Math.min(1, Math.max(0, (event.x - box.x) / box.width));
    return min.value + fraction * (max.value - min.value);
  };
  const seek = (event: UiPointerEvent): void => {
    event.stopPropagation();
    to(toValue(event));
  };

  const fraction = combineLatest([value.value, min, max]).pipe(
    map(([current, low, high]) => (high === low ? 0 : Math.min(1, Math.max(0, (current - low) / (high - low)))))
  );
  const spoken = combineLatest([value.value, inputs.format]).pipe(
    map(([current, format]) => (format === undefined ? String(current) : format(current)))
  );

  const labelHidden = input(inputs.labelHidden, false);

  return Column(
    {
      ...layoutOf(inputs),
      ref: focus.ref,
      focusable: true,
      disabled,
      modifiers: modifiersOf(inputs, CONTROL_FOCUS_RING),
      // No gap above a label that is not there. `visible` affects
      // paint and semantics but deliberately not layout, so hiding the
      // row leaves its height and this column's gap behind it: a
      // `labelHidden` slider would be a track with twenty empty pixels
      // over it, which is precisely wrong for the media bar the prop
      // was added for.
      gap: labelHidden.pipe(map(hidden => (hidden ? 0 : 6))),
      role: 'slider',
      label,
      valueNow: value.value,
      valueMin: min,
      valueMax: max,
      valueText: spoken,
      onKeyDown: keymap({
        ArrowRight: () => move(step.value),
        ArrowUp: () => move(step.value),
        ArrowLeft: () => move(-step.value),
        ArrowDown: () => move(-step.value),
        PageUp: () => move(page()),
        PageDown: () => move(-page()),
        Home: () => to(min.value),
        End: () => to(max.value)
      })
    },
    Row(
      {
        gap: 8,
        y: 'center',
        visible: labelHidden.pipe(map(hidden => !hidden)),
        // Collapsed rather than merely hidden; see the gap above.
        height: labelHidden.pipe(map(hidden => (hidden ? 0 : undefined))),
        overflow: 'hidden'
      },
      Text({ text: label, color: foregroundToken(disabled), fontSize: 12, selectable: false }),
      Text({ text: spoken, color: foregroundToken(disabled), fontSize: 12, selectable: false })
    ),
    // The filled part is a percentage of the track, so the thumb's
    // position is layout rather than an offset computed per frame.
    Box(
      {
        // The strip measures itself, so a pointer position means
        // something without anything reaching into the engine. The
        // track inside it is the full width, so the strip's box is the
        // range's box.
        modifiers: [CONTROL_INTERACTION, measure(track)],
        height: 20,
        y: input(inputs.trackAlign, 'center' as const),
        borderRadius: 4,
        // Pan, not Drag: a drag in this input model is a long press
        // followed by a move, and a thumb has to follow the pointer
        // from the first pixel. Stopping propagation keeps a scroll
        // container above from panning at the same time.
        onPanStart: seek,
        onPanMove: seek,
        onPointerDown: (event: UiPointerEvent) => {
          focus.focus();
          seek(event);
        }
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
        Box({
          height: 4,
          width: fraction.pipe(map(part => percent(part * 100))),
          borderRadius: 2,
          backgroundColor: fill(disabled)
        })
      ),
      // A second layer over the track rather than a child of the fill,
      // because the handle is four times the fill's height: inside it
      // the handle would either be clipped or stretch the track it is
      // supposed to sit on. The row is the track's own height and
      // position, so centring within it puts the handle on the line,
      // overhanging it evenly.
      ...(inputs.thumb.value !== true
        ? []
        : [
            Row(
              { width: percent(100), height: 6, y: 'center', hitTestable: false },
              // Measured from the same fraction the fill is, so the
              // two cannot disagree about where the value is.
              Box({ width: fraction.pipe(map(part => percent(part * 100))), height: 0 }),
              Box({
                width: THUMB,
                height: THUMB,
                borderRadius: THUMB / 2,
                // Half of it either side of the boundary, so the
                // handle is centred on the value rather than starting
                // at it.
                marginLeft: -THUMB / 2,
                backgroundColor: fill(disabled)
              })
            )
          ])
    )
  );
}

function fill(disabled: Observable<boolean>): Observable<string> {
  return disabled.pipe(map(off => (off ? 'controlForegroundDisabled' : 'controlAccent')));
}
