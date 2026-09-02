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
 * Sugar over the controlled contract, not a replacement for it: when
 * the value belongs to a store or a channel, pass the cell and a
 * handler that sends the command.
 */
export function bind<T>(cell: InternalState<T>): { value: InternalState<T>; onChange: (next: T) => void };
export function bind<T, V extends string, E extends string = 'onChange'>(
  cell: InternalState<T>,
  value: V,
  onChange?: E
): { [K in V]: InternalState<T> } & { [K in E]: (next: T) => void };
export function bind<T>(cell: InternalState<T>, value = 'value', onChange = 'onChange'): Record<string, unknown> {
  return {
    [value]: cell,
    [onChange]: (next: T) => {
      cell.value = next;
    }
  };
}
