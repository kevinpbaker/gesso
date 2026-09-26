import { describe, expect, it } from 'vitest';

import { ShellService } from './ShellService';
import {
  IndexedDbHandleStore,
  MemoryHandleStore,
  RECENT_FILE_LIMIT,
  ShellFiles,
  fileResultTransfer,
  type ShellFileHandle,
  type ShellFilesHost
} from './shellFiles';

/**
 * The shell's half of a file request, against a window made of parts.
 *
 * A node environment has no pickers, no IndexedDB and no permission
 * prompts, so each is doubled with exactly the behaviour a browser
 * documents for it — a fresh handle object per pick, `AbortError` for a
 * dismissed picker, `prompt` for a handle from an earlier session — and
 * the code under test is the code a browser runs.
 */

/** A file on a disk that does not exist. */
class Disk {
  readonly contents = new Map<string, string | Uint8Array<ArrayBuffer>>();
}

class FakeHandle implements ShellFileHandle {
  permission: PermissionState = 'granted';
  /** What `requestPermission` answers when asked. */
  answer: PermissionState = 'granted';
  asked = 0;

  constructor(
    readonly name: string,
    private readonly disk: Disk
  ) {}

  getFile(): Promise<File> {
    return Promise.resolve(
      new File([this.disk.contents.get(this.name) ?? ''], this.name, { type: 'text/csv', lastModified: 5 })
    );
  }

  createWritable(): Promise<{ write(data: string | Uint8Array<ArrayBuffer>): Promise<void>; close(): Promise<void> }> {
    let written: string | Uint8Array<ArrayBuffer> = '';
    return Promise.resolve({
      write: (data: string | Uint8Array<ArrayBuffer>) => {
        written = typeof data === 'string' && typeof written === 'string' ? written + data : data;
        return Promise.resolve();
      },
      close: () => {
        this.disk.contents.set(this.name, written);
        return Promise.resolve();
      }
    });
  }

  queryPermission(): Promise<PermissionState> {
    return Promise.resolve(this.permission);
  }

  requestPermission(): Promise<PermissionState> {
    this.asked++;
    this.permission = this.answer;
    return Promise.resolve(this.answer);
  }

  /** Two handles are the same entry when they name the same file, as on a real disk. */
  isSameEntry(other: ShellFileHandle): Promise<boolean> {
    return Promise.resolve(other.name === this.name);
  }
}

function abort(): Error {
  const error = new Error('The user aborted a request.');
  error.name = 'AbortError';
  return error;
}

function host(overrides: Partial<ShellFilesHost> = {}) {
  const disk = new Disk();
  let clock = 1000;
  const picks: string[][] = [];
  const saves: string[] = [];
  const downloads: { name: string; blob: Blob }[] = [];
  const pickerOptions: unknown[] = [];
  const base: ShellFilesHost = {
    store: new MemoryHandleStore(),
    now: () => clock++,
    showOpenFilePicker: options => {
      pickerOptions.push(options);
      const names = picks.shift();
      return names === undefined
        ? Promise.reject(abort())
        : Promise.resolve(names.map(name => new FakeHandle(name, disk)));
    },
    showSaveFilePicker: options => {
      pickerOptions.push(options);
      const name = saves.shift();
      return name === undefined ? Promise.reject(abort()) : Promise.resolve(new FakeHandle(name, disk));
    },
    download: (name, blob) => downloads.push({ name, blob }),
    ...overrides
  };
  return { files: new ShellFiles(base), disk, picks, saves, downloads, pickerOptions, store: base.store };
}

const CSV = [{ description: 'CSV', mediaType: 'text/csv', extensions: ['.csv'] }];

