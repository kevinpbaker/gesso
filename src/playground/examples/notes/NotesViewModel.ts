import { combineLatest, map, type Observable } from 'rxjs';

import type { NoteRow, OpenNote } from './NotesContract';
import type { NotesDomain } from './NotesDomain';

/**
 * Shapes the notebook for the screen, and flattens it for the wire.
 *
 * This is the last layer before the barrier, and the only one that has
 * to care that plain data is all that crosses: a `Note` is already
 * plain here, but this is where a `Date`, a `Map` or a domain object
 * would have to become primitives, arrays and plain objects. Putting
 * that conversion in one named place is most of what the layering
 * buys.
 */
export class NotesViewModel {
  readonly rows: Observable<readonly NoteRow[]>;
  readonly open: Observable<OpenNote | null>;

  constructor(domain: NotesDomain) {
    this.rows = combineLatest([domain.ordered, domain.open]).pipe(
      map(([notes, open]) =>
        notes.map(note => ({
          id: note.id,
          title: note.title.trim().length > 0 ? note.title : 'Untitled',
          preview: firstLine(note.body),
          selected: note.id === open?.id
        }))
      )
    );
    this.open = domain.open.pipe(
      map(note =>
        note === null
          ? null
          : {
              id: note.id,
              title: note.title,
              body: note.body,
              editedAt: new Date(note.updatedAt).toLocaleString()
            }
      )
    );
  }
}

/**
 * The first line with anything on it, trimmed to a row's width.
 *
 * Cut here rather than in the view: a preview is a fixed 60 characters
 * whatever the note holds, so sending the whole body for the sidebar
 * to slice would put every note's full text through the patch stream
 * on every change.
 */
function firstLine(body: string): string {
  const line = body.split('\n').find(text => text.trim().length > 0);
  return line === undefined ? 'No additional text' : line.slice(0, 60);
}
