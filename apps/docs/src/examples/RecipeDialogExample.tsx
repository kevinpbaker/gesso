import { map } from 'rxjs/operators';

import { autoFocus, focusRing, percent, type UiChild } from '@gesso/core';
import { Dialog, keymap, Toast } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_ACCENT, HOVER_CONTROL } from './interaction';

/** One value each, so a modifier is not rebuilt per render. */
const RING = focusRing();
const AUTO_FOCUS = autoFocus();

interface Note {
  readonly title: string;
}

const NOTES: readonly Note[] = [{ title: 'Quarterly report' }, { title: 'Reading list' }, { title: 'Interview notes' }];

// #region button
/**
 * A hand-written button, with everything a hand-written button needs.
 *
 * Four things, and all four are the application's to supply: the
 * hover and press states, the pointer cursor, the focus ring, and the
 * keys. Nothing in the runtime turns Enter on a focused button into a
 * click, so a control built out of intrinsics is not operable from
 * the keyboard until it says which keys operate it.
 *
 * `takesFocus` adds `autoFocus()`, which fires on the node's first
 * layout and once only. That is the whole mechanism behind the undo
 * button taking the caret when it appears.
 */
function Action(options: {
  label: string;
  text: string;
  danger?: boolean;
  takesFocus?: boolean;
  onPress: () => void;
}): UiChild {
  const press = () => options.onPress();
  const danger = options.danger === true;
  const modifiers = danger ? [HOVER_ACCENT, RING] : [HOVER_CONTROL, RING];

  return (
    <button
      label={options.label}
      onClick={press}
      onKeyDown={keymap({ Enter: press, ' ': press })}
      padding={8}
      borderRadius={6}
      borderWidth={danger ? 0 : 1}
      borderColor="border"
      backgroundColor={danger ? 'danger' : 'background'}
      cursor="pointer"
      modifiers={options.takesFocus === true ? [...modifiers, AUTO_FOCUS] : modifiers}>
      <text text={options.text} fontSize={12} color={danger ? 'background' : 'text'} />
    </button>
  );
}
// #endregion button

// #region flow
/**
 * The flow, as four cells and four handlers.
 *
 * There is nothing happening, a dialog asking, a deletion that can
 * still be taken back, and a deletion that cannot. Every handler is
 * written so that running it twice is the same as running it once.
 *
 * That last property is not decoration. `Dialog` reports a close
 * twice, once from the overlay entry and once from the component; the
 * note on the Dialog page has the detail. Writing a cell is
 * unaffected by being written again, which is why `dismiss` is one
 * assignment rather than an append to a log.
 *
 * The undo window is the notice's lifetime: when the `Toast` closes,
 * on its own timer, the deletion becomes permanent. Tying the two
 * together is what stops the message saying one thing while the list
 * means another.
 */
function noteFlow() {
  const notes = internalState<readonly Note[]>(NOTES);
  /** The note the dialog is asking about, or null when it is closed. */
  const confirming = internalState<Note | null>(null);
  /** Deleted, and still recoverable: the note, and where it was. */
  const pending = internalState<{ note: Note; index: number } | null>(null);
  const notice = internalState(false);

  /** Safe to run more than once, which is what `Dialog` requires. */
  const dismiss = (): void => {
    confirming.value = null;
  };

  const remove = (): void => {
    const note = confirming.value;
    if (note === null) {
      return;
    }
    pending.value = { note, index: notes.value.indexOf(note) };
    notes.value = notes.value.filter(entry => entry !== note);
    dismiss();
    notice.value = true;
  };

  const undo = (): void => {
    const held = pending.value;
    if (held === null) {
      return;
    }
    const restored = [...notes.value];
    restored.splice(held.index, 0, held.note);
    notes.value = restored;
    pending.value = null;
    notice.value = false;
  };

  /** The notice going away is the deletion becoming permanent. */
  const commit = (): void => {
    pending.value = null;
    notice.value = false;
  };

  return { notes, confirming, pending, notice, dismiss, remove, undo, commit };
}
// #endregion flow

// #region row
/**
 * A row, and the button that starts the flow.
 *
 * The row is a `listitem` with no label of its own, so its name is
 * the text it draws. The button inside is a semantics node in its own
 * right, so it is not swallowed into that name, and its label says
 * which note it deletes: "Delete" three times over is three identical
 * announcements.
 */
function noteRow(title: string, onDelete: () => void): UiChild {
  return (
    <row
      gap={10}
      y="center"
      padding={8}
      borderRadius={8}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface"
      role="listitem">
      <text text={title} fontSize={13} color="text" flexGrow={1} />
      {Action({ label: `Delete ${title}`, text: 'Delete', onPress: onDelete })}
    </row>
  );
}
// #endregion row

// #region screen
/**
 * A list, a confirmation, and a way back.
 *
 * Two things about focus are worth watching, and the spec drives both
 * with the keyboard alone.
 *
 * **Cancel gives the keyboard back.** The trap the dialog took is
 * released when it closes, and releasing a trap restores focus to
 * whatever held it when the trap was taken, which is the row's Delete
 * button. Nothing here arranges that.
 *
 * **Confirming cannot.** The button that opened the dialog goes with
 * the row it was on, and a trap will not restore focus to a node that
 * has left the tree, so focus would be dropped. The undo button
 * carries `autoFocus()` for exactly that reason: it appears in the
 * same frame the row leaves, takes the caret, and the reader can take
 * the deletion back with the key they just pressed.
 *
 * The notice is `dismissible={false}` deliberately. Its close button
 * would be a focus stop drawn over the app in an order nobody can
 * predict from the page, so the action lives in the page instead and
 * the notice only announces.
 */
export function NoteList(_props: Inputs<{}>, _ctx: ComponentContext) {
  const flow = noteFlow();

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)}>
      <column gap={8} role="list" label="Notes">
        {flow.notes.pipe(
          map(list =>
            list.map(note =>
              noteRow(note.title, () => {
                flow.confirming.value = note;
              })
            )
          )
        )}
      </column>

      <row gap={10} y="center" minHeight={34}>
        {flow.pending.pipe(
          map(held =>
            held === null
              ? []
              : [
                  Action({
                    label: `Undo deleting ${held.note.title}`,
                    text: 'Undo',
                    takesFocus: true,
                    onPress: flow.undo
                  })
                ]
          )
        )}
        <text
          text={flow.pending.pipe(
            map(held => (held === null ? 'Nothing has been deleted.' : `Deleted "${held.note.title}".`))
          )}
          fontSize={12}
          color="textMuted"
        />
      </row>

      <Dialog
        open={flow.confirming.pipe(map(note => note !== null))}
        title="Delete this note?"
        description={flow.confirming.pipe(
          map(note => (note === null ? '' : `"${note.title}" leaves the list. You can take it back once.`))
        )}
        onClose={flow.dismiss}
        content={
          <row gap={8}>
            {Action({ label: 'Keep it', text: 'Keep it', onPress: flow.dismiss })}
            {Action({ label: 'Delete', text: 'Delete', danger: true, onPress: flow.remove })}
          </row>
        }
      />

      <Toast
        open={flow.notice}
        message={flow.pending.pipe(map(held => (held === null ? 'Note deleted' : `Deleted "${held.note.title}"`)))}
        duration={4000}
        dismissible={false}
        onClose={flow.commit}
      />
    </column>
  );
}
// #endregion screen