describe('opening files', () => {
  it('reads what the picker chose, and gives each file a handle', async () => {
    const { files, disk, picks } = host();
    disk.contents.set('a.csv', 'x,y');
    picks.push(['a.csv']);
    const result = await files.perform({ op: 'open', accept: CSV, multiple: false });

    expect(result.outcome).toBe('ok');
    expect(result.files).toHaveLength(1);
    const [file] = result.files;
    expect([file.name, file.mediaType, file.lastModified]).toEqual(['a.csv', 'text/csv', 5]);
    expect(new TextDecoder().decode(file.bytes)).toBe('x,y');
    expect(typeof file.handle).toBe('number');
    expect(fileResultTransfer(result)).toEqual([file.bytes]);
  });

  it('offers the kinds it was given, in the picker API’s own shape', async () => {
    const { files, picks, pickerOptions } = host();
    picks.push([]);
    await files.perform({ op: 'open', accept: CSV, multiple: true });
    expect(pickerOptions[0]).toEqual({
      types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
      excludeAcceptAllOption: false,
      multiple: true
    });
  });

  it('calls a dismissed picker cancelled, not failed', async () => {
    const { files } = host();
    expect((await files.perform({ op: 'open', accept: [], multiple: false })).outcome).toBe('cancelled');
  });

  it('falls back to a file input, whose files have no handle', async () => {
    let asked: [string, boolean] | null = null;
    const { files } = host({
      showOpenFilePicker: undefined,
      pickWithInput: (accept, multiple) => {
        asked = [accept, multiple];
        return Promise.resolve([new File(['1,2'], 'b.csv', { type: 'text/csv' })]);
      }
    });
    const result = await files.perform({ op: 'open', accept: CSV, multiple: true });
    expect(asked).toEqual(['.csv,text/csv', true]);
    expect(result.files.map(file => [file.name, file.handle])).toEqual([['b.csv', null]]);
  });

  it('calls a dismissed file input cancelled', async () => {
    const { files } = host({ showOpenFilePicker: undefined, pickWithInput: () => Promise.resolve(null) });
    expect((await files.perform({ op: 'open', accept: [], multiple: false })).outcome).toBe('cancelled');
  });

  it('says it cannot, where there is no way to pick at all', async () => {
    const { files } = host({ showOpenFilePicker: undefined });
    const result = await files.perform({ op: 'open', accept: [], multiple: false });
    expect(result.outcome).toBe('unsupported');
  });
});

describe('saving files', () => {
  it('saves as wherever the picker says, and remembers where', async () => {
    const { files, disk, saves, pickerOptions } = host();
    saves.push('book.gsheet');
    const result = await files.perform({
      op: 'save',
      name: 'Untitled.gsheet',
      mediaType: 'application/json',
      text: '{}',
      accept: []
    });

    expect(result.outcome).toBe('ok');
    expect(result.saved).toMatchObject({ name: 'book.gsheet', via: 'file' });
    expect(disk.contents.get('book.gsheet')).toBe('{}');
    expect(pickerOptions[0]).toEqual({ suggestedName: 'Untitled.gsheet' });

    const recent = await files.perform({ op: 'recent' });
    expect(recent.recent.map(file => [file.handle, file.name])).toEqual([[result.saved!.handle, 'book.gsheet']]);
  });

  it('saves back to a handle without a picker', async () => {
    const { files, disk, saves } = host();
    saves.push('book.gsheet');
    const first = await files.perform({ op: 'save', name: 'x', mediaType: 'text/plain', text: 'one', accept: [] });
    const again = await files.perform({
      op: 'save',
      name: 'x',
      mediaType: 'text/plain',
      text: 'two',
      handle: first.saved!.handle!,
      accept: []
    });
    expect(again.saved).toEqual({ name: 'book.gsheet', handle: first.saved!.handle, via: 'file' });
    expect(disk.contents.get('book.gsheet')).toBe('two');
  });

  it('asks again for a handle whose permission lapsed, and says so when refused', async () => {
    const { files, store, disk } = host();
    const lapsed = new FakeHandle('old.gsheet', disk);
    lapsed.permission = 'prompt';
    lapsed.answer = 'denied';
    const id = await store.put({ handle: lapsed, name: 'old.gsheet', used: 1 });

    const result = await files.perform({
      op: 'save',
      name: 'x',
      mediaType: 'text/plain',
      text: 'new',
      handle: id,
      accept: []
    });
    expect(lapsed.asked).toBe(1);
    expect(result.outcome).toBe('denied');
    expect(disk.contents.has('old.gsheet')).toBe(false);
  });

  it('downloads where there is no save picker, and has no handle to give', async () => {
    const { files, downloads } = host({ showSaveFilePicker: undefined });
    const result = await files.perform({
      op: 'save',
      name: 'Sheet1.csv',
      mediaType: 'text/csv',
      text: 'a,b',
      accept: []
    });
    expect(result.saved).toEqual({ name: 'Sheet1.csv', handle: null, via: 'download' });
    expect(downloads[0].name).toBe('Sheet1.csv');
    expect(downloads[0].blob.type).toBe('text/csv');
    expect(await downloads[0].blob.text()).toBe('a,b');
  });

  /** A zip, an image: a file that is not text is written as the bytes it is. */
  it('writes bytes rather than text when given them, to a file and as a download', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff]);
    const { files, disk, saves } = host();
    saves.push('book.xlsx');
    await files.perform({ op: 'save', name: 'book.xlsx', mediaType: 'application/zip', text: '', bytes: zip, accept: [] });
    expect(disk.contents.get('book.xlsx')).toEqual(zip);

    const downloading = host({ showSaveFilePicker: undefined });
    await downloading.files.perform({
      op: 'save',
      name: 'book.xlsx',
      mediaType: 'application/zip',
      text: '',
      bytes: zip,
      accept: []
    });
    expect(new Uint8Array(await downloading.downloads[0].blob.arrayBuffer())).toEqual(zip);
  });

  it('calls a dismissed save picker cancelled', async () => {
    const { files } = host();
    const result = await files.perform({ op: 'save', name: 'x', mediaType: 'text/plain', text: '', accept: [] });
    expect(result.outcome).toBe('cancelled');
  });

  it('answers a handle it never gave out with a failure, not a throw', async () => {
    const { files } = host();
    const result = await files.perform({
      op: 'save',
      name: 'x',
      mediaType: 'text/plain',
      text: '',
      handle: 99,
      accept: []
    });
    expect(result.outcome).toBe('failed');
    expect(result.error).toBe('The shell has no file under that handle.');
  });
});

