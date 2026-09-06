import {
  classifyStorageError,
  storageReadFailure,
  storageReadValue,
  type StorageAdapter,
  type StorageOutcome,
  type StorageRead
} from './StorageAdapter';

export interface IndexedDbStorageOptions {
  /** The database. Default `'gesso'`. */
  readonly database?: string;
  /** The object store inside it. Default `'records'`. */
  readonly store?: string;
  /** The factory, for a spec. Default `globalThis.indexedDB`. */
  readonly factory?: IDBFactory;
}

/**
 * A store in IndexedDB.
 *
 * Beside OPFS rather than instead of it, because the two fail in
 * different places and an application picks by which failure it
 * minds. IndexedDB is reachable from every thread, survives longer
 * under a browser's own eviction, and is what a Safari that has
 * disabled OPFS still has; OPFS is faster for one large record and
 * simpler to inspect. Neither is a default the framework picks: an
 * application names the one it wants.
 *
 * One object store of strings keyed by string, which is the shape
 * `StorageAdapter` describes and no more. Indexes, versions past the
 * first, and cursors over ranges are what an application builds when
 * it has outgrown a key-value store, and at that point it is writing
 * against IndexedDB rather than against this.
 *
 * What happens on each failure:
 *
 * - **No `indexedDB`, or an origin that may not open one** (a private
 *   window in some browsers, a blocked third-party context): every
 *   method answers `denied`, and the open is retried next time rather
 *   than cached, because a `denied` can be lifted by a site setting
 *   mid-session.
 * - **The quota is spent**: the write answers `full`. IndexedDB
 *   reports this on the transaction rather than on the request, which
 *   is why the write waits for `oncomplete` and not for
 *   `onsuccess`: a put that succeeded into a transaction that then
 *   aborted has not been written, and answering `ok` for it would be
 *   the adapter assuming success.
 * - **A version change from another tab**: the connection is closed
 *   and dropped, so the next call opens a fresh one. Answering
 *   `failed` and holding a dead connection would make every later
 *   call fail too.
 * - **Anything else**: `failed`, with the platform's message.
 */
export class IndexedDbStorage implements StorageAdapter {
  private readonly database: string;
  private readonly store: string;
  private readonly factory: IDBFactory | undefined;
  private connecting: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDbStorageOptions = {}) {
    this.database = options.database ?? 'gesso';
    this.store = options.store ?? 'records';
    this.factory = options.factory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  }

  async read(key: string): Promise<StorageRead> {
    try {
      const value = await this.transact('readonly', store => store.get(key));
      return storageReadValue(typeof value === 'string' ? value : null);
    } catch (error) {
      return storageReadFailure(error);
    }
  }

  async write(key: string, value: string): Promise<StorageOutcome> {
    return this.outcomeOf(() => this.transact('readwrite', store => store.put(value, key)));
  }

  async remove(key: string): Promise<StorageOutcome> {
    return this.outcomeOf(() => this.transact('readwrite', store => store.delete(key)));
  }

  async keys(): Promise<readonly string[]> {
    try {
      const found = await this.transact('readonly', store => store.getAllKeys());
      return Array.isArray(found) ? found.filter((key): key is string => typeof key === 'string') : [];
    } catch {
      return [];
    }
  }

  /** Lets go of the connection, for a spec or an application shutting down. */
  close(): void {
    const connecting = this.connecting;
    this.connecting = null;
    void connecting?.then(
      database => database.close(),
      () => undefined
    );
  }

  private async outcomeOf(work: () => Promise<unknown>): Promise<StorageOutcome> {
    try {
      await work();
      return 'ok';
    } catch (error) {
      const outcome = classifyStorageError(error);
      if (outcome === 'denied') {
        this.connecting = null;
      }
      return outcome;
    }
  }

  /**
   * Runs one request inside one transaction and answers its result.
   *
   * A write resolves on the transaction completing rather than on the
   * request succeeding, because those are two different claims: the
   * second says the put was accepted, and only the first says it
   * reached the disk.
   */
  private async transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await this.connect();
    return new Promise<T>((resolve, reject) => {
      let answer: T;
      const transaction = database.transaction(this.store, mode);
      const request = run(transaction.objectStore(this.store));
      request.onsuccess = () => {
        answer = request.result;
      };
      request.onerror = () => reject(request.error ?? new Error('The request failed.'));
      transaction.oncomplete = () => resolve(answer);
      transaction.onabort = () => reject(transaction.error ?? new Error('The transaction was aborted.'));
    });
  }

  private connect(): Promise<IDBDatabase> {
    this.connecting ??= this.open();
    return this.connecting;
  }

  private open(): Promise<IDBDatabase> {
    const factory = this.factory;
    if (factory === undefined) {
      // A `TypeError`, which `classifyStorageError` reads as `denied`.
      return Promise.reject(new TypeError('This environment has no IndexedDB.'));
    }
    return new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(this.database, 1);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.store)) {
          request.result.createObjectStore(this.store);
        }
      };
      request.onsuccess = () => {
        // Another tab asking for a newer version cannot proceed while
        // this connection is open, so it is given up rather than held.
        request.result.onversionchange = () => this.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error('The database could not be opened.'));
      request.onblocked = () => reject(new Error('The database is open in another tab at a different version.'));
    });
  }
}
