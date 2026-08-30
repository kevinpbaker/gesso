import type { Observable } from 'rxjs';
import { map } from 'rxjs';

import type { InputCell } from '../framework/Input';
import { internalState, type InternalState } from '../framework/InternalState';

/**
 * A control's value, whoever owns it.
 *
 * Every stateful component in the library is **controlled by default**
 * and takes an optional initial value that makes it self-managing:
 *
 *   Checkbox({ checked: model.wrap, onChange: … })   // the app owns it
 *   Checkbox({ defaultChecked: true })               // the control does
 *
 * Supplying both is a thrown error naming the component, not a silent
 * precedence rule: a component that quietly owns state the app also
 * thinks it owns is exactly the bug the framework's "shared state
 * lives in a store" rule exists to prevent.
 *
 * Which of the two applies is decided once, when the component is
 * built, from whether the value prop was supplied. A control cannot
 * change owner mid-life, and nothing about it would be well defined if
 * it could.
 */
export interface ControlledValue<T> {
  /** Bind this into the tree. */
  readonly value: Observable<T>;
  /** The value now, for a handler that toggles or steps it. */
  current(): T;
  /**
   * Applies a change: reports it, and stores it when the control owns
   * it. A controlled component that is handed no `onChange` simply
   * does not move, which is the same thing a read-only input does.
   */
  change(next: T): void;
}

export interface ControlledOptions<T> {
  /** The component's name, for the error message. */
  readonly component: string;
  /** The controlled prop's name, for the error message. */
  readonly name: string;
  readonly source: InputCell<T | undefined>;
  readonly initial: InputCell<T | undefined>;
  /** Used when neither prop was supplied. */
  readonly fallback: T;
  readonly onChange: InputCell<((next: T) => void) | undefined>;
}

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
      change: next => onChange.value?.(next)
    };
  }
  const own: InternalState<T> = internalState(initial.value === undefined ? fallback : initial.value);
  return {
    value: own,
    current: () => own.value,
    change: next => {
      own.value = next;
      onChange.value?.(next);
    }
  };
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
