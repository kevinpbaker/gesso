import type { ShellFile, ShellFileRequest, ShellFileResult, ShellFileType, ShellRecentFile } from './ShellService';
import { shellFilesUnsupported } from './ShellService';

/**
 * The shell's half of a file request: pickers, handles, and the files
 * it remembers.
 *
 * Written once and called from both configurations, as
 * `performShellStorage` is, because what the shell does with a file
 * should not depend on whether the render side is a worker. It decides
 * nothing about what a file *is*: it reads bytes, writes text, and
 * answers with plain data.
 *
 * ## Handles stay here
 *
 * A `FileSystemFileHandle` is the only thing that lets a page write
 * back to a file somebody chose, and it is not plain data, so it cannot
 * cross to the render worker. The shell keeps every handle it is given
 * and hands out a number for it instead. The handles are kept in
 * IndexedDB, which can hold them — so a number handed out yesterday
 * still names yesterday's file, and "recent files" is just the store
 * listed. What does not survive a reload is the *permission*: a browser
 * asks again, and asking needs a gesture, which is why `reopen` and
 * `save` to a handle both belong in a click handler.
 *
 * ## Without the File System Access API
 *
 * Firefox and Safari have no pickers. There, `open` falls back to a
 * file input and returns files with no handle, and `save` without a
 * handle falls back to a download. An application learns which from
 * the answer — `handle: null`, `via: 'download'` — rather than from a
 * feature test of its own, because the shell is the only thing that
 * knows.
 */

/** The slice of a `FileSystemFileHandle` used here. */
export interface ShellFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable?(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  isSameEntry?(other: ShellFileHandle): Promise<boolean>;
}

/** A remembered handle, as the store keeps it. */
export interface StoredFileHandle {
  readonly id: number;
  readonly handle: ShellFileHandle;
  readonly name: string;
  readonly used: number;
}

/** Where handles are remembered. IndexedDB in a browser; a map in a spec. */
export interface ShellHandleStore {
  all(): Promise<StoredFileHandle[]>;
  /** Stores an entry, allocating an id when it has none, and answers the id. */
  put(entry: {
    readonly id?: number;
    readonly handle: ShellFileHandle;
    readonly name: string;
    readonly used: number;
  }): Promise<number>;
  delete(id: number): Promise<void>;
}

/** What the shell can reach. Every member optional but the store and the clock. */
export interface ShellFilesHost {
  readonly store: ShellHandleStore;
  now(): number;
  showOpenFilePicker?(options: PickerOptions & { multiple: boolean }): Promise<ShellFileHandle[]>;
  showSaveFilePicker?(options: PickerOptions & { suggestedName: string }): Promise<ShellFileHandle>;
  /** A file input, clicked. Null when it was dismissed. */
  pickWithInput?(accept: string, multiple: boolean): Promise<File[] | null>;
  /** Hands a file to the browser's downloads. */
  download?(name: string, blob: Blob): void;
}

interface PickerOptions {
  types?: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
}

/** How many files are remembered before the oldest is let go. */
export const RECENT_FILE_LIMIT = 50;

export class ShellFiles {
  constructor(private readonly host: ShellFilesHost) {}

  /**
   * Performs one request. Never rejects: every path, including a
   * browser throwing something nobody predicted, is an answer, because
   * a promise on the other side of the barrier is waiting for one.
   */
  async perform(request: ShellFileRequest): Promise<ShellFileResult> {
    try {
      switch (request.op) {
        case 'open':
          return await this.open(request.accept, request.multiple);
        case 'reopen':
          return await this.reopen(request.handle);
        case 'save':
          return await this.save(request);
        case 'recent':
          return ok({ recent: await this.recent() });
        case 'forget':
          await this.host.store.delete(request.handle);
          return ok({ recent: await this.recent() });
      }
    } catch (error) {
      return failure(error);
    }
  }

