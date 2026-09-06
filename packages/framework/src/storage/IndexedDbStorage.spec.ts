import { describe, expect, it } from 'vitest';

import { IndexedDbStorage } from './IndexedDbStorage';

function named(name: string, message = 'refused'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/**
 * As much of IndexedDB as the adapter touches.
 *
 * There is no `fake-indexeddb` in the workspace and no browser under
 * the suite, so the database is a `Map` and the API around it is the
 * request-and-event shape the adapter is written against. What this
 * exists to pin is exactly that shape: that a write waits for the
 * transaction rather than the request, and that an abort reaches the
 * caller as the outcome it is.
 */
class FakeDatabase {
  readonly records = new Map<string, string>();
  /** Thrown by the next write, once, as a real quota failure would be. */
  next: Error | null = null;
  closed = false;
  onversionchange: (() => void) | null = null;

  readonly objectStoreNames = { contains: (): boolean => true };

  createObjectStore(): void {
    // The store is the Map, which is always there.
  }

  close(): void {
    this.closed = true;
  }

  transaction(): FakeTransaction {
    return new FakeTransaction(this);
  }
}

class FakeTransaction {
  error: Error | null = null;
  oncomplete: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor(private readonly database: FakeDatabase) {}

  objectStore(): FakeStore {
    return new FakeStore(this.database, this);
  }

  /** Runs the work a microtask later, so the caller's handlers are set. */
  run<T>(work: () => T): FakeRequest<T> {
    const request = new FakeRequest<T>();
    queueMicrotask(() => {
      try {
        request.result = work();
        request.onsuccess?.();
        this.oncomplete?.();
      } catch (error) {
        request.error = error as Error;
        this.error = error as Error;
        request.onerror?.();
        this.onabort?.();
      }
    });
    return request;
  }
}

class FakeRequest<T> {
  result!: T;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class FakeStore {
  constructor(
    private readonly database: FakeDatabase,
    private readonly transaction: FakeTransaction
  ) {}

  get(key: string): FakeRequest<string | undefined> {
    return this.transaction.run(() => this.database.records.get(key));
  }

  put(value: string, key: string): FakeRequest<void> {
    return this.transaction.run(() => {
      const refusal = this.database.next;
      if (refusal !== null) {
        this.database.next = null;
        throw refusal;
      }
      this.database.records.set(key, value);
    });
  }

  delete(key: string): FakeRequest<void> {
    return this.transaction.run(() => {
      this.database.records.delete(key);
    });
  }

  getAllKeys(): FakeRequest<string[]> {
    return this.transaction.run(() => [...this.database.records.keys()]);
  }
}

class FakeOpenRequest {
  result!: FakeDatabase;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onblocked: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
}

function factoryFor(database: FakeDatabase, refuse?: () => Error | null): { factory: IDBFactory; opens: () => number } {
  let opens = 0;
  const factory = {
    open: (): FakeOpenRequest => {
      opens++;
      const request = new FakeOpenRequest();
      queueMicrotask(() => {
        const refusal = refuse?.() ?? null;
        if (refusal !== null) {
          request.error = refusal;
          request.onerror?.();
          return;
        }
        request.result = database;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
  return { factory: factory as unknown as IDBFactory, opens: () => opens };
}

describe('IndexedDbStorage', () => {
  it('writes and reads a record back', async () => {
    const database = new FakeDatabase();
    const store = new IndexedDbStorage({ factory: factoryFor(database).factory });

    expect(await store.write('settings', '{"dark":true}')).toBe('ok');
    expect(await store.read('settings')).toEqual({ outcome: 'ok', value: '{"dark":true}', error: null });
  });

  it('says a key it does not hold is not there', async () => {
    const store = new IndexedDbStorage({ factory: factoryFor(new FakeDatabase()).factory });

    expect(await store.read('settings')).toEqual({ outcome: 'ok', value: null, error: null });
  });

  it('answers full when the transaction aborts on a quota', async () => {
    const database = new FakeDatabase();
    const store = new IndexedDbStorage({ factory: factoryFor(database).factory });
    database.next = named('QuotaExceededError', 'no room');

    expect(await store.write('settings', 'a')).toBe('full');
    expect(database.records.size).toBe(0);
    // Not denied, so the next one is still tried.
    expect(await store.write('settings', 'a')).toBe('ok');
  });

  it('answers denied with no IndexedDB at all', async () => {
    const store = new IndexedDbStorage({ factory: undefined });

    const read = await store.read('settings');
    expect(read.outcome).toBe('denied');
    expect(await store.write('settings', 'a')).toBe('denied');
  });

  it('answers denied when the origin may not open one', async () => {
    const store = new IndexedDbStorage({
      factory: factoryFor(new FakeDatabase(), () => named('SecurityError')).factory
    });

    expect((await store.read('settings')).outcome).toBe('denied');
  });

  it('opens the database once and reuses it', async () => {
    const database = new FakeDatabase();
    const opened = factoryFor(database);
    const store = new IndexedDbStorage({ factory: opened.factory });

    await store.write('a', '1');
    await store.write('b', '2');
    await store.keys();

    expect(opened.opens()).toBe(1);
  });

  it('lists and removes', async () => {
    const store = new IndexedDbStorage({ factory: factoryFor(new FakeDatabase()).factory });

    await store.write('a', '1');
    await store.write('b', '2');
    expect(await store.keys()).toEqual(['a', 'b']);

    expect(await store.remove('a')).toBe('ok');
    expect(await store.keys()).toEqual(['b']);
  });

  it('gives up the connection when another tab wants a new version', async () => {
    const database = new FakeDatabase();
    const store = new IndexedDbStorage({ factory: factoryFor(database).factory });
    await store.write('a', '1');

    database.onversionchange?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(database.closed).toBe(true);
  });
});
