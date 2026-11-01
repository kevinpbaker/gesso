import { createEnvironmentKey } from 'gesso-core';

import type { ComponentContext } from './FunctionComponent';
import { internalState, type InternalState } from './InternalState';

/**
 * Named values the components under one node share, with no
 * application behind them: what one screen of a prototype was given
 * (an email typed on Forgot password), shown by the next (Check email),
 * or a wizard's steps passing on what was filled in.
 *
 * A node provides a store to what it holds,
 * `provide={[provided(SharedValuesKey, values)]}`, and a component asks
 * for a value by name with `sharedValue(ctx, name, start)`. Under a
 * store, every component asking for the same name has the same cell;
 * with none above, each has its own, at its own start. So a design tool
 * can draw a screen on its board as written, each frame alone, and play
 * it with the screens before it.
 *
 * It is not where an application's state goes. That survives a reload
 * and is on a channel, written by a command; these are cells, written
 * by whatever holds one, and gone with the store.
 */
export class SharedValues {
  private readonly cells = new Map<string, { readonly cell: InternalState<unknown>; readonly start: unknown }>();

  /** Every value by name, as it is now, in the order each was first asked for. */
  readonly values = internalState<ReadonlyMap<string, unknown>>(new Map());

  /** The value named `name`: made at `start` by the first to ask, and the same cell for each after. */
  cell<T>(name: string, start: T): InternalState<T> {
    let found = this.cells.get(name);
    if (found === undefined) {
      const cell = internalState<unknown>(start);
      cell.label = `shared.${name}`;
      found = { cell, start };
      this.cells.set(name, found);
      cell.subscribe(() => this.publish());
    }
    return found.cell as InternalState<T>;
  }

  /** Writes a value by name, as a component holding it would; a name nobody has asked for is ignored. */
  set(name: string, value: unknown): void {
    const found = this.cells.get(name);
    if (found !== undefined) {
      found.cell.value = value;
    }
  }

  /** Every value back at the start it was made with. */
  reset(): void {
    for (const { cell, start } of this.cells.values()) {
      cell.value = start;
    }
  }

  private publish(): void {
    this.values.value = new Map([...this.cells].map(([name, { cell }]) => [name, cell.getValue()]));
  }
}

/** Where a node provides a `SharedValues` to what it holds. */
export const SharedValuesKey = createEnvironmentKey<SharedValues | null>({
  name: 'gesso.sharedValues',
  defaultValue: null
});

/**
 * A value by name: the cell the nearest `SharedValues` above holds for
 * it, shared with every component asking for it there; with none
 * above, a cell of this component's own, at `start`. Bind it as any
 * cell: `<TextInput {...bind(email)} />`.
 */
export function sharedValue<T>(ctx: ComponentContext, name: string, start: T): InternalState<T> {
  const store = ctx.environment(SharedValuesKey);
  return store === null ? internalState(start) : store.cell(name, start);
}
