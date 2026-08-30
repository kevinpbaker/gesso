import { UiEnvironment } from './UiEnvironment';
import type { UiEnvironmentKey } from './UiEnvironmentKey';

/**
 * Describes a set of environment values provided by a node.
 *
 * Provider nodes are regular UiNodes; the builder recognizes them
 * by their type or by an explicit provider declaration and uses
 * this structure to attach a child environment to the subtree.
 */
export interface UiEnvironmentProvider {
  readonly environment: UiEnvironment;
}

/**
 * Creates an environment provider from a parent environment and
 * one or more explicit key/value overrides.
 */
export function provideEnvironment(
  parent: UiEnvironment | null,
  values: ReadonlyArray<{ key: UiEnvironmentKey<unknown>; value: unknown }>
): UiEnvironmentProvider {
  let environment = parent ?? new UiEnvironment(null);
  for (const { key, value } of values) {
    environment = environment.set(key, value);
  }
  return { environment };
}