  private async open(accept: readonly ShellFileType[], multiple: boolean): Promise<ShellFileResult> {
    if (this.host.showOpenFilePicker !== undefined) {
      const handles = await this.host.showOpenFilePicker({ ...pickerTypes(accept), multiple });
      const files: ShellFile[] = [];
      for (const handle of handles) {
        const id = await this.remember(handle);
        files.push(await read(await handle.getFile(), id));
      }
      return ok({ files });
    }
    if (this.host.pickWithInput !== undefined) {
      const picked = await this.host.pickWithInput(inputAccept(accept), multiple);
      if (picked === null) {
        return cancelled();
      }
      return ok({ files: await Promise.all(picked.map(file => read(file, null))) });
    }
    return shellFilesUnsupported('This browser cannot open files.');
  }

  private async reopen(id: number): Promise<ShellFileResult> {
    const entry = await this.find(id);
    if (entry === null) {
      return { ...failure(null), error: 'The shell has no file under that handle.' };
    }
    if (!(await permitted(entry.handle, 'read'))) {
      return denied();
    }
    const file = await entry.handle.getFile();
    await this.host.store.put({ ...entry, used: this.host.now() });
    return ok({ files: [await read(file, id)] });
  }

  private async save(request: Extract<ShellFileRequest, { op: 'save' }>): Promise<ShellFileResult> {
    if (request.handle !== undefined) {
      const entry = await this.find(request.handle);
      if (entry === null) {
        return { ...failure(null), error: 'The shell has no file under that handle.' };
      }
      if (!(await permitted(entry.handle, 'readwrite'))) {
        return denied();
      }
      await write(entry.handle, request.text);
      await this.host.store.put({ ...entry, used: this.host.now() });
      return ok({ saved: { name: entry.handle.name, handle: entry.id, via: 'file' } });
    }
    if (this.host.showSaveFilePicker !== undefined) {
      const handle = await this.host.showSaveFilePicker({
        ...pickerTypes(request.accept),
        suggestedName: request.name
      });
      await write(handle, request.text);
      const id = await this.remember(handle);
      return ok({ saved: { name: handle.name, handle: id, via: 'file' } });
    }
    if (this.host.download !== undefined) {
      this.host.download(request.name, new Blob([request.text], { type: request.mediaType }));
      return ok({ saved: { name: request.name, handle: null, via: 'download' } });
    }
    return shellFilesUnsupported('This browser cannot save files.');
  }

  private async recent(): Promise<ShellRecentFile[]> {
    const all = await this.host.store.all();
    return all.sort((a, b) => b.used - a.used).map(entry => ({ handle: entry.id, name: entry.name, used: entry.used }));
  }

  private async find(id: number): Promise<StoredFileHandle | null> {
    return (await this.host.store.all()).find(entry => entry.id === id) ?? null;
  }

  /**
   * Keeps a handle and answers its number.
   *
   * The same file picked twice is one entry, not two: a picker hands
   * back a fresh handle object every time, so the comparison is
   * `isSameEntry` rather than identity. Past `RECENT_FILE_LIMIT` the
   * least recently used is let go.
   */
  private async remember(handle: ShellFileHandle): Promise<number> {
    const all = await this.host.store.all();
    const now = this.host.now();
    for (const entry of all) {
      if (entry.handle.isSameEntry !== undefined && (await entry.handle.isSameEntry(handle))) {
        return this.host.store.put({ id: entry.id, handle, name: handle.name, used: now });
      }
    }
    const id = await this.host.store.put({ handle, name: handle.name, used: now });
    const oldest = all.sort((a, b) => b.used - a.used).slice(RECENT_FILE_LIMIT - 1);
    for (const entry of oldest) {
      await this.host.store.delete(entry.id);
    }
    return id;
  }
}

async function read(file: File, handle: number | null): Promise<ShellFile> {
  return {
    name: file.name,
    mediaType: file.type,
    lastModified: file.lastModified,
    bytes: await file.arrayBuffer(),
    handle
  };
}

async function write(handle: ShellFileHandle, text: string): Promise<void> {
  if (handle.createWritable === undefined) {
    throw new Error('This file cannot be written to.');
  }
  const stream = await handle.createWritable();
  await stream.write(text);
  await stream.close();
}

/**
 * Whether a handle may be used, asking when it may not yet.
 *
 * A handle from this session's picker is granted already; one from
 * yesterday's is `prompt`, and `requestPermission` is what shows the
 * browser's own question. A handle with neither method is from a
 * browser that does not ask, and is taken as granted.
 */
