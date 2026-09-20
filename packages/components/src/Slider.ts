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
}

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

  return Column(
    {
      ...layoutOf(inputs),
      ref: focus.ref,
      focusable: true,
      disabled,
      modifiers: modifiersOf(inputs, CONTROL_FOCUS_RING),
      gap: 6,
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
      { gap: 8, y: 'center', visible: input(inputs.labelHidden, false).pipe(map(hidden => !hidden)) },
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
        y: 'center',
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
      )
    )
  );
}

function fill(disabled: Observable<boolean>): Observable<string> {
  return disabled.pipe(map(off => (off ? 'controlForegroundDisabled' : 'controlAccent')));
}
