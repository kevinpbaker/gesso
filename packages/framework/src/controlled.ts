import { map, type Observable } from 'rxjs';

import type { InputCell, OutputCell } from './Input';
import { internalState, type InternalState } from './InternalState';

/** A value a control shows and changes, whoever owns it. */
export interface ControlledValue<T> {
  readonly value: Observable<T>;
  current(): T;
  /** What the control calls when the person changes it. */
  change(next: T): void;
}

export interface ControlledOptions<T> {
  /** The component's name, for the error when both forms are passed. */
  readonly component: string;
  /** The input's name: `value`, `checked`, `open`. */
  readonly name: string;
  /** The controlled form: the parent owns the value and hears every change. */
  readonly source: InputCell<T | undefined>;
  /** The self-managed form: a starting value the control then owns. */
  readonly initial: InputCell<T | undefined>;
  /** What the control shows when given neither. */
  readonly fallback: T;
  /** Fired on every change in either form. */
  readonly onChange: OutputCell<[next: T]>;
}

/**
 * Controlled by default, self-managing when given only an initial value.
 *
 * The one contract every stateful control in the library obeys, and the
 * one an application component should copy: pass `value` and the app
 * owns the state and hears every change through `onChange`; pass
 * `defaultValue` and the control owns it, still reporting changes;
 * pass both and it throws, because two owners is a bug. `bind(cell)` is
 * the spread for the first form when the owner is a local cell.
 */
export function controlled<T>(options: ControlledOptions<T>): ControlledValue<T> {
  const { component, name, source, initial, fallback, onChange } = options;
  const isControlled = source.value !== undefined;
  if (isControlled && initial.value !== undefined) {
    throw new Error(
      `${component} was given both '${name}' and 'default${capitalize(name)}'. ` +
        `Pass '${name}' for the app to own the value, or 'default${capitalize(name)}' for the control to.`
    );
  }
  if (isControlled) {
    return {
      value: source.pipe(map(value => (value === undefined ? fallback : value))),
      current: () => (source.value === undefined ? fallback : source.value),
      change: next => onChange.emit(next)
    };
  }
  const own: InternalState<T> = internalState(initial.value === undefined ? fallback : initial.value);
  return {
    value: own,
    current: () => own.value,
    change: next => {
      own.value = next;
      onChange.emit(next);
    }
  };
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
