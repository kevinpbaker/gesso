import { BehaviorSubject, combineLatest, map, type Observable } from 'rxjs';
import {
  type UiNodeRef,
  Button,
  Column,
  EditableText,
  Row,
  Text,
  type UiChild,
  type UiTextChangeEvent,
  type UiSemanticState
} from '@gesso/core';

import { input, type ComponentContext, type Inputs } from '@gesso/framework';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import { controlMessage } from './message';
import {
  CONTROL_FOCUS_RING,
  borderToken,
  foregroundToken,
  keymap,
  layoutOf,
  quantize,
  type ControlLayoutProps,
  modifiersOf
} from './internals';

/**
 * A number typed or stepped.
 *
 * The field holds text while it is being typed — a half-written
 * "-" or "1." is not a number yet — and reports a value only when the
 * text parses. Blurring normalises what is there, which is what stops
 * a field from being left holding "12abc".
 */
export interface NumberInputProps extends ControlLayoutProps {
  /** Receives the node that *is* the control, for focus and anchoring. */
  ref?: UiNodeRef;
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

export function NumberInput(inputs: Inputs<NumberInputProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const error = input(inputs.error, '');
  const disabled = input(inputs.disabled, false);
  const required = input(inputs.required, false);
  const min = input(inputs.min, Number.NEGATIVE_INFINITY);
  const max = input(inputs.max, Number.POSITIVE_INFINITY);
  const step = input(inputs.step, 1);
  const invalid = error.pipe(map(text => text.length > 0));
  const focus = trackFocus(ctx, inputs.ref);
  const value = controlled<number>({
    component: 'NumberInput',
    name: 'value',
    source: inputs.value,
    initial: inputs.defaultValue,
    fallback: 0,
    onChange: inputs.onChange
  });

  // What the field shows: the value, unless the user is mid-edit.
  const text = new BehaviorSubject(String(value.current()));
  value.value.subscribe(next => {
    if (Number(text.value) !== next) {
      text.next(String(next));
    }
  });

  const commit = (next: number): void => {
    if (disabled.value) {
      return;
    }
    const bounded = clamp(next, min.value, max.value, step.value);
    text.next(String(bounded));
    value.change(bounded);
  };
  const move = (by: number): void => commit(value.current() + by);

  const typed = (event: UiTextChangeEvent): void => {
    text.next(event.value);
    const parsed = Number(event.value);
    if (event.value.trim() !== '' && Number.isFinite(parsed)) {
      value.change(clamp(parsed, min.value, max.value, step.value));
    }
  };

  return Column(
    { ...layoutOf(inputs), gap: 4 },
    label.pipe(
      map(name =>
        name.length === 0
          ? []
          : [Text({ text: name, color: foregroundToken(disabled), fontSize: 12, selectable: false })]
      )
    ),
    Row(
      { gap: 4, y: 'center' },
      EditableText({
        ref: focus.ref,
        modifiers: modifiersOf(inputs, CONTROL_FOCUS_RING),
        value: text,
        disabled,
        textWrap: 'none',
        backgroundColor: 'controlBackground',
        color: 'controlForeground',
        borderWidth: 1,
        borderColor: borderToken(invalid),
        borderRadius: 6,
        padding: 8,
        minWidth: 80,
        flexGrow: 1,
        role: 'spinbutton',
        label,
        // The error when there is one, so somebody arriving at a field
        // already marked wrong hears why rather than only that it is.
        description: error,
        valueNow: value.value,
        valueMin: min,
        valueMax: max,
        states: states(invalid, required),
        onInput: typed,
        onBlur: () => commit(Number(text.value) || 0),
        onKeyDown: keymap({
          ArrowUp: () => move(step.value),
          ArrowDown: () => move(-step.value)
        })
      }),
      stepper('−', () => move(-step.value), disabled),
      stepper('+', () => move(step.value), disabled)
    ),
    controlMessage(error)
  );
}

/**
 * A step button. Not a tab stop: the field is, and its arrows do the
 * same thing — a screen reader user should not have to walk past two
 * buttons to leave a number field.
 */
function stepper(glyph: string, press: () => void, disabled: Observable<boolean>) {
  return Button({
    text: glyph,
    width: 28,
    height: 32,
    x: 'center',
    y: 'center',
    focusable: false,
    disabled,
    backgroundColor: 'controlBackground',
    color: 'controlForeground',
    borderWidth: 1,
    borderColor: 'controlBorder',
    borderRadius: 6,
    role: 'button',
    label: glyph === '+' ? 'Increase' : 'Decrease',
    onClick: press
  });
}

function clamp(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(min) && !Number.isFinite(max)) {
    return value;
  }
  const low = Number.isFinite(min) ? min : value;
  const high = Number.isFinite(max) ? max : value;
  return quantize(value, low, high, step);
}

function states(invalid: Observable<boolean>, required: Observable<boolean>): Observable<UiSemanticState[]> {
  return combineLatest([invalid, required]).pipe(
    map(([bad, must]) => {
      const result: UiSemanticState[] = [];
      if (bad) {
        result.push('invalid');
      }
      if (must) {
        result.push('required');
      }
      return result;
    })
  );
}
