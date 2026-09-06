import { computed, type ComputedCell } from '../computed';
import { internalState, type InternalState } from '../InternalState';
import { select } from '../select';

/** One undoable change, as the two functions that make and unmake it. */
export interface UndoTransaction {
  /**
   * What a menu item or a toast calls this change: "Move Sunset",
   * "Remove Sunset from the queue".
   *
   * A phrase rather than a sentence, because the words around it are
   * the caller's: an application writes "Undo " in front of it.
   */
  readonly label: string;
  /** Puts the world back the way it was before `redo` ran. */
  readonly undo: () => void;
  /** Makes the change again, from wherever `undo` left things. */
  readonly redo: () => void;
  /**
   * Merges this into the entry before it when the two keys match.
   *
   * A drag reports a crossing per row and a typed name reports a
   * keystroke, and neither is a change a person means to undo one step
   * at a time. Entries pushed one after another under the same key
   * become one entry: **the first one's `undo` and the last one's
   * `redo`**, with everything between them dropped.
   *
   * That merge rule is what makes the two functions above worth
   * writing as absolute moves rather than as deltas. `undo` should say
   * where the thing goes, not how far back it goes, because after
   * three more coalesced steps a delta is wrong and a position is
   * still right. See `endRun` for where a run stops.
   */
  readonly coalesce?: string;
}

export interface UndoStackOptions {
  /**
   * How many entries are kept, oldest dropped first. Default 100.
   *
   * A bound rather than a growing list, for the reason
   * `EditableTextModel` has one: an application that is used for an
   * afternoon would otherwise hold every intermediate state of that
   * afternoon, and nobody undoes a hundred steps.
   */
  readonly limit?: number;
  /** What to call the stack in a devtools reading; optional. */
  readonly label?: string;
}

/** The two labels, as one record so a menu reads them in one go. */
interface UndoLabels {
  readonly undo: string | null;
  readonly redo: string | null;
}

const NOTHING: UndoLabels = { undo: null, redo: null };

/**
 * The application's undo, as a stack of named transactions.
 *
 * A component registers what it did and how to unmake it, and a menu,
 * a button or a keyboard shortcut drives the stack. Nothing here
 * listens to anything or knows what an application's state is: the two
 * functions in a transaction are the whole of the coupling, which is
 * why this can sit on either thread and why it does not become a data
 * layer (`decisions/0030`).
 *
 *   const undo = ctx.inject(UndoStack);
 *
 *   queue.send.remove(at);
 *   undo.push({
 *     label: `Remove ${track.title}`,
 *     undo: () => queue.send.addToQueue(track.id),
 *     redo: () => queue.send.remove(at)
 *   });
 *
 * ## How this relates to the undo inside a text field
 *
 * `EditableTextModel` has had its own undo since text became editable,
 * and the two are deliberately separate. A field's undo is a stack of
 * **snapshots of one string**, private to the field, and it has to be:
 * the model is the only thing that knows where the caret was, which
 * run of typing coalesces with which, and what an IME composition is
 * doing. This one is a stack of **inverse operations** over whatever
 * an application's state happens to be, and it cannot see inside a
 * field at all.
 *
 * They meet at one key press, and the rule there is that the focused
 * field wins: `registerUndoShortcuts` skips Mod+Z while something is
 * being typed into, so undo in a field undoes typing and undo
 * everywhere else undoes the application's last change. Merging the
 * two stacks would mean a keystroke and a queue reorder sharing one
 * history, which is not what either of them means.
 *
 * ## Reentrancy
 *
 * A push while an undo or a redo is running is dropped. Without it an
 * application whose edit path records itself would record the undo as
 * a new edit and the stack would never empty. Write the inverse
 * functions to call the state directly rather than through the same
 * path that records, and the guard never fires.
 */
export class UndoStack {
  private readonly entries: UndoTransaction[] = [];
  private readonly undone: UndoTransaction[] = [];
  private readonly limit: number;
  /** True while `undo()` or `redo()` is running one of the functions. */
  private running = false;
  /** Set by `endRun`, so the next push starts a new entry whatever its key. */
  private sealed = false;

  private readonly labels: InternalState<UndoLabels>;

  /** What undoing would undo, or null when there is nothing to undo. */
  readonly undoLabel: ComputedCell<string | null>;
  /** What redoing would redo, or null when there is nothing to redo. */
  readonly redoLabel: ComputedCell<string | null>;
  /** Whether there is anything to undo, for a menu item's `disabled`. */
  readonly canUndo: ComputedCell<boolean>;
  readonly canRedo: ComputedCell<boolean>;

