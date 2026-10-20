import { combineLatest, map, type Observable } from 'rxjs';
import {
  type UiNodeRef,
  Box,
  Column,
  resolveString,
  Row,
  Text,
  type UiChild,
  type UiElement,
  type UiSemanticState
} from 'gesso-core';

import { input, type ComponentContext, type Inputs } from 'gesso-framework';
import { controlled, type ControlledValue } from './controlled';
import { trackFocus } from './focus';
import { controlMessage } from './message';
import {
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  foregroundToken,
  keymap,
  layoutOf,
  type ControlLayoutProps,
  modifiersOf
} from './internals';

export interface RadioOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/**
 * One choice from a few.
 *
 * The group owns the value and renders the options, rather than each
 * radio finding its group: a component cannot read another component's
 * state, and a shared value passed down through props is the
 * framework's existing answer.
 *
 * **Keyboard.** The group is one tab stop and the arrows move the
 * choice — the "selection follows focus" listbox pattern, which ARIA
 * allows and which needs no per-option focus juggling. Values are
 * strings; a form that keys options by something else maps them at the
 * boundary, which is where the mapping belongs anyway.
 */
export interface RadioGroupProps extends ControlLayoutProps {
  /** Receives the node that *is* the control, for focus and anchoring. */
  ref?: UiNodeRef;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: readonly RadioOption[];
  label?: string;
  disabled?: boolean;
  /** Marks the group as failing validation; `error` implies it. */
  invalid?: boolean;
  /** What is wrong with the choice, shown under the options. */
  error?: string;
  required?: boolean;
  /**
   * How the options stack. Default `column`.
   *
   * **Read once, when the group renders**, as `SegmentedControl` reads
   * its `size`: a row and a column are different elements, and swapping
   * one for the other under a group that has focus would take the focus
   * with it. A group that has to change direction changes its `key`.
   */
  direction?: 'row' | 'column';
}

export function RadioGroup(inputs: Inputs<RadioGroupProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const disabled = input(inputs.disabled, false);
  const error = input(inputs.error, '');
  const invalid = combineLatest([input(inputs.invalid, false), error]).pipe(
    map(([marked, message]) => marked || message.length > 0)
  );
  const required = input(inputs.required, false);
  const direction = input(inputs.direction, 'column');
  const focus = trackFocus(ctx, inputs.ref);
  const value = controlled<string>({
    component: 'RadioGroup',
    name: 'value',
    source: inputs.value,
    initial: inputs.defaultValue,
    fallback: '',
    onChange: inputs.onChange
  });

  /** Moves the choice by `delta`, skipping options that are disabled. */
  const step = (delta: number): void => {
    if (disabled.value) {
      return;
    }
    const options = enabled();
    if (options.length === 0) {
      return;
    }
    const index = options.findIndex(option => option.value === value.current());
    const next =
      index === -1 ? (delta > 0 ? 0 : options.length - 1) : (index + delta + options.length) % options.length;
    value.change(options[next].value);
  };

  /**
   * Whether the group reads right to left, asked when a key arrives.
   *
   * A row of options lays out from the right under `textDirection:
   * 'rtl'`, so the next option is to the left of the chosen one and
   * Right has to mean the previous one, as it does in `Slider`. Up and
   * Down are not about reading direction and stay as they are.
   */
  const rtl = (): boolean => {
    const node = focus.node();
    return node !== null && resolveString(node, 'textDirection') === 'rtl';
  };

  const edge = (which: 'first' | 'last'): void => {
    const options = enabled();
    if (options.length > 0) {
      value.change(which === 'first' ? options[0].value : options[options.length - 1].value);
    }
  };
  const enabled = (): readonly RadioOption[] =>
    disabled.value ? [] : inputs.options.value.filter(option => option.disabled !== true);

  const select = (option: RadioOption): void => {
    if (!disabled.value && option.disabled !== true) {
      value.change(option.value);
    }
  };

  const rows = inputs.options.pipe(
    map(options => options.map(option => radio(option, value, disabled, invalid, focus.focused, select)))
  );

  const group = {
    ref: focus.ref,
    focusable: true,
    disabled,
    modifiers: modifiersOf(inputs, CONTROL_FOCUS_RING),
    gap: 4,
    role: 'radiogroup' as const,
    label,
    description: error,
    states: states(invalid, required),
    onKeyDown: keymap({
      ArrowDown: () => step(1),
      ArrowRight: () => step(rtl() ? -1 : 1),
      ArrowUp: () => step(-1),
      ArrowLeft: () => step(rtl() ? 1 : -1),
      Home: () => edge('first'),
      End: () => edge('last')
    })
  };

  // The group is the control and the outer column is only the slot the
  // message goes in, so the layout props place the pair and
  // `rootModifiers` stays on the element that carries the role.
  return Column(
    { ...layoutOf(inputs), gap: 4, x: 'stretch' },
    direction.value === 'row' ? Row(group, rows) : Column(group, rows),
    controlMessage(error)
  );
}

/**
 * One option. It is a `radio` in the semantics tree but not a tab
 * stop: the group is (see the keyboard note above).
 */
function radio(
  option: RadioOption,
  value: ControlledValue<string>,
  groupDisabled: Observable<boolean>,
  invalid: Observable<boolean>,
  groupFocused: Observable<boolean>,
  select: (option: RadioOption) => void
): UiElement {
  const selected = value.value.pipe(map(current => current === option.value));
  const off = combineLatest([groupDisabled]).pipe(map(([all]) => all || option.disabled === true));
  const active = combineLatest([selected, groupFocused]).pipe(map(([on, focused]) => on && focused));
  return Row(
    {
      key: option.value,
      modifiers: [CONTROL_INTERACTION],
      gap: 8,
      y: 'center',
      padding: 4,
      borderRadius: 4,
      role: 'radio',
      label: option.label,
      states: selected.pipe(map(on => (on ? (['checked'] as UiSemanticState[]) : []))),
      onClick: () => select(option)
    },
    Box(
      {
        width: 18,
        height: 18,
        // Its own size beside a label long enough to wrap: the label gives way, not the circle.
        flexShrink: 0,
        borderRadius: 9,
        borderWidth: 1,
        // Invalid rings every circle in the danger colour, as `Checkbox`
        // rings its box: without it a group marked wrong drew exactly as
        // a valid one, and only the message under it said otherwise.
        // The focused choice keeps the accent, since where the arrows
        // will land is what focus has to show.
        borderColor: combineLatest([active, invalid]).pipe(
          map(([on, bad]) => (on ? 'controlAccent' : bad ? 'danger' : 'controlBorder'))
        ),
        backgroundColor: 'controlBackground',
        x: 'center',
        y: 'center',
        hitTestable: false
      },
      Box({
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: dot(selected, off)
      })
    ),
    Text({ text: option.label, color: foregroundToken(off), selectable: false })
  );
}

function dot(selected: Observable<boolean>, disabled: Observable<boolean>): Observable<string> {
  return combineLatest([selected, disabled]).pipe(
    map(([on, off]) => (!on ? 'controlBackground' : off ? 'controlForegroundDisabled' : 'controlAccent'))
  );
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
