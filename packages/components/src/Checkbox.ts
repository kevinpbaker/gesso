import { combineLatest, map, type Observable } from 'rxjs';
import { type UiNodeRef, Box, Row, Text, type UiChild, type UiSemanticState } from '@gesso/core';

import { input, type ComponentContext, type Inputs } from '@gesso/framework';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import {
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  borderToken,
  foregroundToken,
  keymap,
  layoutOf,
  type ControlLayoutProps,
  modifiersOf
} from './internals';

/**
 * A box the user ticks.
 *
 * Controlled by `checked`, or self-managing from `defaultChecked`; see
 * `controlled.ts`. Layout props pass through to the row, so a caller
 * can place it, but nothing about its colours is a prop: it reads the
 * control tokens from whatever theme it inherits.
 */
export interface CheckboxProps extends ControlLayoutProps {
  /** Receives the node that *is* the control, for focus and anchoring. */
  ref?: UiNodeRef;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  /** Marks the control as failing validation: a red border, `invalid`. */
  invalid?: boolean;
  required?: boolean;
}

export function Checkbox(props: Inputs<CheckboxProps>, ctx: ComponentContext): UiChild {
  const label = input(props.label, '');
  const disabled = input(props.disabled, false);
  const invalid = input(props.invalid, false);
  const required = input(props.required, false);
  const focus = trackFocus(ctx, props.ref);
  const value = controlled<boolean>({
    component: 'Checkbox',
    name: 'checked',
    source: props.checked,
    initial: props.defaultChecked,
    fallback: false,
    onChange: props.onChange
  });

  const toggle = (): void => {
    if (disabled.value) {
      return;
    }
    value.change(!value.current());
  };

  return Row(
    {
      ...layoutOf(props),
      ref: focus.ref,
      focusable: true,
      disabled,
      modifiers: modifiersOf(props, CONTROL_INTERACTION, CONTROL_FOCUS_RING),
      gap: 8,
      y: 'center',
      padding: 4,
      borderRadius: 4,
      role: 'checkbox',
      label,
      states: states(value.value, invalid, required),
      onClick: toggle,
      onKeyDown: keymap({ ' ': toggle, Enter: toggle })
    },
    Box(
      {
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: borderToken(invalid),
        backgroundColor: fill(value.value, disabled),
        x: 'center',
        y: 'center',
        // The row is the control; the glyph must not swallow its clicks.
        hitTestable: false
      },
      // A drawn tick waits on the Media tier's `Icon`; until then the
      // glyph is text, which both renderers already draw.
      Text({
        text: value.value.pipe(map(on => (on ? '✓' : ''))),
        color: 'controlBackground',
        fontSize: 13,
        fontWeight: 600,
        selectable: false
      })
    ),
    Text({ text: label, color: foregroundToken(disabled), selectable: false })
  );
}

/** The states an assistive technology is told about, as they change. */
function states(
  checked: Observable<boolean>,
  invalid: Observable<boolean>,
  required: Observable<boolean>
): Observable<UiSemanticState[]> {
  return combineLatest([checked, invalid, required]).pipe(
    map(([on, bad, must]) => {
      const result: UiSemanticState[] = [];
      if (on) {
        result.push('checked');
      }
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

function fill(checked: Observable<boolean>, disabled: Observable<boolean>): Observable<string> {
  return combineLatest([checked, disabled]).pipe(
    map(([on, off]) => (!on ? 'controlBackground' : off ? 'controlForegroundDisabled' : 'controlAccent'))
  );
}
