import { BehaviorSubject, combineLatest, map, type Observable } from 'rxjs';
import {
  type UiNodeRef,
  Button,
  Column,
  EditableText,
  Row,
  Text,
  type UiChild,
  type UiKeyboardEvent,
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
  CONTROL_INTERACTION,
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
 * text parses to one the field could hold: inside the range and on a
 * step. Anything else waits for the field to be left, or for Enter,
 * which bound it and report the result. A field left blank or holding
 * "12abc" goes back to the value it had, rather than inventing one.
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
  /**
   * The label is the field's name and is not drawn above it: for a field
   * whose heading and place already say what it is, as `TextInput`'s
   * and `Select`'s can be. It is still what a screen reader announces.
   */
  labelHidden?: boolean;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

export function NumberInput(inputs: Inputs<NumberInputProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const labelHidden = inputs.labelHidden?.value === true;
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
  const arrows = keymap({
    ArrowUp: () => move(step.value),
    ArrowDown: () => move(-step.value)
  });

  // A keystroke is not a decision. With a minimum of 10, the "1" on the
  // way to "15" is out of range, and clamping it there turned it into
  // "10" under the caret, so the next digit made "105". Text that is
  // not yet a value the field could hold stays as typed and is settled
  // on commit.
  const typed = (event: UiTextChangeEvent): void => {
    text.next(event.value);
    const parsed = parse(event.value);
    if (parsed !== undefined && clamp(parsed, min.value, max.value, step.value) === parsed) {
      value.change(parsed);
    }
  };
  // Leaving the field, or Enter, settles the text. What does not parse
  // goes back to the value the field had, unreported because nothing
  // changed: a number field has no empty value to report, and the 0 it
  // used to report is a number nobody typed, often not even in range.
  // `commit` writes the text itself as well as the value, because the
  // bounded value is often the one already held and would not move.
  const settle = (): void => {
    const parsed = parse(text.value);
    if (parsed === undefined) {
      text.next(String(value.current()));
    } else {
      commit(parsed);
    }
  };

  return Column(
    { ...layoutOf(inputs), gap: 4 },
    label.pipe(
      map(name =>
        name.length === 0 || labelHidden
          ? []
          : [Text({ text: name, color: foregroundToken(disabled), textStyle: 'bodySmall', selectable: false })]
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
        onBlur: settle,
        onKeyDown: (event: UiKeyboardEvent) => {
          // Settled and left to travel on: Enter in a form is also the
          // form's, and this should not take it.
          if (event.key === 'Enter') {
            settle();
            return;
          }
          arrows(event);
        }
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
  return Button(
    {
      width: 28,
      // As tall as the field: the row stretches it, so the two edges line up.
      selfY: 'stretch',
      // The field beside it grows and these do not shrink. Without this
      // a number field narrow enough to matter, which is what a form
      // puts one in, squeezes the two buttons into each other.
      flexShrink: 0,
      // The glyph a child rather than the button's `text`, which is drawn
      // from the top corner and ignores these: a − sat at the top left.
      x: 'center',
      y: 'center',
      disabled,
      modifiers: [CONTROL_INTERACTION],
      backgroundColor: 'controlBackground',
      color: 'controlForeground',
      borderWidth: 1,
      borderColor: 'controlBorder',
      borderRadius: tokens.select(t => t.radius.field),
      role: 'button',
      label: glyph === '+' ? 'Increase' : 'Decrease',
      onClick: press
    },
    // A size rather than a role: the − and + are the button's icon, sized
    // to its box, not words that should follow the theme's type scale.
    Text({ text: glyph, color: foregroundToken(disabled), fontSize: 14, selectable: false })
  );
}

/** The number some text is, or nothing for text that is not one, blank included. */
function parse(text: string): number | undefined {
  const parsed = Number(text);
  return text.trim() !== '' && Number.isFinite(parsed) ? parsed : undefined;
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
