/**
 * Where the shell remembers file and folder handles, apart from the rest
 * of `shellFiles.ts`.
 *
 * Its own module so that what the render side needs of it,
 * `rememberedDirectory`, can be exported from the package without
 * bringing the pickers, the reads and the writes with it: those are
 * loaded when a page first asks for a file (see `WorkerApp` and
 * `GessoApp`), and a static path to them from the package's index kept
 * them in the first chunk of every application that also used one.
 */

/** The slice of a `FileSystemFileHandle` used here. */
export interface ShellFileHandle {
  readonly kind?: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable?(): Promise<{ write(data: string | Uint8Array<ArrayBuffer>): Promise<void>; close(): Promise<void> }>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  isSameEntry?(other: ShellFileHandle): Promise<boolean>;
}

/** The slice of a `FileSystemDirectoryHandle` used here. */
export interface ShellDirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  isSameEntry?(other: ShellFileHandle | ShellDirectoryHandle): Promise<boolean>;
}

export type AnyHandle = ShellFileHandle | ShellDirectoryHandle;

/** A remembered handle, as the store keeps it. */
export interface StoredFileHandle {
  readonly id: number;
  readonly handle: AnyHandle;
  readonly name: string;
  readonly used: number;
}

/** Where handles are remembered. IndexedDB in a browser; a map in a spec. */
export interface ShellHandleStore {
  all(): Promise<StoredFileHandle[]>;
  /** Stores an entry, allocating an id when it has none, and answers the id. */
  put(entry: {
    readonly id?: number;
    readonly handle: AnyHandle;
    readonly name: string;
    readonly used: number;
  }): Promise<number>;
  delete(id: number): Promise<void>;
}

const DATABASE = 'gesso-shell-files';
const HANDLES = 'handles';

/**
 * Handles kept in IndexedDB, which is one of the few places a
 * `FileSystemFileHandle` can be put: it is structured-cloneable, and a
 * store of them is what the platform intends "recent files" to be.
 * The database is opened on first use, so a page that never touches a
 * file never creates one.
 */
export class IndexedDbHandleStore implements ShellHandleStore {
  private opened: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory) {}

  async all(): Promise<StoredFileHandle[]> {
    const db = await this.database();
    return request(db.transaction(HANDLES, 'readonly').objectStore(HANDLES).getAll()) as Promise<StoredFileHandle[]>;
  }

  async put(entry: { id?: number; handle: AnyHandle; name: string; used: number }): Promise<number> {
    const db = await this.database();
    const key = await request(db.transaction(HANDLES, 'readwrite').objectStore(HANDLES).put(entry));
    return key as number;
  }

  async delete(id: number): Promise<void> {
    const db = await this.database();
    await request(db.transaction(HANDLES, 'readwrite').objectStore(HANDLES).delete(id));
  }

  private database(): Promise<IDBDatabase> {
    this.opened ??= new Promise((resolve, reject) => {
      const open = this.factory.open(DATABASE, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(HANDLES, { keyPath: 'id', autoIncrement: true });
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return this.opened;
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** A store that forgets, for a window with no IndexedDB. */
export class MemoryHandleStore implements ShellHandleStore {
  private readonly entries = new Map<number, StoredFileHandle>();
  private next = 1;

  all(): Promise<StoredFileHandle[]> {
    return Promise.resolve([...this.entries.values()]);
  }

  put(entry: { id?: number; handle: AnyHandle; name: string; used: number }): Promise<number> {
    const id = entry.id ?? this.next++;
    this.entries.set(id, { id, handle: entry.handle, name: entry.name, used: entry.used });
    return Promise.resolve(id);
  }

  delete(id: number): Promise<void> {
    this.entries.delete(id);
    return Promise.resolve();
  }
}

/**
 * A folder the shell remembers, by its number, for the thread that reads
 * it: null when there is no such folder, or IndexedDB is not here.
 *
 * The shell keeps handles on the page's own thread and hands out
 * numbers, which suits a file read once. A folder is different: an
 * editor or a photo library reads it a file at a time, a hundred
 * thousand times, and each read crossing to the page and back would be
 * the whole cost. IndexedDB is shared by every thread of an origin, so
 * the worker that owns the work takes the handle from the shell's store
 * and reads the folder itself, with the permission the picker (or
 * `reopenDirectory`) granted.
 */
export async function rememberedDirectory(
  handle: number,
  factory: IDBFactory | undefined = globalThis.indexedDB
): Promise<FileSystemDirectoryHandle | null> {
  if (factory === undefined) {
    return null;
  }
  const entry = (await new IndexedDbHandleStore(factory).all()).find(stored => stored.id === handle);
  return entry !== undefined && entry.handle.kind === 'directory'
    ? (entry.handle as unknown as FileSystemDirectoryHandle)
    : null;
}
