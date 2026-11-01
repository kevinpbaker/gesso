import { createEnvironmentKey, type UiEnvironmentKey, type UiNode } from 'gesso-core';

/** Inputs by component name, each a record of input names to values. */
export type StartingInputsByName = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/**
 * The inputs components under a node start with, by component name,
 * over what their parents pass; see `StartingInputs`. Empty outside one.
 */
export const StartingInputsKey: UiEnvironmentKey<StartingInputsByName> = createEnvironmentKey<StartingInputsByName>({
  name: 'gesso.startingInputs',
  defaultValue: {}
});

/** What a component named `name`, created at `anchor`, starts with: null for nothing. */
export function startingInputsFor(anchor: UiNode | null, name: string): Readonly<Record<string, unknown>> | null {
  for (let at: UiNode | null = anchor; at !== null; at = at.parent) {
    if (at.environment !== null) {
      return at.environment.get(StartingInputsKey)[name] ?? null;
    }
  }
  return null;
}
