import { BehaviorSubject, combineLatest, map, type Observable } from 'rxjs';
import {
  Column,
  defineModifier,
  Text,
  UiEnvironmentKeys,
  type UiChild,
  type UiColor,
  type UiNodeRef,
  type UiSemanticState,
  type UiTheme,
  type UiTextStyle
} from 'gesso-core';

import {
  createComponent,
  input,
  Island,
  NativeInputIsland,
  themeTokenCell,
  type ComponentContext,
  type Inputs,
  type NativeInputIslandEvent,
  type NativeInputIslandProps
} from 'gesso-framework';
import { controlled } from './controlled';
import { controlTokens } from './tokens';
import { trackFocus } from './focus';
import { controlDescription, controlMessage } from './message';
import {
  CONTROL_FOCUS_RING,
  borderToken,
  foregroundToken,
  layoutOf,
  type ControlLayoutProps,
  modifiersOf
} from './internals';

/** The space between the field's edge and its text, on the canvas and in the element alike. */
const INSET = 8;

/** How many of the field's own recent values are recognised as echoes; see `echoes`. */
const ECHOES = 16;

/**
 * A text field that is a real `<input>`: what a password manager, the
 * browser's autofill and a phone's one-time-code suggestion fill in.
 *
 * `TextInput` edits on the canvas, and none of those can see it. This
 * draws the same frame on the canvas (label, background, border, focus
 * ring, message) and puts a native `<input>` over it as a DOM island,
 * transparent, carrying only the text and the caret. Fields that share
 * a `form` are one `<form>` on the page, so a username and a password
 * are a sign-in form to Chrome. Enter in one submits it, which is the
 * submission a password manager watches for, and calls `onSubmit`; a
 * submit button drawn on the canvas does the same with
 * `IslandService.submitForm`.
 *
 *   <NativeInput form="sign-in" name="email" type="email" autocomplete="username"
 *                label="Email" value={email} onChange={value => auth.send.setEmail(value)} />
 *   <NativeInput form="sign-in" name="password" type="password" autocomplete="current-password"
 *                label="Password" value={password} onChange={…} onSubmit={() => auth.send.signIn()} />
 *
 * Only the field being typed into shows its DOM text. Every other field,
 * and that one while it moves, is drawn by the canvas in the same font,
 * so no field trails its frame by the frame a placement takes to reach
 * the main thread while a form scrolls.
 *
 * The shell has to register the island: `createApp({ islands:
 * [nativeInputIsland] })`. The page should load the font the theme
 * names, or the element draws in a fallback beside the canvas's.
 */
export interface NativeInputProps extends ControlLayoutProps {
  /** Receives the island's node, for focus and anchoring. */
  ref?: UiNodeRef;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Enter in the field, or its form submitted from the page. */
  onSubmit?: () => void;
  /** The field's name, shown above it and read by assistive technology. */
  label?: string;
  /** The label is not drawn, only read. */
  labelHidden?: boolean;
  placeholder?: string;
  description?: string;
  error?: string;
  /** `text` by default. `password` draws bullets, on the canvas and in the element. */
  type?: NativeInputIslandProps['type'];
  /** The `name` attribute. */
  name?: string;
  /** The `autocomplete` attribute: `username`, `current-password`, `new-password`, `email`, `one-time-code`… */
  autocomplete?: string;
  /** The `inputmode` attribute: which keyboard a phone shows. */
  inputMode?: string;
  /** The page form the field belongs to. Fields that share one are submitted together. */
  form?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  maxLength?: number;
  spellCheck?: boolean;
}

interface FieldLook {
  readonly text: UiTextStyle;
  readonly theme: UiTheme;
  readonly scale: number;
}

/** Hands the field's inherited text style and theme to the cell that builds the element's props. */
const fieldLook = defineModifier<BehaviorSubject<FieldLook | null>>({
  name: 'nativeInputLook',
  attach(host, sink) {
    const publish = (): void => {
      sink.next({
        text: host.environment(UiEnvironmentKeys.textStyle),
        theme: host.environment(UiEnvironmentKeys.theme),
        scale: host.environment(UiEnvironmentKeys.textScale)
      });
    };
    publish();
    host.onEnvironment(publish);
  }
});

