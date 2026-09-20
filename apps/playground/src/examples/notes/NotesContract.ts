import { channel } from '@gesso/framework';

/**
 * The barrier for the notes example.
 *
 * Imported by the render worker and the application worker, and
 * holding nothing but names and shapes. Everything behind it — the
 * repository, the rules, the shaping — is plain code the render worker
 * never loads and the framework never sees.
 */

/** One row in the sidebar. Already shaped for the screen. */
export interface NoteRow {
  readonly id: string;
  readonly title: string;
  readonly preview: string;
  readonly selected: boolean;
}

/** The note the editor has open, flattened for the wire. */
export interface OpenNote {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /**
   * Already formatted, because a `Date` cannot cross.
   *
   * The timestamp itself could — it is a number — but then the view
   * would build a `Date` from it on every keystroke to format it.
   * Formatting is presentation, and the view model is the last place
   * that is allowed to do presentation with the full value in hand.
   */
  readonly editedAt: string;
}

export interface NotesView {
  readonly rows: readonly NoteRow[];
  readonly open: OpenNote | null;
}

export interface NotesCommands {
  open(id: string): void;
  create(): void;
  remove(id: string): void;
  setTitle(title: string): void;
  setBody(body: string): void;
}

/**
 * `rows` and `open` are separate keys on purpose.
 *
 * They change together on a create or a delete, but a keystroke in the
 * body moves `open` wholesale while touching one row's preview. Kept
 * in one object the differ would walk the entire list on every
 * keystroke; split, the row change is a single small patch and the
 * body is the only large value that moves. This is the thread model's
 * granularity rule in practice.
 */
export const Notes = channel<NotesView, NotesCommands>('notes', { rows: [], open: null });