async function permitted(handle: ShellFileHandle, mode: 'read' | 'readwrite'): Promise<boolean> {
  if (handle.queryPermission === undefined) {
    return true;
  }
  if ((await handle.queryPermission({ mode })) === 'granted') {
    return true;
  }
  return handle.requestPermission !== undefined && (await handle.requestPermission({ mode })) === 'granted';
}

function pickerTypes(accept: readonly ShellFileType[]): PickerOptions {
  if (accept.length === 0) {
    return {};
  }
  return {
    types: accept.map(type => ({ description: type.description, accept: { [type.mediaType]: [...type.extensions] } })),
    excludeAcceptAllOption: false
  };
}

function inputAccept(accept: readonly ShellFileType[]): string {
  return accept.flatMap(type => [...type.extensions, type.mediaType]).join(',');
}

function ok(fields: Partial<Pick<ShellFileResult, 'files' | 'saved' | 'recent'>>): ShellFileResult {
  return { outcome: 'ok', files: [], saved: null, recent: [], error: null, ...fields };
}

function cancelled(): ShellFileResult {
  return { outcome: 'cancelled', files: [], saved: null, recent: [], error: null };
}

function denied(): ShellFileResult {
  return { outcome: 'denied', files: [], saved: null, recent: [], error: 'Permission to use the file was refused.' };
}

/**
 * An exception, as an outcome.
 *
 * A picker closed without choosing throws `AbortError`, which is the
 * person deciding and is `cancelled`. `NotAllowedError` and
 * `SecurityError` are the browser refusing — no gesture, or a frame
 * that may not — and are `denied`. Anything else failed.
 */
function failure(error: unknown): ShellFileResult {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  if (name === 'AbortError') {
    return cancelled();
  }
  const message = error instanceof Error ? error.message : error === null ? null : String(error);
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return { ...denied(), error: message };
  }
  return { outcome: 'failed', files: [], saved: null, recent: [], error: message };
}

/** Every buffer in an answer, for a shell that posts it across and can move them. */
export function fileResultTransfer(result: ShellFileResult): ArrayBuffer[] {
  return result.files.map(file => file.bytes);
}

// ---------------------------------------------------------------------------
// The browser's host
// ---------------------------------------------------------------------------

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

  async put(entry: { id?: number; handle: ShellFileHandle; name: string; used: number }): Promise<number> {
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

  put(entry: { id?: number; handle: ShellFileHandle; name: string; used: number }): Promise<number> {
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
 * The host a real window gives: its pickers where it has them, a file
 * input and a download where it does not.
 */
export function browserFilesHost(view: Window & typeof globalThis): ShellFilesHost {
  const pickers = view as unknown as {
    showOpenFilePicker?: ShellFilesHost['showOpenFilePicker'];
    showSaveFilePicker?: ShellFilesHost['showSaveFilePicker'];
  };
  const document = view.document;
  return {
    store: view.indexedDB === undefined ? new MemoryHandleStore() : new IndexedDbHandleStore(view.indexedDB),
    now: () => Date.now(),
    ...(pickers.showOpenFilePicker === undefined
      ? {}
      : { showOpenFilePicker: options => pickers.showOpenFilePicker!.call(view, options) }),
    ...(pickers.showSaveFilePicker === undefined
      ? {}
      : { showSaveFilePicker: options => pickers.showSaveFilePicker!.call(view, options) }),
    pickWithInput: (accept, multiple) =>
      new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.multiple = multiple;
        input.addEventListener('change', () => resolve(Array.from(input.files ?? [])), { once: true });
        // `cancel` is what a dismissed picker fires, where the browser
        // fires anything at all; without it a dismissal is a promise
        // that waits, which is what every file input has always done.
        input.addEventListener('cancel', () => resolve(null), { once: true });
        input.click();
      }),
    download: (name, blob) => {
      const url = view.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      // Revoked after the click has been handled rather than at once:
      // a URL revoked synchronously is one some browsers never fetch.
      view.setTimeout(() => view.URL.revokeObjectURL(url), 60_000);
    }
  };
}