export function NativeInput(inputs: Inputs<NativeInputProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const labelHidden = inputs.labelHidden?.value === true;
  const description = input(inputs.description, '');
  const error = input(inputs.error, '');
  const disabled = input(inputs.disabled, false);
  const readOnly = input(inputs.readOnly, false);
  const required = input(inputs.required, false);
  const placeholder = input(inputs.placeholder, '');
  const type = input(inputs.type, 'text');
  const invalid = error.pipe(map(text => text.length > 0));
  const focus = trackFocus(ctx, inputs.ref);
  const tokens = themeTokenCell(controlTokens);
  const look = new BehaviorSubject<FieldLook | null>(null);
  const standIn = new BehaviorSubject(true);
  const value = controlled<string>({
    component: 'NativeInput',
    name: 'value',
    source: inputs.value,
    initial: inputs.defaultValue,
    fallback: '',
    onChange: inputs.onChange
  });

  // What the field itself has said lately. A value the application
  // hands back that is one of these is the echo of typing, and writing
  // it into the element would put old text over newer keys; any other
  // value was set by the application, and bumps the version that makes
  // the element take it. See `IslandUpdateInfo`.
  const echoes: string[] = [];
  let version = 0;
  const sent = value.value.pipe(
    map(text => {
      if (!echoes.includes(text)) {
        version += 1;
        echoes.length = 0;
      }
      return { text, version };
    })
  );

  const props: Observable<NativeInputIslandProps> = combineLatest([
    sent,
    look,
    type,
    placeholder,
    disabled,
    readOnly,
    required,
    label,
    combineLatest([
      input(inputs.name, ''),
      input(inputs.autocomplete, ''),
      input(inputs.inputMode, ''),
      input(inputs.form, ''),
      input(inputs.maxLength, -1),
      input(inputs.spellCheck, false)
    ])
  ]).pipe(
    map(([current, seen, kind, hint, off, locked, must, name, [field, autocomplete, mode, form, max, spell]]) => {
      const text = seen?.text;
      const colors = seen?.theme.colors;
      return {
        type: kind,
        value: current.text,
        valueVersion: current.version,
        placeholder: hint,
        disabled: off,
        readOnly: locked,
        required: must,
        label: name,
        spellCheck: spell,
        ...(field === '' ? {} : { name: field }),
        ...(autocomplete === '' ? {} : { autocomplete }),
        ...(mode === '' ? {} : { inputMode: mode }),
        ...(form === '' ? {} : { form }),
        ...(max < 0 ? {} : { maxLength: max }),
        fontFamily: text?.fontFamily ?? 'sans-serif',
        fontSize: (text?.fontSize ?? 14) * (seen?.scale ?? 1),
        fontWeight: text?.fontWeight ?? 400,
        color: css(off ? colors?.controlForegroundDisabled : colors?.controlForeground),
        placeholderColor: css(colors?.textMuted),
        paddingLeft: INSET,
        paddingRight: INSET
      };
    })
  );

  const shown: Observable<string> = combineLatest([value.value, placeholder, type]).pipe(
    map(([text, hint, kind]) => (text.length === 0 ? hint : kind === 'password' ? '•'.repeat(text.length) : text))
  );
  const shownColor = combineLatest([value.value, disabled]).pipe(
    map(([text, off]) => (text.length === 0 ? 'textMuted' : off ? 'controlForegroundDisabled' : 'controlForeground'))
  );

  const onEvent = (event: NativeInputIslandEvent): void => {
    if (event.type === 'input') {
      echoes.push(event.value);
      if (echoes.length > ECHOES) {
        echoes.shift();
      }
      value.change(event.value);
    } else if (event.type === 'submit') {
      inputs.onSubmit.value?.();
    }
  };

  return Column(
    { ...layoutOf(inputs), gap: 4 },
    label.pipe(
      map(text =>
        text.length === 0 || labelHidden
          ? []
          : [Text({ text, color: foregroundToken(disabled), textStyle: 'bodySmall', selectable: false })]
      )
    ),
    createComponent(Island<NativeInputIslandProps, NativeInputIslandEvent>, {
      of: NativeInputIsland,
      props,
      onEvent,
      onSubmit: () => inputs.onSubmit.value?.(),
      standIn: 'unfocused',
      onStandIn: showing => standIn.next(showing),
      ref: focus.ref,
      label,
      role: 'textbox',
      description: controlDescription(error, description),
      states: states(invalid, required, readOnly),
      disabled,
      rootModifiers: [...modifiersOf(inputs, tokens.modifier, CONTROL_FOCUS_RING), fieldLook(look)],
      minHeight: tokens.select(t => t.field.minHeight),
      padding: INSET,
      y: 'center',
      overflow: 'hidden',
      backgroundColor: 'controlBackground',
      borderWidth: 1,
      borderColor: borderToken(invalid),
      borderRadius: tokens.select(t => t.radius.field),
      // The stand-in: the field as the canvas draws it whenever the
      // element is hidden, in the font the element is given.
      children: Text({
        text: shown,
        color: shownColor,
        textWrap: 'none',
        selectable: false,
        hitTestable: false,
        opacity: standIn.pipe(map(showing => (showing ? 1 : 0)))
      })
    }),
    controlMessage(error, description)
  );
}

function css(color: UiColor | undefined): string {
  if (color === undefined) {
    return 'inherit';
  }
  const byte = (channel: number): number => Math.round(Math.min(1, Math.max(0, channel)) * 255);
  return `rgba(${byte(color.r)}, ${byte(color.g)}, ${byte(color.b)}, ${color.a})`;
}

function states(
  invalid: Observable<boolean>,
  required: Observable<boolean>,
  readOnly: Observable<boolean>
): Observable<UiSemanticState[]> {
  return combineLatest([invalid, required, readOnly]).pipe(
    map(([bad, must, locked]) => {
      const result: UiSemanticState[] = [];
      if (bad) result.push('invalid');
      if (must) result.push('required');
      if (locked) result.push('readonly');
      return result;
    })
  );
}
