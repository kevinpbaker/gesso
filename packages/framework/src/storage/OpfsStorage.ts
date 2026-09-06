import {
  classifyStorageError,
  storageReadFailure,
  storageReadValue,
  type StorageAdapter,
  type StorageOutcome,
  type StorageRead
} from './StorageAdapter';

/**
 * As much of the Origin Private File System as a store needs.
 *
 * Written out rather than taken from `lib.dom`, for two reasons. The
 * workspace's `lib` is `ES2023` and `DOM`, which has the handles but
 * not the async iteration `values()` needs, and a structural type is
 * what lets a spec hand this a directory of its own instead of
 * standing up a file system to test four methods.
 */
export interface OpfsDirectory {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirectory>;
  removeEntry(name: string): Promise<void>;
  keys(): AsyncIterable<string>;
}

export interface OpfsFileHandle {
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<OpfsWritable>;
}

export interface OpfsWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface OpfsStorageOptions {
  /**
   * The folder under the origin's private root, so two stores in one
   * application do not share a namespace. Default `'gesso'`.
   */
  readonly directory?: string;
  /** The root, for a spec. Default `navigator.storage.getDirectory()`. */
  readonly root?: () => Promise<OpfsDirectory>;
}

/**
 * A store in the origin's private file system.
 *
 * The right default for an application's own state. It is reachable
 * from a worker, which `localStorage` is not, so the thread that owns
 * the state is the thread that writes it and nothing has to cross the
 * barrier to be remembered. It is asynchronous throughout, so nothing
 * it does blocks a frame. And it is per-origin and invisible to the
 * person, which is the right place for a queue or a draft and the
 * wrong place for anything they should be able to find and delete.
 *
 * One file per key, named by the key with the characters a file system
 * would refuse escaped, so a key is recoverable from a listing and a
 * key containing a slash cannot reach out of the folder.
 *
 * What happens on each failure:
 *
 * - **The platform has no OPFS**, or the browser refuses it (a private
 *   window, a blocked origin): every method answers `denied` and the
 *   error message says which. The store is not usable this session and
 *   `persisted` stops writing to it after the first denial.
 * - **The quota is spent**: the write answers `full`. Nothing is
 *   rolled back, because the value the application holds is the real
 *   one and only the remembering failed.
 * - **There is no such record**: the read answers `ok` with `null`.
 *   Not having been written yet is the ordinary first run, not a
 *   failure.
 * - **Anything else**: `failed`, with the platform's message. A file
 *   whose *contents* are not what this version writes is a different
 *   thing and is `persisted`'s to judge, which it does by discarding
 *   it, the same call `Tokens.ts` makes.
 */
export class OpfsStorage implements StorageAdapter {
  private readonly folder: string;
  private readonly rootOf: () => Promise<OpfsDirectory>;
  /** The folder, once opened. Reused, because opening it is a round trip. */
  private opening: Promise<OpfsDirectory> | null = null;

  constructor(options: OpfsStorageOptions = {}) {
    this.folder = options.directory ?? 'gesso';
    this.rootOf = options.root ?? defaultRoot;
  }

  async read(key: string): Promise<StorageRead> {
    try {
      const directory = await this.open();
      const handle = await directory.getFileHandle(fileFor(key));
      return storageReadValue(await (await handle.getFile()).text());
    } catch (error) {
      // A file that is not there is the ordinary answer to "is
      // anything remembered", and the platform says so by throwing
      // `NotFoundError`. It is not a failure and it is not `denied`.
      if (error instanceof Error && error.name === 'NotFoundError') {
        return storageReadValue(null);
      }
      return storageReadFailure(error);
    }
  }

  async write(key: string, value: string): Promise<StorageOutcome> {
    try {
      const directory = await this.open();
      const handle = await directory.getFileHandle(fileFor(key), { create: true });
      const writable = await handle.createWritable();
      // Written and closed in one go rather than kept open: a handle
      // held across frames is a handle a reload can leave locked.
      await writable.write(value);
      await writable.close();
      return 'ok';
    } catch (error) {
      return classifyStorageError(error);
    }
  }

  async remove(key: string): Promise<StorageOutcome> {
    try {
      await (await this.open()).removeEntry(fileFor(key));
      return 'ok';
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        return 'ok';
      }
      return classifyStorageError(error);
    }
  }

  async keys(): Promise<readonly string[]> {
    try {
      const found: string[] = [];
      for await (const name of (await this.open()).keys()) {
        found.push(keyFor(name));
      }
      return found;
    } catch {
      // A listing that cannot be taken is an empty one. The caller is
      // an application evicting its own records, and evicting nothing
      // is the safe answer to not knowing what is there.
      return [];
    }
  }

  /**
   * The folder, opened once and kept.
   *
   * A failed open is *not* kept. A rejected promise left in `opening`
   * would answer every later call with the same rejection, so one
   * refusal at start-up would be a store that never worked again even
   * after the person granted storage or made room. Kept when it
   * succeeds, dropped when it does not, which is one line and the
   * difference between a cache and a poison.
   */
  private open(): Promise<OpfsDirectory> {
    if (this.opening === null) {
      const opening = this.rootOf().then(root => root.getDirectoryHandle(this.folder, { create: true }));
      this.opening = opening;
      opening.catch(() => {
        if (this.opening === opening) {
          this.opening = null;
        }
      });
    }
    return this.opening;
  }
}

function defaultRoot(): Promise<OpfsDirectory> {
  const storage = (globalThis as { navigator?: { storage?: { getDirectory?: () => Promise<OpfsDirectory> } } })
    .navigator?.storage;
  if (storage?.getDirectory === undefined) {
    // A `TypeError`, which `classifyStorageError` reads as `denied`:
    // there is no store here and there will not be one.
    return Promise.reject(new TypeError('This environment has no Origin Private File System.'));
  }
  return storage.getDirectory();
}

/**
 * A key as a file name.
 *
 * `encodeURIComponent` and not a hash, so a listing of the folder in
 * devtools reads as the keys the application wrote. It escapes the
 * slash and the dot, which is what stops a key reaching a directory it
 * was not given.
 */
function fileFor(key: string): string {
  return `${encodeURIComponent(key)}.json`;
}

function keyFor(name: string): string {
  return decodeURIComponent(name.replace(/\.json$/, ''));
}
