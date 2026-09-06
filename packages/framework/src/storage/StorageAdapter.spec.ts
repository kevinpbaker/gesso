import { describe, expect, it } from 'vitest';

import { classifyStorageError, MemoryStorage, storageReadFailure, storageReadValue } from './StorageAdapter';

/** A `DOMException` as a browser throws it, without needing one. */
function named(name: string, message = 'refused'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('classifyStorageError', () => {
  it('reads a spent quota as full', () => {
    expect(classifyStorageError(named('QuotaExceededError'))).toBe('full');
    expect(classifyStorageError(named('NS_ERROR_DOM_QUOTA_REACHED'))).toBe('full');
  });

  it('reads a blocked origin and a missing API as denied', () => {
    expect(classifyStorageError(named('SecurityError'))).toBe('denied');
    expect(classifyStorageError(named('NotAllowedError'))).toBe('denied');
    // What a platform without the API throws, which is the same
    // answer as far as an application is concerned: there is no store
    // and nothing it does will make one.
    expect(classifyStorageError(new TypeError('no such thing'))).toBe('denied');
  });

  it('reads everything else as failed', () => {
    expect(classifyStorageError(named('AbortError'))).toBe('failed');
    expect(classifyStorageError('a string')).toBe('failed');
  });
});

describe('read records', () => {
  it('says nothing stored without saying anything failed', () => {
    expect(storageReadValue(null)).toEqual({ outcome: 'ok', value: null, error: null });
  });

  it('carries the message rather than the error', () => {
    // A message crosses the barrier and is what a screen shows; an
    // `Error` is neither, which is the same call `resource` makes.
    expect(storageReadFailure(named('QuotaExceededError', 'no room'))).toEqual({
      outcome: 'full',
      value: null,
      error: 'no room'
    });
  });
});

describe('MemoryStorage', () => {
  it('reads back what it was given', async () => {
    const store = new MemoryStorage();

    expect(await store.write('a', '1')).toBe('ok');
    expect(await store.read('a')).toEqual({ outcome: 'ok', value: '1', error: null });
    expect(await store.keys()).toEqual(['a']);
  });

  it('says a key it does not hold is not there', async () => {
    expect(await new MemoryStorage().read('missing')).toEqual({ outcome: 'ok', value: null, error: null });
  });

  it('removes, and removing what is not there is fine', async () => {
    const store = new MemoryStorage();
    await store.write('a', '1');

    expect(await store.remove('a')).toBe('ok');
    expect(await store.remove('a')).toBe('ok');
    expect(await store.keys()).toEqual([]);
  });

  it('refuses a write when told it is full', async () => {
    const store = new MemoryStorage();
    store.full = true;

    expect(await store.write('a', '1')).toBe('full');
    expect((await store.read('a')).value).toBeNull();
  });
});
