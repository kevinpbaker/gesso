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
} from 'gesso-core';

import { input, themeTokenCell, type ComponentContext, type Inputs, type ThemeTokenCell } from 'gesso-framework';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import { controlTokens, type ControlTokens } from './tokens';
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
  const tokens = themeTokenCell(controlTokens);
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
        modifiers: modifiersOf(inputs, tokens.modifier, CONTROL_FOCUS_RING),
        value: text,
        disabled,
        textWrap: 'none',
        backgroundColor: 'controlBackground',
        color: 'controlForeground',
        borderWidth: 1,
        borderColor: borderToken(invalid),
        borderRadius: tokens.select(t => t.radius.field),
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
      stepper('−', () => move(-step.value), disabled, tokens),
      stepper('+', () => move(step.value), disabled, tokens)
    ),
    controlMessage(error)
  );
}

/**
 * A step button, and a tab stop like any other button.
 *
 * It was not one at first: the field's own arrows do the same thing,
 * and a screen reader user walking past two extra buttons to leave a
 * number field seemed a cost. The accessibility gate disagreed, and
 * it is right. A control that is in the tree and cannot be reached by
 * Tab is a promise the keyboard cannot keep, and a person who does not
 * know the arrows work has no other way to press it.
 */
function stepper(
  glyph: string,
  press: () => void,
  disabled: Observable<boolean>,
  tokens: ThemeTokenCell<ControlTokens>
) {
  return Button({
    text: glyph,
    width: 28,
    height: 32,
    // The field beside it grows and these do not shrink. Without this
    // a number field narrow enough to matter, which is what a form
    // puts one in, squeezes the two buttons into each other.
    flexShrink: 0,
    x: 'center',
    y: 'center',
    disabled,
    backgroundColor: 'controlBackground',
    color: 'controlForeground',
    borderWidth: 1,
    borderColor: 'controlBorder',
    borderRadius: tokens.select(t => t.radius.field),
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
