import { combineLatest, map, type Observable } from 'rxjs';
import { type UiNodeRef, Box, Row, Text, type UiChild, type UiSemanticState } from '@gesso/core';

import { input, type ComponentContext, type Inputs } from '@gesso/framework';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import {
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  foregroundToken,
  keymap,
  layoutOf,
  type ControlLayoutProps,
  modifiersOf
} from './internals';

/**
 * A checkbox that reads as on or off rather than ticked.
 *
 * The same control as `Checkbox` with a different role and a different
 * drawing: a screen reader says "on"/"off" for a switch and
 * "checked"/"unchecked" for a checkbox, which is the whole reason both
 * exist.
 */
export interface SwitchProps extends ControlLayoutProps {
  /** Receives the node that *is* the control, for focus and anchoring. */
  ref?: UiNodeRef;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Switch(inputs: Inputs<SwitchProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const disabled = input(inputs.disabled, false);
  const focus = trackFocus(ctx, inputs.ref);
  const value = controlled<boolean>({
    component: 'Switch',
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

  return Row(
    {
      ...layoutOf(inputs),
      ref: focus.ref,
      focusable: true,
      disabled,
      modifiers: modifiersOf(inputs, CONTROL_INTERACTION, CONTROL_FOCUS_RING),
      gap: 8,
      y: 'center',
      padding: 4,
      borderRadius: 4,
      role: 'switch',
      label,
      states: value.value.pipe(map(on => (on ? (['checked'] as UiSemanticState[]) : []))),
      onClick: toggle,
      onKeyDown: keymap({ ' ': toggle, Enter: toggle })
    },
    // The track aligns its thumb, so the thumb's position is layout
    // rather than a computed offset. The thumb is drawn in whichever
    // token contrasts with the track it sits on: the control's white on
    // the accent when on, the control's outline colour on the empty
    // track when off, since an off track is the same white as the thumb
    // would otherwise be.
    Box(
      {
        width: 40,
        height: 22,
        padding: 2,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: 'controlBorder',
        backgroundColor: track(value.value, disabled),
        x: value.value.pipe(map(on => (on ? 'end' : 'start'))),
        y: 'center',
        hitTestable: false
      },
      Box({ width: 16, height: 16, borderRadius: 8, backgroundColor: thumb(value.value) })
    ),
    Text({ text: label, color: foregroundToken(disabled), selectable: false })
  );
}

/** The track behind the thumb: empty when off, filled with the accent when on. */
function track(checked: Observable<boolean>, disabled: Observable<boolean>): Observable<string> {
  return combineLatest([checked, disabled]).pipe(
    map(([on, off]) => (!on ? 'controlBackground' : off ? 'controlForegroundDisabled' : 'controlAccent'))
  );
}

/** The thumb on the track: the control's outline colour on an empty track, white on the accent. */
function thumb(checked: Observable<boolean>): Observable<string> {
  return checked.pipe(map(on => (on ? 'controlBackground' : 'controlBorder')));
}
