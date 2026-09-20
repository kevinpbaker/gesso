/**
 * What a store did with a request.
 *
 * Four words rather than an exception, because three of them are
 * ordinary outcomes an application routes around rather than faults it
 * reports. A browser that refuses storage in a private window, and a
 * quota that has run out, are both things a running application has to
 * carry on through, and making every caller wrap a `try` around a read
 * to discover which one happened is how storage code ends up assuming
 * success.
 *
 * - `ok`: the store answered. For a read that includes "there is no
 *   such record", which is `value: null` and not a failure.
 * - `denied`: the platform will not let this origin store anything.
 *   No OPFS in this browser, a private window that refuses IndexedDB,
 *   `localStorage` blocked by a site setting. Permanent for the
 *   session: nothing an application does will change the answer, so
 *   asking again is wasted work.
 * - `full`: the quota is spent. Temporary, and worth trying again
 *   after something has been given back, which is why it is not
 *   `denied`.
 * - `failed`: anything else. A half-written file, a corrupt database,
 *   a transaction that aborted for a reason the platform did not
 *   explain.
 */
export type StorageOutcome = 'ok' | 'denied' | 'full' | 'failed';

/** What came back from a read. */
export interface StorageRead {
  readonly outcome: StorageOutcome;
  /** The record, or null when there is none or the read did not answer. */
  readonly value: string | null;
  /** Why it did not answer, as a message; null when it did. */
  readonly error: string | null;
}

/**
 * Somewhere an application's state survives being closed.
 *
 * Four methods over text keyed by a string, which is the shape all
 * three implementations can actually keep. Bytes are deliberately not
 * in it: `localStorage` cannot hold them, so an interface that
 * promised them would be one the shell route could not implement, and
 * an application storing pictures wants a store of its own with an
 * eviction policy rather than this. the
 * artwork cache is that other thing.
 *
 * Nothing rejects. Every method answers with an outcome, and the
 * per-failure behaviour is the implementation's to document; the three
 * in this package all follow `classifyStorageError`.
 *
 * It is a shape and not a service. Nothing in the framework holds one,
 * `persisted` takes whichever one it is given, and an application with
 * its own store implements four methods rather than adopting anything.
 */
export interface StorageAdapter {
  /** Reads one record. */
  read(key: string): Promise<StorageRead>;
  /** Writes one record, replacing whatever was there. */
  write(key: string, value: string): Promise<StorageOutcome>;
  /** Removes one record. Removing what is not there is `ok`. */
  remove(key: string): Promise<StorageOutcome>;
  /** Every key this store holds, for an application that evicts its own. */
  keys(): Promise<readonly string[]>;
}

/**
 * Which of the four outcomes a thrown platform error is.
 *
 * The names are the ones the storage APIs actually throw.
 * `QuotaExceededError` is the DOM's word for full, and every browser
 * uses it for OPFS, IndexedDB and `localStorage` alike. `SecurityError`
 * and `NotAllowedError` are what a blocked origin gets. A missing API
 * (no `navigator.storage`, no `indexedDB`) is a `TypeError` here and
 * is `denied` for the same reason: nothing the application does will
 * produce a store.
 */
export function classifyStorageError(error: unknown): StorageOutcome {
  const name = error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return 'full';
  }
  if (name === 'SecurityError' || name === 'NotAllowedError' || name === 'TypeError') {
    return 'denied';
  }
  return 'failed';
}

/** A thrown value as the message a screen could show. */
export function storageErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A read that could not answer, as one record. */
export function storageReadFailure(error: unknown): StorageRead {
  return { outcome: classifyStorageError(error), value: null, error: storageErrorMessage(error) };
}

/** A read that answered, whether or not it found anything. */
export function storageReadValue(value: string | null): StorageRead {
  return { outcome: 'ok', value, error: null };
}

/**
 * The same contract in memory, for specs and for a platform with no
 * store at all.
 *
 * Not a fallback anything installs on its own. An application that
 * would rather run with an unremembered session than fail says so by
 * passing one of these; one that would rather tell the person its
 * settings will not be kept reads the `denied` outcome and says so.
 * Choosing between those two on an application's behalf is exactly the
 * kind of decision the thread model keeps out of the framework.
 */
export class MemoryStorage implements StorageAdapter {
  private readonly records = new Map<string, string>();
  /** Written by a spec that wants to see what a full store does. */
  full = false;

  read(key: string): Promise<StorageRead> {
    return Promise.resolve(storageReadValue(this.records.get(key) ?? null));
  }

  write(key: string, value: string): Promise<StorageOutcome> {
    if (this.full) {
      return Promise.resolve('full');
    }
    this.records.set(key, value);
    return Promise.resolve('ok');
  }

  remove(key: string): Promise<StorageOutcome> {
    this.records.delete(key);
    return Promise.resolve('ok');
  }

  keys(): Promise<readonly string[]> {
    return Promise.resolve([...this.records.keys()]);
  }
}
