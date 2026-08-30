import type { BehaviorSubject, Observable } from 'rxjs';

import { createElement } from './dom';

/**
 * Declarative control panel.
 *
 * The sidebar used to be a ~90 line HTML string paired with a ~110
 * line wiring function, so every control appeared twice — once as
 * markup with an id, once as a `requireElement` lookup of that id —
 * and the two could drift. A control is now described once, and the
 * value flow is uniform: the control writes through `onInput`, and
 * separately mirrors whatever its subject emits.
 *
 * Splitting reads from writes is what lets the same panel drive a
 * local state object and a state object that lives in a worker. In
 * the worker case `onInput` posts a message and the subject is
 * updated later, when the worker echoes the change back; the control
 * follows either way with no special case.
 */

interface FieldSpec {
  /** Text shown to the left of the control. */
  readonly label: string;
}

export interface SwitchSpec extends FieldSpec {
  readonly kind: 'switch';
  readonly value$: BehaviorSubject<boolean>;
  readonly onInput: (value: boolean) => void;
}

export interface NumberSpec extends FieldSpec {
  readonly kind: 'number';
  readonly value$: BehaviorSubject<number>;
  readonly onInput: (value: number) => void;
  readonly min?: number;
  readonly step?: number;
  /** Greys the field out while this emits true. */
  readonly disabledWhen$?: BehaviorSubject<boolean>;
}

export interface SelectSpec<T extends string> extends FieldSpec {
  readonly kind: 'select';
  readonly value$: BehaviorSubject<T>;
  readonly onInput: (value: T) => void;
  readonly options: readonly { readonly value: T; readonly label: string }[];
}

export interface RangeSpec extends FieldSpec {
  readonly kind: 'range';
  readonly value$: BehaviorSubject<number>;
  readonly onInput: (value: number) => void;
  readonly min: number;
  readonly max: number;
}

export interface ColorSpec extends FieldSpec {
  readonly kind: 'color';
  readonly value$: BehaviorSubject<string>;
  readonly onInput: (value: string) => void;
}

export interface ButtonsSpec {
  readonly kind: 'buttons';
  readonly buttons: readonly {
    readonly label: string;
    readonly onClick: () => void;
    /** Marks the button as the current choice while this predicate holds. */
    readonly pressedWhen?: (current: unknown) => boolean;
  }[];
  /** When present, button pressed-states track this stream. */
  readonly pressedFrom$?: Observable<unknown>;
}

export interface ReadoutSpec extends FieldSpec {
  readonly kind: 'readout';
  readonly value$: Observable<unknown>;
  /** Formats the emitted value. Defaults to joining arrays with spaces. */
  readonly format?: (value: unknown) => string;
}

export type ControlSpec =
  | SwitchSpec
  | NumberSpec
  | SelectSpec<string>
  | RangeSpec
  | ColorSpec
  | ButtonsSpec
  | ReadoutSpec;

export interface ControlGroupSpec {
  readonly title: string;
  readonly controls: readonly ControlSpec[];
}

/**
 * Renders control groups into a sidebar and keeps them in sync with
 * their subjects. Returns a dispose function that tears down every
 * subscription the panel opened.
 */
export function renderControls(sidebar: HTMLElement, groups: readonly ControlGroupSpec[]): () => void {
  const teardown: (() => void)[] = [];
  const sections = groups.map(group => {
    const section = createElement('section', { className: 'pg-group' });
    section.appendChild(createElement('h3', { className: 'pg-group-title', text: group.title }));
    for (const control of group.controls) {
      section.appendChild(renderControl(control, teardown));
    }
    return section;
  });
  sidebar.replaceChildren(...sections);

  return () => {
    for (const dispose of teardown) {
      dispose();
    }
    teardown.length = 0;
  };
}

function renderControl(spec: ControlSpec, teardown: (() => void)[]): HTMLElement {
  switch (spec.kind) {
    case 'switch':
      return renderSwitch(spec, teardown);
    case 'number':
      return renderNumber(spec, teardown);
    case 'select':
      return renderSelect(spec, teardown);
    case 'range':
      return renderRange(spec, teardown);
    case 'color':
      return renderColor(spec, teardown);
    case 'buttons':
      return renderButtons(spec, teardown);
    case 'readout':
      return renderReadout(spec, teardown);
  }
}

function renderField(label: string, tag: 'label' | 'div' = 'label'): HTMLElement {
  const field = createElement(tag, { className: 'pg-field' });
  field.appendChild(createElement('span', { className: 'pg-field-label', text: label }));
  return field;
}

