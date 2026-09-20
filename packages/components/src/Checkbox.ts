import { combineLatest, map, type Observable } from 'rxjs';
import { type UiNodeRef, Box, Column, Row, Text, type UiChild, type UiSemanticState } from 'gesso-core';

import { input, themeTokenCell, type ComponentContext, type Inputs } from 'gesso-framework';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import { controlTokens } from './tokens';
import { controlMessage } from './message';
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
  /**
   * What is wrong with it, shown under the box and read after its name.
   *
   * What a form fills in, and what `invalid` is without the words. A
   * box that has to be ticked is the commonest required field there
   * is, and until now it could say only that it was wrong.
   */
  error?: string;
  required?: boolean;
}

export function Checkbox(inputs: Inputs<CheckboxProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const disabled = input(inputs.disabled, false);
  const error = input(inputs.error, '');
  const invalid = combineLatest([input(inputs.invalid, false), error]).pipe(
    map(([marked, message]) => marked || message.length > 0)
  );
  const required = input(inputs.required, false);
  const focus = trackFocus(ctx, inputs.ref);
  const tokens = themeTokenCell(controlTokens);
  const value = controlled<boolean>({
    component: 'Checkbox',
    name: 'checked',
    source: inputs.checked,
    initial: inputs.defaultChecked,
    fallback: false,
    onChange: inputs.onChange
  });

  const toggle = (): void => {
    if (disabled.value) {
      return;
    }
    value.change(!value.current());
  };

  // The row is the control and the column is only the slot the message
  // goes in, so the layout props place the pair and `rootModifiers`
  // stays on the element a `measure` or a `sharedElement` means.
  return Column(
    { ...layoutOf(inputs), gap: 4, x: 'stretch' },
    Row(
      {
        ref: focus.ref,
        focusable: true,
        disabled,
        modifiers: modifiersOf(inputs, tokens.modifier, CONTROL_INTERACTION, CONTROL_FOCUS_RING),
        gap: 8,
        y: 'center',
        padding: 4,
        borderRadius: tokens.select(t => t.radius.checkbox),
        role: 'checkbox',
        label,
        description: error,
        states: states(value.value, invalid, required),
        onClick: toggle,
        onKeyDown: keymap({ ' ': toggle, Enter: toggle })
      },
      Box(
        {
          width: 18,
          height: 18,
          borderRadius: tokens.select(t => t.radius.checkbox),
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
    ),
    controlMessage(error)
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
