import type { UiEnvironmentKey } from './UiEnvironmentKey';

/**
 * A scoped environment snapshot.
 *
 * Environments form a parent chain. Lookup walks up the chain and
 * returns the value from the nearest ancestor that provides the
 * requested key. If no ancestor provides it, the key's default
 * value is returned.
 *
 * Environments are immutable snapshots. When a provider changes an
 * environment value, a new environment instance is created and
 * attached to the affected subtree. This makes the environment
 * chain safe to cache on nodes and to reason about in tests.
 */
export class UiEnvironment {
  constructor(
    public readonly parent: UiEnvironment | null,
    private readonly values: ReadonlyMap<string, unknown> = new Map()
  ) {}

  /**
   * Returns a new environment identical to this one but with the
   * supplied key set to the supplied value.
   */
  set<T>(key: UiEnvironmentKey<T>, value: T): UiEnvironment {
    const next = new Map(this.values);
    next.set(key.name, value);
    return new UiEnvironment(this.parent, next);
  }

  /**
   * Returns a new environment identical to this one but with the
   * supplied key removed, exposing the parent value (or the key's
   * default) to consumers of the new environment.
   */
  delete<T>(key: UiEnvironmentKey<T>): UiEnvironment {
    const next = new Map(this.values);
    next.delete(key.name);
    return new UiEnvironment(this.parent, next);
  }

  /**
   * Looks up the nearest value for a key.
   */
  get<T>(key: UiEnvironmentKey<T>): T {
    if (this.values.has(key.name)) {
      return this.values.get(key.name) as T;
    }
    return this.parent !== null ? this.parent.get(key) : key.defaultValue;
  }

  /**
   * Returns true when this environment or an ancestor provides a
   * value for the key.
   */
  has<T>(key: UiEnvironmentKey<T>): boolean {
    if (this.values.has(key.name)) {
      return true;
    }
    return this.parent !== null ? this.parent.has(key) : false;
  }

  /**
   * The keys explicitly provided by this environment (not inherited
   * from parents).
   */
  providedKeys(): Iterable<string> {
    return this.values.keys();
  }

  /**
   * How many keys this environment provides itself.
   *
   * Comparing two environments starts here: differing counts settle it
   * without looking at a single value.
   */
  get providedSize(): number {
    return this.values.size;
  }

  /**
   * This environment's own value for a name, without consulting the
   * parent chain.
   *
   * Comparison needs the value a given environment provides rather
   * than the one it resolves, and needs it by name — the key object is
   * looked up separately, so probing through `get()` would mean
   * allocating a throwaway key per name per node.
   */
  getOwn(name: string): unknown {
    return this.values.get(name);
  }

  /**
   * Whether this environment provides a name itself, ignoring the
   * parent chain.
   */
  providesOwn(name: string): boolean {
    return this.values.has(name);
  }
}