function renderSwitch(spec: SwitchSpec, teardown: (() => void)[]): HTMLElement {
  const field = renderField(spec.label);
  field.classList.add('pg-check');
  const input = createElement('input', { attrs: { type: 'checkbox' } });
  field.append(input, createElement('span', { className: 'pg-switch' }));

  listen(input, 'change', () => spec.onInput(input.checked), teardown);
  mirror(
    spec.value$,
    value => {
      input.checked = value;
    },
    teardown
  );
  return field;
}

function renderNumber(spec: NumberSpec, teardown: (() => void)[]): HTMLElement {
  const field = renderField(spec.label);
  const input = createElement('input', { attrs: { type: 'number' } });
  if (spec.min !== undefined) {
    input.min = String(spec.min);
  }
  if (spec.step !== undefined) {
    input.step = String(spec.step);
  }
  field.appendChild(input);

  listen(
    input,
    'input',
    () => {
      const value = Number(input.value);
      if (Number.isFinite(value)) {
        spec.onInput(value);
      }
    },
    teardown
  );
  mirror(
    spec.value$,
    value => {
      // Writing back into the field being typed in would move the
      // caret to the end after every keystroke, so an echo of the
      // user's own edit is ignored while the field has focus.
      if (document.activeElement !== input) {
        input.value = String(value);
      }
    },
    teardown
  );
  if (spec.disabledWhen$ !== undefined) {
    mirror(
      spec.disabledWhen$,
      disabled => {
        input.disabled = disabled;
      },
      teardown
    );
  }
  return field;
}

function renderSelect(spec: SelectSpec<string>, teardown: (() => void)[]): HTMLElement {
  const field = renderField(spec.label);
  const select = createElement('select');
  for (const option of spec.options) {
    const element = createElement('option', { text: option.label });
    element.value = option.value;
    select.appendChild(element);
  }
  field.appendChild(select);

  listen(select, 'change', () => spec.onInput(select.value), teardown);
  mirror(
    spec.value$,
    value => {
      select.value = value;
    },
    teardown
  );
  return field;
}

function renderRange(spec: RangeSpec, teardown: (() => void)[]): HTMLElement {
  const field = renderField(spec.label);
  const input = createElement('input', { attrs: { type: 'range' } });
  input.min = String(spec.min);
  input.max = String(spec.max);
  field.appendChild(input);

  listen(input, 'input', () => spec.onInput(Number(input.value)), teardown);
  mirror(
    spec.value$,
    value => {
      if (document.activeElement !== input) {
        input.value = String(value);
      }
    },
    teardown
  );
  return field;
}

function renderColor(spec: ColorSpec, teardown: (() => void)[]): HTMLElement {
  const field = renderField(spec.label);
  const input = createElement('input', { attrs: { type: 'color' } });
  field.appendChild(input);

  listen(input, 'input', () => spec.onInput(input.value), teardown);
  mirror(
    spec.value$,
    value => {
      if (document.activeElement !== input) {
        input.value = value;
      }
    },
    teardown
  );
  return field;
}

function renderButtons(spec: ButtonsSpec, teardown: (() => void)[]): HTMLElement {
  const row = createElement('div', { className: 'pg-buttons' });
  const buttons = spec.buttons.map(button => {
    const element = createElement('button', {
      className: 'pg-button pg-button-grow',
      text: button.label,
      attrs: { type: 'button' }
    });
    listen(element, 'click', button.onClick, teardown);
    row.appendChild(element);
    return element;
  });

  if (spec.pressedFrom$ !== undefined) {
    mirror(
      spec.pressedFrom$,
      current => {
        spec.buttons.forEach((button, index) => {
          if (button.pressedWhen !== undefined) {
            buttons[index].setAttribute('aria-pressed', String(button.pressedWhen(current)));
          }
        });
      },
      teardown
    );
  }
  return row;
}

function renderReadout(spec: ReadoutSpec, teardown: (() => void)[]): HTMLElement {
  const field = renderField(spec.label, 'div');
  const value = createElement('span', { className: 'pg-readout' });
  field.appendChild(value);

  mirror(
    spec.value$,
    current => {
      value.textContent =
        spec.format !== undefined ? spec.format(current) : Array.isArray(current) ? current.join(' ') : String(current);
    },
    teardown
  );
  return field;
}

function listen<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  handler: () => void,
  teardown: (() => void)[]
): void {
  element.addEventListener(type, handler);
  teardown.push(() => element.removeEventListener(type, handler));
}

function mirror<T>(source: Observable<T>, apply: (value: T) => void, teardown: (() => void)[]): void {
  const subscription = source.subscribe(apply);
  teardown.push(() => subscription.unsubscribe());
}
