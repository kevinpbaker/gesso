import { BehaviorSubject, combineLatest, map, type Observable } from 'rxjs';
import {
  type UiNodeRef,
  Column,
  EditableText,
  Text,
  type UiChild,
  type UiKeyboardEvent,
  type UiTextChangeEvent,
  type UiSemanticState
} from '@gesso/core';

import { input, type ComponentContext, type Inputs } from '@gesso/framework';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import {
  CONTROL_FOCUS_RING,
  borderToken,
  foregroundToken,
  keymap,
  layoutOf,
  type ControlLayoutProps,
  modifiersOf
} from './internals';

/**
 * A field the user types into: a label, the field, and the message
 * under it.
 *
 * The typing itself is F2's — `EditableText` owns the caret, the
 * selection, IME composition and the clipboard, in the render worker.
 * What this adds is what a form needs: a name, validation state, a
 * description, and the semantics that let a screen reader read all
 * three.
 *
 * `TextArea` is this component with `multiline` on. There is no second
 * implementation, because there is no second behaviour.
 */
export interface TextInputProps extends ControlLayoutProps {
  /** Receives the node that *is* the control, for focus and anchoring. */
  ref?: UiNodeRef;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** The field's name, shown above it and read by assistive technology. */
  label?: string;
  placeholder?: string;
  /** Shown under the field; read after the name. Replaced by `error`. */
  description?: string;
  /** Marks the field invalid and replaces the description. */
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  /** Enter inserts a newline instead of submitting. */
  multiline?: boolean;
  /** Enter in a single-line field. */
  onSubmit?: () => void;
}

export function TextInput(props: Inputs<TextInputProps>, ctx: ComponentContext): UiChild {
  return textField(props, ctx, false);
}

export type TextAreaProps = Omit<TextInputProps, 'multiline'>;

export function TextArea(props: Inputs<TextAreaProps>, ctx: ComponentContext): UiChild {
  return textField(props as Inputs<TextInputProps>, ctx, true);
}

function textField(props: Inputs<TextInputProps>, ctx: ComponentContext, forceMultiline: boolean): UiChild {
  const label = input(props.label, '');
  const description = input(props.description, '');
  const error = input(props.error, '');
  const disabled = input(props.disabled, false);
  const readOnly = input(props.readOnly, false);
  const required = input(props.required, false);
  const multiline = forceMultiline ? new BehaviorSubject(true) : input(props.multiline, false);
  const invalid = error.pipe(map(text => text.length > 0));
  const focus = trackFocus(ctx, props.ref);
  const value = controlled<string>({
    component: forceMultiline ? 'TextArea' : 'TextInput',
    name: 'value',
    source: props.value,
    initial: props.defaultValue,
    fallback: '',
    onChange: props.onChange
  });

  // The message under the field: the error when there is one, else the
  // description. One node, so the two can never both be read out.
  const message = combineLatest([error, description]).pipe(map(([bad, hint]) => (bad.length > 0 ? bad : hint)));
  const submit = keymap({ Enter: () => props.onSubmit.value?.() });

  return Column(
    { ...layoutOf(props), gap: 4 },
    label.pipe(
      map(text =>
        text.length === 0 ? [] : [Text({ text, color: foregroundToken(disabled), fontSize: 12, selectable: false })]
      )
    ),
    EditableText({
      ref: focus.ref,
      modifiers: modifiersOf(props, CONTROL_FOCUS_RING),
      value: value.value,
      placeholder: props.placeholder,
      disabled,
      readOnly,
      multiline,
      // A single-line field scrolls its text rather than wrapping it.
      textWrap: multiline.pipe(map(on => (on ? 'word' : 'none'))),
      backgroundColor: 'controlBackground',
      color: 'controlForeground',
      borderWidth: 1,
      borderColor: borderToken(invalid),
      borderRadius: 6,
      padding: 8,
      minHeight: multiline.pipe(map(on => (on ? 72 : 32))),
      role: 'textbox',
      label,
      description,
      states: states(invalid, required, readOnly),
      onInput: (event: UiTextChangeEvent) => value.change(event.value),
      // Enter belongs to the app in a single-line field; in a
      // multiline one it belongs to the text.
      onKeyDown: (event: UiKeyboardEvent) => {
        if (!multiline.value) {
          submit(event);
        }
      }
    }),
    message.pipe(
      map(text =>
        text.length === 0
          ? []
          : [
              Text({
                text,
                color: error.value.length > 0 ? 'danger' : 'controlForegroundDisabled',
                fontSize: 12,
                selectable: false
              })
            ]
      )
    )
  );
}

function states(
  invalid: Observable<boolean>,
  required: Observable<boolean>,
  readOnly: Observable<boolean>
): Observable<UiSemanticState[]> {
  return combineLatest([invalid, required, readOnly]).pipe(
    map(([bad, must, locked]) => {
      const result: UiSemanticState[] = [];
      if (bad) {
        result.push('invalid');
      }
      if (must) {
        result.push('required');
      }
      if (locked) {
        result.push('readonly');
      }
      return result;
    })
  );
}
