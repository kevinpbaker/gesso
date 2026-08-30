import { BehaviorSubject, type Observable } from 'rxjs';

/** A note as it is stored, before anything shapes it for a screen. */
export interface Note {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly updatedAt: number;
}

/**
 * Where notes are kept.
 *
 * The seam the persistence layer plugs into: today an array in memory,
 * seeded at construction; A7 puts an OPFS-backed implementation behind
 * the same three members without anything above it changing.
 *
 * It has no framework import, no base class and no decorator. Nothing
 * here knows there is a UI.
 */
export interface NotesRepository {
  readonly notes: Observable<readonly Note[]>;
  current(): readonly Note[];
  write(notes: readonly Note[]): void;
}

export class InMemoryNotesRepository implements NotesRepository {
  private readonly subject: BehaviorSubject<readonly Note[]>;

  constructor(seed: readonly Note[]) {
    this.subject = new BehaviorSubject<readonly Note[]>(seed);
  }

  get notes(): Observable<readonly Note[]> {
    return this.subject;
  }

  current(): readonly Note[] {
    return this.subject.value;
  }

  write(notes: readonly Note[]): void {
    this.subject.next(notes);
  }
}