describe('the files the shell remembers', () => {
  it('reopens one, asking again when the permission lapsed', async () => {
    const { files, store, disk } = host();
    disk.contents.set('old.csv', 'kept');
    const lapsed = new FakeHandle('old.csv', disk);
    lapsed.permission = 'prompt';
    const id = await store.put({ handle: lapsed, name: 'old.csv', used: 1 });

    const result = await files.perform({ op: 'reopen', handle: id });
    expect(lapsed.asked).toBe(1);
    expect(result.files.map(file => [file.name, file.handle])).toEqual([['old.csv', id]]);
    expect(new TextDecoder().decode(result.files[0].bytes)).toBe('kept');
  });

  it('lists the most recently used first, and keeps one entry for a file picked twice', async () => {
    const { files, picks } = host();
    picks.push(['a.csv'], ['b.csv'], ['a.csv']);
    const first = await files.perform({ op: 'open', accept: [], multiple: false });
    await files.perform({ op: 'open', accept: [], multiple: false });
    const again = await files.perform({ op: 'open', accept: [], multiple: false });

    // A picker hands back a new handle object each time; the file is the same.
    expect(again.files[0].handle).toBe(first.files[0].handle);
    const recent = await files.perform({ op: 'recent' });
    expect(recent.recent.map(file => file.name)).toEqual(['a.csv', 'b.csv']);
  });

  it('forgets one', async () => {
    const { files, picks } = host();
    picks.push(['a.csv']);
    const opened = await files.perform({ op: 'open', accept: [], multiple: false });
    const result = await files.perform({ op: 'forget', handle: opened.files[0].handle! });
    expect(result.recent).toEqual([]);
  });

  it(`lets the oldest go past ${RECENT_FILE_LIMIT}`, async () => {
    const { files, picks } = host();
    for (let at = 0; at <= RECENT_FILE_LIMIT; at++) {
      picks.push([`f${at}.csv`]);
      await files.perform({ op: 'open', accept: [], multiple: false });
    }
    const recent = (await files.perform({ op: 'recent' })).recent;
    expect(recent).toHaveLength(RECENT_FILE_LIMIT);
    expect(recent.map(file => file.name)).not.toContain('f0.csv');
    expect(recent[0].name).toBe(`f${RECENT_FILE_LIMIT}.csv`);
  });
});

