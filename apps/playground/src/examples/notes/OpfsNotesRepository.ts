import { BehaviorSubject, type Observable } from 'rxjs';

import type { Note, NotesRepository } from './NotesRepository';

/**
 * Notes kept in the Origin Private File System.
 *
 * The same three members `InMemoryNotesRepository` has, so nothing
 * above it changes: `NotesDomain` and `NotesViewModel` do not know
 * which one they were given, and their specs still run without a
 * browser. That is what the repository seam was for.
 *
 * It runs in the application worker, which is not incidental. The fast
 * OPFS path — `createSyncAccessHandle` — is only available in a
 * dedicated worker, and the write below is a synchronous file write
 * that would block whatever thread it happened on. On the shell it
 * would stall input; here it competes with nothing the person can see.
 * §2.1 of `decisions/0030-thread-model.md` predicted this; this is the
 * first code that depends on it.
 */

/**
 * The slice of the OPFS API used here.
 *
 * Declared rather than imported: TypeScript's DOM library does not yet
 * describe `createSyncAccessHandle`, and the worker-only half of the
 * File System API is not in the lib this project compiles against.
 */
interface SyncAccessHandle {
  getSize(): number;
  read(buffer: ArrayBufferView, options?: { at?: number }): number;
  write(buffer: ArrayBufferView, options?: { at?: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}

interface SyncFileHandle {
  createSyncAccessHandle(): Promise<SyncAccessHandle>;
}

interface OpfsDirectory {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<SyncFileHandle>;
}

/** How long writes are gathered before one reaches the disk. */
const SAVE_DEBOUNCE_MS = 300;

export class OpfsNotesRepository implements NotesRepository {
  private readonly subject: BehaviorSubject<readonly Note[]>;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving = false;
  private saveAgain = false;
  private loaded = false;

  /**
   * @param seed what to write on the very first run, when the file
   *   does not exist yet.
   * @param fileName the file in the origin's private directory.
   */
  constructor(
    private readonly seed: readonly Note[],
    private readonly fileName = 'gesso-notes.json'
  ) {
    // Starts empty rather than seeded. Seeding here and then replacing
    // on load would show the person a notebook that is about to be
    // thrown away; an empty list for one frame is honest, and
    // `NotesDomain` opens the newest note as soon as any arrive.
    this.subject = new BehaviorSubject<readonly Note[]>([]);
    void this.load();
  }

  get notes(): Observable<readonly Note[]> {
    return this.subject;
  }

  current(): readonly Note[] {
    return this.subject.value;
  }

  /**
   * Publishes immediately and persists shortly after.
   *
   * The subject is what the view reads, so an edit must land in it
   * synchronously — waiting for a disk write would put the file system
   * in the path of a keystroke. The file catches up on a debounce,
   * because `setBody` is called on every character and a notebook does
   * not need to be written thirty times a second.
   */
  write(notes: readonly Note[]): void {
    this.subject.next(notes);
    this.scheduleSave();
  }

  /** Writes anything outstanding now, for a worker shutting down. */
  async flush(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.save();
  }

  private async load(): Promise<void> {
    try {
      const handle = await this.open();
      const size = handle.getSize();
      if (size === 0) {
        handle.close();
        // First run: the file exists but is empty, so the seed becomes
        // what is on disk from here on.
        this.loaded = true;
        this.write(this.seed);
        return;
      }
      const buffer = new Uint8Array(size);
      handle.read(buffer, { at: 0 });
      handle.close();
      const parsed = JSON.parse(this.decoder.decode(buffer)) as Note[];
      this.loaded = true;
      this.subject.next(parsed);
    } catch (error) {
      // A browser without OPFS, a denied quota, or a file this build
      // cannot parse. The notebook still works for this session; only
      // the persistence is lost, and saying so is better than an empty
      // screen with no explanation.
      console.warn('[notes] could not read from OPFS; falling back to the seed.', error);
      this.loaded = true;
      this.subject.next(this.seed);
    }
  }

  private scheduleSave(): void {
    if (!this.loaded) {
      // A write before the load finished would race it and could
      // persist an empty notebook over a real one.
      return;
    }
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, SAVE_DEBOUNCE_MS);
  }

  private async save(): Promise<void> {
    if (this.saving) {
      // A sync access handle is exclusive, so two overlapping saves
      // would fight over it. The second is remembered and runs after.
      this.saveAgain = true;
      return;
    }
    this.saving = true;
    try {
      const handle = await this.open();
      const encoded = this.encoder.encode(JSON.stringify(this.subject.value));
      handle.truncate(0);
      handle.write(encoded, { at: 0 });
      handle.flush();
      handle.close();
    } catch (error) {
      console.warn('[notes] could not write to OPFS; this session will not persist.', error);
    } finally {
      this.saving = false;
      if (this.saveAgain) {
        this.saveAgain = false;
        await this.save();
      }
    }
  }

  private async open(): Promise<SyncAccessHandle> {
    const storage = (navigator as unknown as { storage?: { getDirectory?: () => Promise<OpfsDirectory> } }).storage;
    if (storage?.getDirectory === undefined) {
      throw new Error('This environment has no Origin Private File System.');
    }
    const root = await storage.getDirectory();
    const file = await root.getFileHandle(this.fileName, { create: true });
    return file.createSyncAccessHandle();
  }
}
