import { BehaviorSubject, combineLatest, map, type Observable } from 'rxjs';

import type { Note, NotesRepository } from './NotesRepository';

/**
 * The rules that make a pile of notes behave like a notebook.
 *
 * Which note is open, what happens to the selection when the open one
 * is deleted, when `updatedAt` moves, how a new note is named. None of
 * it is presentation and none of it is storage, so it lives here — a
 * plain class over a repository, with no framework import.
 *
 * `now` is injected so the rule about `updatedAt` can be tested
 * without waiting for a clock.
 */
export class NotesDomain {
  private readonly selectedId: BehaviorSubject<string | null>;
  private sequence: number;

  /** Newest first, which is the order the sidebar shows. */
  readonly ordered: Observable<readonly Note[]>;
  readonly open: Observable<Note | null>;

  constructor(
    private readonly repository: NotesRepository,
    private readonly now: () => number = () => Date.now()
  ) {
    const first = repository.current()[0];
    this.selectedId = new BehaviorSubject<string | null>(first?.id ?? null);
    this.sequence = repository.current().length + 1;
    // Built here rather than as field initializers: a field
    // initializer runs before the constructor's parameter properties
    // are assigned, so `this.repository` would still be undefined.
    this.ordered = repository.notes.pipe(map(notes => [...notes].sort((a, b) => b.updatedAt - a.updatedAt)));
    this.open = combineLatest([repository.notes, this.selectedId]).pipe(
      map(([notes, id]) => notes.find(note => note.id === id) ?? null)
    );
  }

  select(id: string): void {
    this.selectedId.next(id);
  }

  create(): string {
    const id = `n${this.sequence++}`;
    this.repository.write([...this.repository.current(), { id, title: '', body: '', updatedAt: this.now() }]);
    this.selectedId.next(id);
    return id;
  }

  /**
   * Deletes a note, and moves the selection somewhere sensible.
   *
   * Deleting the open note leaves the editor with nothing to show, so
   * the newest of what remains takes its place — and `null` only when
   * nothing remains at all.
   */
  remove(id: string): void {
    const remaining = this.repository.current().filter(note => note.id !== id);
    this.repository.write(remaining);
    if (this.selectedId.value !== id) {
      return;
    }
    const next = [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    this.selectedId.next(next?.id ?? null);
  }

  setTitle(title: string): void {
    this.edit(note => ({ ...note, title }));
  }

  setBody(body: string): void {
    this.edit(note => ({ ...note, body }));
  }

  private edit(change: (note: Note) => Note): void {
    const id = this.selectedId.value;
    if (id === null) {
      return;
    }
    this.repository.write(
      this.repository.current().map(note => (note.id === id ? { ...change(note), updatedAt: this.now() } : note))
    );
  }
}