describe('what the shell refuses', () => {
  it('calls a browser refusal denied', async () => {
    const refusal = new Error('Must be handling a user gesture to show a file picker.');
    refusal.name = 'SecurityError';
    const { files } = host({ showOpenFilePicker: () => Promise.reject(refusal) });
    const result = await files.perform({ op: 'open', accept: [], multiple: false });
    expect(result.outcome).toBe('denied');
    expect(result.error).toBe(refusal.message);
  });

  it('calls anything else failed, and never rejects', async () => {
    const { files } = host({ showOpenFilePicker: () => Promise.reject(new Error('disk on fire')) });
    const result = await files.perform({ op: 'open', accept: [], multiple: false });
    expect(result).toEqual({ outcome: 'failed', files: [], saved: null, recent: [], error: 'disk on fire' });
  });
});

describe('ShellService file requests', () => {
  it('answers unsupported with no shell, rather than never', async () => {
    const service = new ShellService();
    expect((await service.openFiles()).outcome).toBe('unsupported');
  });

  it('pairs each answer with its request', async () => {
    const service = new ShellService();
    const sent: { id: number; op: string }[] = [];
    service.setHandler(request => {
      if (request.type === 'file') {
        sent.push({ id: request.id, op: request.request.op });
      }
    });
    const open = service.openFiles({ accept: CSV });
    const save = service.saveFile({ name: 'a.csv', text: 'x', mediaType: 'text/csv', handle: 3 });
    expect(sent.map(each => each.op)).toEqual(['open', 'save']);

    const empty = { files: [], saved: null, recent: [], error: null };
    service.settleFile(sent[1].id, { ...empty, outcome: 'ok', saved: { name: 'a.csv', handle: 3, via: 'file' } });
    service.settleFile(sent[0].id, { ...empty, outcome: 'cancelled' });
    expect((await save).saved?.handle).toBe(3);
    expect((await open).outcome).toBe('cancelled');
  });
});

/**
 * Just enough of IndexedDB for the handle store: one database, one
 * store keyed by an auto-incremented `id`, and requests that answer a
 * microtask later, as a real one does, so the store's handlers have
 * to be set in time to hear them.
 */
class FakeIdb {
  opens = 0;
  created: { name: string; options: IDBObjectStoreParameters }[] = [];
  readonly rows = new Map<number, Record<string, unknown>>();
  private next = 1;

  open(): IDBOpenDBRequest {
    this.opens++;
    const request = {} as { result: unknown; onupgradeneeded?: () => void; onsuccess?: () => void };
    const database = {
      createObjectStore: (name: string, options: IDBObjectStoreParameters) => this.created.push({ name, options }),
      transaction: () => ({ objectStore: () => this.store() })
    };
    request.result = database;
    queueMicrotask(() => {
      if (this.opens === 1) {
        request.onupgradeneeded?.();
      }
      request.onsuccess?.();
    });
    return request as unknown as IDBOpenDBRequest;
  }

  private store() {
    const answer = <T>(value: () => T) => {
      const request = {} as { result: T; onsuccess?: () => void };
      queueMicrotask(() => {
        request.result = value();
        request.onsuccess?.();
      });
      return request;
    };
    return {
      getAll: () => answer(() => [...this.rows.values()]),
      put: (row: Record<string, unknown>) =>
        answer(() => {
          const id = (row.id as number | undefined) ?? this.next++;
          this.rows.set(id, { ...row, id });
          return id;
        }),
      delete: (id: number) => answer(() => void this.rows.delete(id))
    };
  }
}

describe('handles kept in IndexedDB', () => {
  it('creates its store on first use, keyed by an id it allocates', async () => {
    const idb = new FakeIdb();
    const store = new IndexedDbHandleStore(idb as unknown as IDBFactory);
    expect(idb.opens).toBe(0);

    const disk = new Disk();
    const id = await store.put({ handle: new FakeHandle('a.csv', disk), name: 'a.csv', used: 1 });
    await store.put({ id, handle: new FakeHandle('a.csv', disk), name: 'a.csv', used: 2 });
    const all = await store.all();

    expect(idb.created).toEqual([{ name: 'handles', options: { keyPath: 'id', autoIncrement: true } }]);
    expect(idb.opens).toBe(1);
    expect(all.map(entry => [entry.id, entry.name, entry.used])).toEqual([[id, 'a.csv', 2]]);
    await store.delete(id);
    expect(await store.all()).toEqual([]);
  });
});
