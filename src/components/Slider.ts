import { BehaviorSubject, combineLatest, map, type Observable } from 'rxjs';
import type { UiNodeRef } from '../ui/composition/UiElementProps';

import { input } from '../framework/Input';
import type { ComponentContext, Inputs } from '../framework/FunctionComponent';
import { Box, Column, Row, Text } from '../ui/composition/UiComponents';
import type { UiChild } from '../ui/composition/UiElement';
import { percent } from '../ui/layout/UiLength';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import {
  CONTROL_INTERACTION,
  borderToken,
  foregroundToken,
  keymap,
  layoutOf,
  quantize,
  type ControlLayoutProps
} from './internals';

/**
 * A value chosen from a range.
 *
 * **Keyboard-operable now; pointer drag waits on B2.** Dragging a thumb
 * means turning a pointer position into a fraction of the track, and a
 * component cannot ask where its own node is until
 * `MODIFIERS_ROADMAP.md` B2 adds `host.layoutBox()`. Everything else —
 * the arrows, the page steps, Home and End, the value semantics a
 * screen reader reads — works today, which is what this tier's exit
 * criterion asks for.
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
}

export function Slider(props: Inputs<SliderProps>, ctx: ComponentContext): UiChild {
  const label = input(props.label, '');
  const disabled = input(props.disabled, false);
  const min = input(props.min, 0);
  const max = input(props.max, 100);
  const step = input(props.step, 1);
  const focus = trackFocus(ctx, props.ref);
  const value = controlled<number>({
    component: 'Slider',
    name: 'value',
    source: props.value,
    initial: props.defaultValue,
    fallback: 0,
    onChange: props.onChange
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

  const fraction = combineLatest([value.value, min, max]).pipe(
    map(([current, low, high]) => (high === low ? 0 : Math.min(1, Math.max(0, (current - low) / (high - low)))))
  );
  const spoken = combineLatest([value.value, props.format]).pipe(
    map(([current, format]) => (format === undefined ? String(current) : format(current)))
  );

  return Column(
    {
      ...layoutOf(props),
      ref: focus.ref,
      focusable: true,
      disabled,
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
      { gap: 8, y: 'center' },
      Text({ text: label, color: foregroundToken(disabled), fontSize: 12, selectable: false }),
      Text({ text: spoken, color: foregroundToken(disabled), fontSize: 12, selectable: false })
    ),
    // The filled part is a percentage of the track, so the thumb's
    // position is layout rather than an offset computed per frame.
    Box(
      {
        height: 20,
        y: 'center',
        modifiers: [CONTROL_INTERACTION],
        borderRadius: 4,
        padding: 2
      },
      Box(
        {
          height: 6,
          width: percent(100),
          borderRadius: 3,
          borderWidth: 1,
          borderColor: borderToken(focus.focused, NEVER),
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

const NEVER: Observable<boolean> = new BehaviorSubject(false);

function fill(disabled: Observable<boolean>): Observable<string> {
  return disabled.pipe(map(off => (off ? 'controlForegroundDisabled' : 'controlAccent')));
}
