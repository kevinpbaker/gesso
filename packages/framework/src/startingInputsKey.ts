import { createEnvironmentKey, type UiEnvironmentKey, type UiNode } from 'gesso-core';

/** One component's starting inputs: input names to values. */
export type StartingInputsRecord = Readonly<Record<string, unknown>>;

/**
 * Starting inputs by component name: one record for every instance of
 * it, or a list for each in the order they are made (`null` for one
 * left as written), so the second of three switches can start on.
 */
export type StartingInputsByName = Readonly<
  Record<string, StartingInputsRecord | readonly (StartingInputsRecord | null)[]>
>;

/**
 * The inputs components under a node start with, by component name,
 * over what their parents pass; see `StartingInputs`. Empty outside one.
 */
export const StartingInputsKey: UiEnvironmentKey<StartingInputsByName> = createEnvironmentKey<StartingInputsByName>({
  name: 'gesso.startingInputs',
  defaultValue: {}
});

/** How many of each name have been made under each set of starting inputs, for a list's next. */
const made = new WeakMap<StartingInputsByName, Map<string, number>>();

/** What a component named `name`, made at `anchor`, starts with: null for nothing. */
export function startingInputsFor(anchor: UiNode | null, name: string): StartingInputsRecord | null {
  for (let at: UiNode | null = anchor; at !== null; at = at.parent) {
    if (at.environment !== null) {
      const all = at.environment.get(StartingInputsKey);
      const given = all[name];
      if (given === undefined) {
        return null;
      }
      if (!Array.isArray(given)) {
        return given as StartingInputsRecord;
      }
      let counts = made.get(all);
      if (counts === undefined) {
        counts = new Map();
        made.set(all, counts);
      }
      const index = counts.get(name) ?? 0;
      counts.set(name, index + 1);
      return (given as readonly (StartingInputsRecord | null)[])[index] ?? null;
    }
  }
  return null;
}
