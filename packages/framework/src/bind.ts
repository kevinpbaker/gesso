import type { ReadableCell } from './Input';
import type { InternalState } from './InternalState';

/**
 * A two-way binding for the plain case: the cell is the control's value,
 * and the control's changes are written back into the cell.
 *
 *   const volume = internalState(0.8);
 *   <Slider {...bind(volume)} />
 *
 * Spread onto a control that takes `value` and `onChange`, or name the
 * pair for one that calls them something else:
 *
 *   <Checkbox {...bind(muted, 'checked')} />
 *
 * A value that lives across the barrier is read from a channel key and
 * written with a command, which is two halves of one binding, so it
 * takes the same shape with the write said out loud:
 *
 *   <TextInput {...bind(library.view.filter, library.send.setFilter)} />
 *
 * That is the form a real form wants. A screen's fields are almost
 * never a component's own state: they are the application's, they
 * survive the screen, and they are on a channel. The cell is read-only
 * there, as an input is, and the command is what writes it, so the
 * round trip through the application thread is visible at the call
 * site rather than hidden by a helper pretending the key is writable.
 *
 * Sugar over the controlled contract, not a replacement for it.
 */
export function bind<T>(cell: InternalState<T>): { value: InternalState<T>; onChange: (next: T) => void };
export function bind<T, V extends string, E extends string = 'onChange'>(
  cell: InternalState<T>,
  value: V,
  onChange?: E
): { [K in V]: InternalState<T> } & { [K in E]: (next: T) => void };
export function bind<T>(
  cell: ReadableCell<T>,
  write: (next: T) => void
): { value: ReadableCell<T>; onChange: (next: T) => void };
export function bind<T, V extends string, E extends string = 'onChange'>(
  cell: ReadableCell<T>,
  write: (next: T) => void,
  value: V,
  onChange?: E
): { [K in V]: ReadableCell<T> } & { [K in E]: (next: T) => void };
export function bind<T>(
  cell: ReadableCell<T>,
  second?: ((next: T) => void) | string,
  third?: string,
  fourth?: string
): Record<string, unknown> {
  const writing = typeof second === 'function';
  const write =
    second === undefined || !writing
      ? (next: T) => {
          (cell as InternalState<T>).value = next;
        }
      : second;
  const value = (writing ? third : (second as string | undefined)) ?? 'value';
  const onChange = (writing ? fourth : third) ?? 'onChange';
  return { [value]: cell, [onChange]: write };
}
