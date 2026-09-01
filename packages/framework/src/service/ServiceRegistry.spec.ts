import { describe, expect, it } from 'vitest';

import { ServiceRegistry } from './ServiceRegistry';

/**
 * The registry's identity rules, and the one place they bend.
 *
 * A registry keyed by the class object is right for everything except
 * hot module replacement, which produces a new class object for the
 * same service. `adopt` is what lets a rebuilt tree find the instance
 * that was already there.
 */
class Counter {
  count = 0;
}

/** What a replaced module produces: same name, different object. */
function replacementFor(name: string): new () => { count: number } {
  const Replacement = class {
    count = 0;
  };
  Object.defineProperty(Replacement, 'name', { value: name });
  return Replacement;
}

describe('ServiceRegistry', () => {
  it('registers a service once and hands back the same instance', () => {
    const registry = new ServiceRegistry();
    const service = registry.register(Counter);

    expect(registry.get(Counter)).toBe(service);
    expect(() => registry.register(Counter)).toThrow(/already registered/);
  });

  it('does not know a class it has never seen', () => {
    const registry = new ServiceRegistry();

    expect(() => registry.get(Counter)).toThrow(/not registered/);
  });

  describe('adopt', () => {
    it('re-keys a same-named replacement and keeps the instance', () => {
      const registry = new ServiceRegistry();
      registry.register(Counter).count = 7;
      const Replacement = replacementFor('Counter');

      expect(registry.adopt(Replacement)).toBe(true);

      // The state survives, which is the whole point: the samples a
      // service has taken outlive the module that declared it.
      expect(registry.get(Replacement).count).toBe(7);
      // And the old key is gone, so nothing can reach it twice.
      expect(registry.has(Counter)).toBe(false);
    });

    it('says no for a service it has never heard of', () => {
      const registry = new ServiceRegistry();

      expect(registry.adopt(Counter)).toBe(false);
    });

    it('is a no-op for the class it already holds', () => {
      const registry = new ServiceRegistry();
      const service = registry.register(Counter);

      expect(registry.adopt(Counter)).toBe(true);
      expect(registry.get(Counter)).toBe(service);
    });

    it('refuses when the name is ambiguous rather than picking one', () => {
      const registry = new ServiceRegistry();
      registry.register(replacementFor('Counter'));
      registry.register(replacementFor('Counter'));

      expect(() => registry.adopt(replacementFor('Counter'))).toThrow(/share that name/);
    });
  });

  it('says what a same-named class probably means, rather than contradicting itself', () => {
    // The plain message reads as nonsense here: the service is right
    // there in the list it prints.
    const registry = new ServiceRegistry();
    registry.register(Counter);

    expect(() => registry.get(replacementFor('Counter'))).toThrow(/hot-replaced/);
  });
});
