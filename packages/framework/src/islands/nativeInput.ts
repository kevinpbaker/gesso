import { island, provideIsland, type IslandContext, type IslandRegistration } from './islandToken';

/**
 * What the render worker tells a native `<input>` island.
 *
 * The field's frame (background, border, focus ring) is drawn on the
 * canvas; the element is transparent and carries the text, the caret
 * and the selection, in the font the canvas would have drawn them in.
 */
export interface NativeInputIslandProps {
  readonly type: 'text' | 'email' | 'password' | 'tel' | 'url' | 'search' | 'number';
  /** The `name` attribute, which a password manager reads as well as `autocomplete`. */
  readonly name?: string;
  /** The `autocomplete` attribute: `username`, `current-password`, `email`, `cc-number`… */
  readonly autocomplete?: string;
  readonly inputMode?: string;
  readonly placeholder?: string;
  /**
   * The value, written into the element only when `valueVersion`
   * changes: the render worker bumps it for a value the application set,
   * never for the echo of one the field sent. See `IslandUpdateInfo`.
   */
  readonly value: string;
  readonly valueVersion: number;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly maxLength?: number;
  readonly spellCheck?: boolean;
  /** The name of the shell's `<form>` the field belongs to; one per sign-in, say. */
  readonly form?: string;
  /** The accessible name, as `aria-label`. */
  readonly label?: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: number | string;
  readonly color: string;
  readonly placeholderColor: string;
  readonly paddingLeft: number;
  readonly paddingRight: number;
  readonly textAlign?: 'left' | 'center' | 'right';
}

/** What a native `<input>` island says back. */
export type NativeInputIslandEvent =
  /** The text changed: typing, pasting, or the browser filling it in (`autofilled`). */
  | { readonly type: 'input'; readonly value: string; readonly autofilled: boolean }
  /** The text was committed: the field lost focus with a new value. */
  | { readonly type: 'change'; readonly value: string }
  /** Enter, in a field that belongs to no form. One in a form submits the form. */
  | { readonly type: 'submit' };

/** The token for the native `<input>` island; `NativeInput` in gesso-components draws it. */
export const NativeInputIsland = island<NativeInputIslandProps, NativeInputIslandEvent>('gesso:native-input');

const STYLE_ID = 'gesso-island-input-style';

/**
 * The one rule a style attribute cannot carry: the placeholder's
 * colour, which is a pseudo-element's. Read from a custom property each
 * element sets, so the rule is written once per document.
 */
function ensureStyle(document: Document): void {
  if (document.getElementById(STYLE_ID) !== null) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = '[data-gesso-island-input]::placeholder{color:var(--gesso-placeholder);opacity:1}';
  document.head.appendChild(style);
}

function autofilled(input: HTMLInputElement): boolean {
  try {
    return input.matches(':autofill');
  } catch {
    try {
      return input.matches(':-webkit-autofill');
    } catch {
      return false;
    }
  }
}

/**
 * A real `<input>`, which is what a password manager, the browser's
 * autofill, a phone's one-time-code suggestion and a payment form's
 * card scanner all look for. A canvas field is none of those things to
 * them, however well it edits.
 *
 * Inside the shell's `<form>` for `form`, so a username field and a
 * password field are one sign-in form to Chrome. Enter submits that form
 * with `requestSubmit()`, the submission a password manager watches for;
 * the shell prevents the navigation, and the render worker hears it as
 * the field's `onSubmit`. Register it with `createApp({ islands:
 * [nativeInputIsland] })`; a shell that does not name it does not carry
 * it.
 */
export const nativeInputIsland: IslandRegistration = provideIsland(NativeInputIsland, {
  create(props: NativeInputIslandProps, context: IslandContext<NativeInputIslandEvent>) {
    const document = context.document;
    ensureStyle(document);
    const input = document.createElement('input');
    input.setAttribute('data-gesso-island-input', '');
    // Tab is the app's to move, so the browser's own walk must not land
    // here from outside it; a click, autofill and a screen reader still can.
    input.tabIndex = -1;
    Object.assign(input.style, {
      border: '0',
      outline: 'none',
      background: 'transparent',
      margin: '0',
      boxShadow: 'none',
      appearance: 'none',
      webkitAppearance: 'none',
      borderRadius: '0',
      boxSizing: 'border-box',
      paddingTop: '0',
      paddingBottom: '0'
    } as Partial<CSSStyleDeclaration>);
    let version = Number.NaN;
    let formName: string | undefined;

    const apply = (next: NativeInputIslandProps): void => {
      input.type = next.type;
      setAttribute(input, 'name', next.name);
      setAttribute(input, 'autocomplete', next.autocomplete);
      setAttribute(input, 'inputmode', next.inputMode);
      setAttribute(input, 'placeholder', next.placeholder);
      setAttribute(input, 'aria-label', next.label);
      setAttribute(input, 'maxlength', next.maxLength === undefined ? undefined : String(next.maxLength));
      input.disabled = next.disabled === true;
      input.readOnly = next.readOnly === true;
      input.required = next.required === true;
      input.spellcheck = next.spellCheck === true;
      const style = input.style;
      style.fontFamily = next.fontFamily;
      style.fontSize = `${next.fontSize}px`;
      style.fontWeight = String(next.fontWeight);
      style.color = next.color;
      style.caretColor = next.color;
      style.paddingLeft = `${next.paddingLeft}px`;
      style.paddingRight = `${next.paddingRight}px`;
      style.textAlign = next.textAlign ?? 'left';
      style.setProperty('--gesso-placeholder', next.placeholderColor);
      if (next.valueVersion !== version) {
        version = next.valueVersion;
        if (input.value !== next.value) {
          input.value = next.value;
        }
      }
      // Into its form on the first update that names one. A field that
      // later leaves its form stays where it is, which is a change of
      // meaning no sign-in makes.
      if (next.form !== undefined && next.form !== formName) {
        formName = next.form;
        context.form(next.form).appendChild(input);
      }
    };
    apply(props);

    input.addEventListener('input', () => {
      context.emit({ type: 'input', value: input.value, autofilled: autofilled(input) });
    });
    input.addEventListener('change', () => context.emit({ type: 'change', value: input.value }));
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) {
        return;
      }
      // Ours to submit either way: the browser's implicit submission
      // does nothing in a form of two fields with no submit button, and
      // submits a form of one field a second time.
      event.preventDefault();
      if (formName === undefined) {
        context.emit({ type: 'submit' });
      } else {
        context.form(formName).requestSubmit();
      }
    });

    return {
      element: input,
      update: apply,
      focus: () => input.focus({ preventScroll: true })
    };
  }
});

function setAttribute(element: HTMLElement, name: string, value: string | undefined): void {
  if (value === undefined || value === '') {
    element.removeAttribute(name);
  } else if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}
