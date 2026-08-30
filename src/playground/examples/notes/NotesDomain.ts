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

  /** Newest first, which is the order the sidebar shows. */
  readonly ordered: Observable<readonly Note[]>;
  readonly open: Observable<Note | null>;

  constructor(
    private readonly repository: NotesRepository,
    private readonly now: () => number = () => Date.now()
  ) {
    const first = repository.current()[0];
    this.selectedId = new BehaviorSubject<string | null>(first?.id ?? null);
    // Built here rather than as field initializers: a field
    // initializer runs before the constructor's parameter properties
    // are assigned, so `this.repository` would still be undefined.
    this.ordered = repository.notes.pipe(map(notes => [...notes].sort((a, b) => b.updatedAt - a.updatedAt)));
    this.open = combineLatest([repository.notes, this.selectedId]).pipe(
      map(([notes, id]) => notes.find(note => note.id === id) ?? null)
    );

    // A repository that loads asynchronously starts empty, so there is
    // nothing to open when this runs. Opening the newest as soon as
    // notes arrive is what makes a persisted notebook look the same on
    // the second visit as on the first — and it is a rule about how a
    // notebook behaves, so it belongs here rather than in the view.
    repository.notes.subscribe(notes => {
      if (this.selectedId.value !== null || notes.length === 0) {
        return;
      }
      const newest = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      this.selectedId.next(newest?.id ?? null);
    });
  }

  select(id: string): void {
    this.selectedId.next(id);
  }

  create(): string {
    const id = this.nextId();
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

  /**
   * The next free id, read from what exists rather than counted.
   *
   * A counter seeded from the length was fine while the seed was the
   * only source; a notebook read back from disk can have gaps — delete
   * n2 of three and reload — and the counter would hand out an id that
   * is already taken.
   */
  private nextId(): string {
    let highest = 0;
    for (const note of this.repository.current()) {
      const match = /^n(\d+)$/.exec(note.id);
      if (match !== null) {
        highest = Math.max(highest, Number(match[1]));
      }
    }
    return `n${highest + 1}`;
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
