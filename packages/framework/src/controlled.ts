import { map, skip, type Observable } from 'rxjs';

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
  /**
   * Other outputs a parent may hear the change through instead: a
   * drawer's `onClose` beside its `onOpenChange`. A parent listening on
   * any of them owns the value, as one passing `onChange` does.
   */
  readonly heardBy?: readonly OutputCell<never>[];
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
 *
 * A `value` with no `onChange` beside it has nobody to own it, so it is
 * where the control starts, and the control owns it from there; a new
 * value from the parent starts it again. A screen written as a picture
 * of a moment, `<Switch checked={true} />`, is then one a person can
 * use: the design tool's Play mode runs mocks written exactly so, and a
 * value that only the parent may change is what `readOnly` and
 * `disabled` say, not a missing handler.
 */
export function controlled<T>(options: ControlledOptions<T>): ControlledValue<T> {
  const { component, name, source, initial, fallback, onChange, heardBy = [] } = options;
  const isControlled = source.value !== undefined;
  if (isControlled && initial.value !== undefined) {
    throw new Error(
      `${component} was given both '${name}' and 'default${capitalize(name)}'. ` +
        `Pass '${name}' for the app to own the value, or 'default${capitalize(name)}' for the control to.`
    );
  }
  // `getValue`, not `value`: a parent's handler is often a new arrow on
  // each render, and this look is not a body's snapshot of it.
  const heard = [onChange, ...heardBy].some(output => output.getValue() !== undefined);
  if (isControlled && heard) {
    return {
      value: source.pipe(map(value => (value === undefined ? fallback : value))),
      current: () => (source.value === undefined ? fallback : source.value),
      change: next => onChange.emit(next)
    };
  }
  const start = isControlled ? source.value : initial.value;
  const own: InternalState<T> = internalState(start === undefined ? fallback : start);
  if (isControlled) {
    // The parent's later values, each a new start. The cell completes
    // with the component, which ends this with it; the host already
    // drops a value that is the one it holds.
    source.pipe(skip(1)).subscribe(value => (own.value = value === undefined ? fallback : value));
  }
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