  constructor(options: UndoStackOptions = {}) {
    this.limit = Math.max(1, options.limit ?? 100);
    this.labels = internalState<UndoLabels>(NOTHING, options.label);
    this.undoLabel = select(this.labels, 'undo');
    this.redoLabel = select(this.labels, 'redo');
    this.canUndo = computed(() => this.undoLabel.value !== null);
    this.canRedo = computed(() => this.redoLabel.value !== null);
  }

  /** How many entries are held, for a spec or a budget. */
  get size(): number {
    return this.entries.length;
  }

  /** How many redos are waiting, for a spec or a budget. */
  get redoSize(): number {
    return this.undone.length;
  }

  /**
   * Records a change that has already been made.
   *
   * Pushing is what discards the redo branch: making a change after
   * undoing two is the person choosing the other future, and keeping
   * the abandoned one would mean redoing into a state that no longer
   * follows from what is on screen.
   */
  push(transaction: UndoTransaction): void {
    if (this.running) {
      return;
    }
    this.undone.length = 0;
    const previous = this.entries[this.entries.length - 1];
    const sealed = this.sealed;
    this.sealed = false;
    if (
      !sealed &&
      previous !== undefined &&
      transaction.coalesce !== undefined &&
      previous.coalesce === transaction.coalesce
    ) {
      // The run's own undo, kept from its first step, and its newest
      // redo. Every step in between is released here, which is the
      // whole of what stops a drag across sixty rows retaining sixty
      // closures and the sixty values they close over.
      this.entries[this.entries.length - 1] = {
        label: transaction.label,
        undo: previous.undo,
        redo: transaction.redo,
        coalesce: transaction.coalesce
      };
      this.publish();
      return;
    }
    this.entries.push(transaction);
    while (this.entries.length > this.limit) {
      this.entries.shift();
    }
    this.publish();
  }

  /**
   * Groups everything pushed inside `body` into one entry.
   *
   * For a change an application makes as several calls and a person
   * made as one press: undoing runs the group's undos in reverse, and
   * redoing runs its redos in order. Unlike `coalesce`, a group keeps
   * every step, because a group is written down as a group rather than
   * discovered from a run of similar pushes.
   */
  transact<R>(label: string, body: () => R): R {
    if (this.running) {
      return body();
    }
    const outer = this.entries.length;
    const result = body();
    const collected = this.entries.splice(outer);
    if (collected.length > 0) {
      this.entries.push({
        label,
        undo: () => {
          for (let at = collected.length - 1; at >= 0; at--) {
            collected[at]!.undo();
          }
        },
        redo: () => {
          for (const step of collected) {
            step.redo();
          }
        }
      });
      this.sealed = true;
      this.publish();
    }
    return result;
  }

  /**
   * Ends the current run, so the next push starts its own entry.
   *
   * The twin of `EditableTextModel.endTypingRun`. A drag calls it when
   * the pointer comes up: without it, dragging a row, letting go, and
   * dragging the same row again would coalesce into one entry, and one
   * undo would put the row back where it was two gestures ago.
   */
  endRun(): void {
    this.sealed = true;
  }

  /** Undoes the last change. False when there was nothing to undo. */
  undo(): boolean {
    const entry = this.entries.pop();
    if (entry === undefined) {
      return false;
    }
    this.run(entry.undo);
    this.undone.push(entry);
    this.sealed = true;
    this.publish();
    return true;
  }

  /** Redoes the last undone change. False when there was nothing to redo. */
  redo(): boolean {
    const entry = this.undone.pop();
    if (entry === undefined) {
      return false;
    }
    this.run(entry.redo);
    this.entries.push(entry);
    this.sealed = true;
    this.publish();
    return true;
  }

  /**
   * Forgets everything, in both directions.
   *
   * What an application calls when the thing the entries refer to is
   * gone: a queue emptied, a document closed, a signed-out account's
   * library replaced. `EditableTextModel.setText` does the same for
   * the same reason, and the reason is that an inverse function whose
   * subject no longer exists is not an undo, it is a surprise.
   */
  clear(): void {
    this.entries.length = 0;
    this.undone.length = 0;
    this.sealed = false;
    this.publish();
  }

  private run(action: () => void): void {
    this.running = true;
    try {
      action();
    } finally {
      this.running = false;
    }
  }

  private publish(): void {
    const next: UndoLabels = {
      undo: this.entries[this.entries.length - 1]?.label ?? null,
      redo: this.undone[this.undone.length - 1]?.label ?? null
    };
    // Structural comparison rather than a write per push: coalescing a
    // drag rewrites the same label sixty times, and a menu bound to
    // these should redraw when the words change and not before.
    if (next.undo !== this.labels.value.undo || next.redo !== this.labels.value.redo) {
      this.labels.value = next;
    }
  }
}
