import { combineLatest } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { type ComponentContext, type Inputs, ShellService, internalState } from 'gesso-framework';
import { Notes, type NoteRow as NoteRowData } from './notes/NotesContract';
import {
  ACCENT_WASH,
  BORDER,
  BORDER_STRONG,
  CHALK,
  GROUND,
  gessoTheme,
  SURFACE,
  SURFACE_OVERLAY,
  SURFACE_RAISED,
  TEXT,
  TEXT_FAINT,
  TEXT_MUTED
} from './brand';

/**
 * A notes app: a list of notes on the left, the selected note's title
 * and body on the right, both typed into directly.
 *
 * This is the editing exit screen, and also the first screen built
 * the way the thread model describes. Nothing in this file holds application state or knows
 * where it comes from: it reads view keys off the `Notes` channel and
 * sends commands back. The notebook itself — a repository, the rules,
 * the shaping — is plain code in `notes/`, running on the application
 * worker, and shares nothing with this file but the token.
 *
 * Everything a text field needs still happens here: the caret and
 * selection are drawn by the renderer, keys and IME composition arrive
 * through the shell's editing proxy, copy and paste use the real
 * clipboard, and each edit sends a command whose effect returns as a
 * patch, so switching notes swaps the text under the same field.
 */

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/*
 * Roles, taken from the shared Gesso ramp in `brand.ts`. Only the two
 * row states are named locally, because "the row under the pointer"
 * and "the row you are reading" are this screen's own vocabulary.
 */
const BG = GROUND;
const SIDEBAR = SURFACE;
const CARD = SURFACE_RAISED;
const ROW_HOVER = SURFACE_OVERLAY;
const ROW_SELECTED = ACCENT_WASH;
const MUTED = TEXT_MUTED;
const FAINT = TEXT_FAINT;

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function NoteRow(inputs: Inputs<{ note: NoteRowData }>, ctx: ComponentContext) {
  const notes = ctx.channel(Notes);
  const hovered = internalState(false);
  const background = combineLatest([inputs.note, hovered]).pipe(
    map(([note, hover]) => (note.selected ? ROW_SELECTED : hover ? ROW_HOVER : 'transparent'))
  );
  return (
    <column
      padding={12}
      gap={4}
      borderRadius={8}
      backgroundColor={background}
      cursor="pointer"
      // A row is one item of the sidebar's list, named by its title:
      // its preview is the second line on screen and would be a second
      // sentence in a screen reader's ear for no gain.
      //
      // `list`/`listitem` rather than `listbox`/`option`, even though
      // exactly one row is selected at a time: a listbox promises a
      // keyboard interaction pattern this hand-written sidebar does
      // not implement, and the `selected` state ARIA would carry with
      // it is dropped by the platform on a `listitem` anyway. Which
      // note is open is announced by the editor beside it.
      role="listitem"
      label={inputs.note.pipe(map(note => note.title))}
      onClick={() => notes.send.open(inputs.note.value.id)}
      onPointerEnter={() => (hovered.value = true)}
      onPointerLeave={() => (hovered.value = false)}>
      <text color={TEXT} fontSize={14} fontWeight={600} maxLines={1} textOverflow="ellipsis">
        {inputs.note.pipe(map(note => note.title))}
      </text>
      <text color={MUTED} fontSize={12} maxLines={1} textOverflow="ellipsis">
        {inputs.note.pipe(map(note => note.preview))}
      </text>
    </column>
  );
}

