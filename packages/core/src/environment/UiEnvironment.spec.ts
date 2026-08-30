import { describe, expect, it } from 'vitest';

import { UiEnvironment } from './UiEnvironment';
import { createEnvironmentKey } from './UiEnvironmentKey';

const key = createEnvironmentKey<string>({ name: 'test', defaultValue: 'default' });

describe('UiEnvironment', () => {
  it('returns a key default when no value is provided', () => {
    const env = new UiEnvironment(null);
    expect(env.get(key)).toBe('default');
  });

  it('returns a directly provided value', () => {
    const env = new UiEnvironment(null).set(key, 'provided');
    expect(env.get(key)).toBe('provided');
  });

  it('walks up the parent chain to find a value', () => {
    const parent = new UiEnvironment(null).set(key, 'parent');
    const child = new UiEnvironment(parent);
    expect(child.get(key)).toBe('parent');
  });

  it('shadows parent values in child environments', () => {
    const parent = new UiEnvironment(null).set(key, 'parent');
    const child = new UiEnvironment(parent).set(key, 'child');
    expect(child.get(key)).toBe('child');
    expect(parent.get(key)).toBe('parent');
  });

  it('reports whether a key is provided locally or inherited', () => {
    const parent = new UiEnvironment(null).set(key, 'parent');
    const child = new UiEnvironment(parent);
    expect(child.has(key)).toBe(true);
    expect(parent.has(key)).toBe(true);
    expect(new UiEnvironment(null).has(key)).toBe(false);
  });

  it('deletes locally provided values, exposing inherited defaults', () => {
    const parent = new UiEnvironment(null).set(key, 'parent');
    const child = new UiEnvironment(parent).set(key, 'child');
    const reset = child.delete(key);
    expect(reset.get(key)).toBe('parent');
    expect(child.get(key)).toBe('child');
  });

  it('lists the keys provided locally', () => {
    const env = new UiEnvironment(null).set(key, 'value');
    expect(Array.from(env.providedKeys())).toEqual(['test']);
  });

  it('is immutable', () => {
    const env = new UiEnvironment(null);
    const next = env.set(key, 'value');
    expect(env.get(key)).toBe('default');
    expect(next.get(key)).toBe('value');
  });
});