function Sidebar(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const notes = ctx.channel(Notes);
  // Bound straight off the view key. No projection, no store, no
  // `undefined` before the first patch — the token's initial value is
  // an empty list, so this renders an empty sidebar and then fills it.
  const rows = notes.view.rows.pipe(map(list => list.map(note => <NoteRow key={note.id} note={note} />)));
  return (
    <column width={280} backgroundColor={SIDEBAR} borderColor={BORDER_STRONG} borderWidth={1} padding={12} gap={12}>
      <row x="space-between" y="center" paddingLeft={4}>
        <text color={TEXT} fontSize={16} fontWeight={600}>
          Notes
        </text>
        <button
          label="New note"
          onClick={() => notes.send.create()}
          padding={6}
          paddingLeft={12}
          paddingRight={12}
          borderRadius={8}
          backgroundColor="primary"
          cursor="pointer">
          <text color={CHALK} fontSize={13} fontWeight={600}>
            New
          </text>
        </button>
      </row>
      <scrollview gap={4} flex={1} role="list" label="Notes">
        {rows}
      </scrollview>
    </column>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words === null ? 0 : words.length;
}

function Editor(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const notes = ctx.channel(Notes);
  const shell = ctx.inject(ShellService);
  const open = notes.view.open;
  const title = open.pipe(
    map(note => note?.title ?? ''),
    distinctUntilChanged()
  );
  const body = open.pipe(
    map(note => note?.body ?? ''),
    distinctUntilChanged()
  );
  const meta = open.pipe(
    map(note => {
      if (note === null) {
        return '';
      }
      // `editedAt` arrives formatted; the counts are derived from a
      // body this thread already holds, so neither costs the wire
      // anything.
      const words = wordCount(note.body);
      return `Edited ${note.editedAt} · ${words} word${words === 1 ? '' : 's'} · ${note.body.length} characters`;
    })
  );
  // `flex={1}` rather than `flexGrow={1}` here and on the title, as in
  // CSS `flex: 1`: it sets the flex basis to 0, so the editor takes the
  // width the row has left over. With the default content basis the
  // editor's base is the note's max-content width — one long line makes
  // it wider than the row, and the sidebar, shrinkable like any flex
  // item, gives up width with every character typed.
  return (
    <column flex={1} padding={32} gap={16}>
      <row x="space-between" y="center" gap={16}>
        <editabletext
          value={title}
          label="Note title"
          placeholder="Untitled"
          onInput={event => notes.send.setTitle(event.value)}
          color={TEXT}
          fontSize={24}
          fontWeight={600}
          textWrap="none"
          flex={1}
          padding={6}
          borderRadius={6}
        />
        <row gap={8}>
          <button
            onClick={() => {
              const selected = notes.view.open.value;
              if (selected !== null) {
                shell.copyText(`${selected.title}\n\n${selected.body}`);
              }
            }}
            padding={8}
            paddingLeft={12}
            paddingRight={12}
            borderRadius={8}
            backgroundColor={CARD}
            borderColor={BORDER}
            borderWidth={1}
            cursor="pointer">
            <text color={TEXT} fontSize={13}>
              Copy note
            </text>
          </button>
          <button
            onClick={() => {
              const selected = notes.view.open.value;
              if (selected !== null) {
                notes.send.remove(selected.id);
              }
            }}
            padding={8}
            paddingLeft={12}
            paddingRight={12}
            borderRadius={8}
            backgroundColor={CARD}
            borderColor={BORDER}
            borderWidth={1}
            cursor="pointer">
            <text color={MUTED} fontSize={13}>
              Delete
            </text>
          </button>
        </row>
      </row>
      <text color={FAINT} fontSize={12} paddingLeft={6}>
        {meta}
      </text>
      <scrollview flex={1} backgroundColor={CARD} borderColor={BORDER} borderWidth={1} borderRadius={12} padding={20}>
        <editabletext
          value={body}
          label="Note body"
          multiline
          placeholder="Start writing…"
          onInput={event => notes.send.setBody(event.value)}
          color={TEXT}
          fontSize={15}
          lineHeight={24}
          minHeight={200}
        />
      </scrollview>
      <text color={FAINT} fontSize={12} paddingLeft={6}>
        Text is edited in the render worker; the main thread forwards keys, IME composition and the clipboard through a
        hidden textarea.
      </text>
    </column>
  );
}

function EmptyState() {
  return (
    <column flex={1} x="center" y="center" gap={12}>
      <text color={MUTED} fontSize={15}>
        No notes. Create one to start writing.
      </text>
    </column>
  );
}

/** The editor while a note is selected, else the empty state; the sidebar stays. */
export function NotesApp(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const notes = ctx.channel(Notes);
  const main = notes.view.open.pipe(
    map(note => note !== null),
    distinctUntilChanged(),
    map(hasNote => (hasNote ? <Editor key="editor" /> : <EmptyState key="empty" />))
  );
  return (
    <row theme={gessoTheme} backgroundColor={BG} y="stretch">
      <Sidebar />
      {main}
    </row>
  );
}
