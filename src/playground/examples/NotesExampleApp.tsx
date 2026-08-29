import { combineLatest } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import type { ComponentContext, Inputs } from '../../framework/FunctionComponent';
import { ShellStore } from '../../framework/app/ShellStore';
import { Store } from '../../framework/store/Store';
import { Action, Projection, State } from '../../framework/store/decorators';
import { state } from '../../framework/State';

/**
 * A notes app: a list of notes on the left, the selected note's title
 * and body on the right, both typed into directly.
 *
 * This is the roadmap F2 exit screen. The title is a single-line
 * `editabletext`; the body is a multi-line one inside a scroll view.
 * Everything a text field needs happens here: the caret and selection
 * are drawn by the renderer, keys and IME composition arrive through
 * the shell's editing proxy, copy and paste use the real clipboard,
 * and the store is the source of truth — each edit dispatches an
 * action and the field follows the projection back, so switching notes
 * swaps the text under the same field. It runs in the render worker.
 */

export interface Note {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly updatedAt: number;
}

export interface NoteSummary {
  readonly id: string;
  readonly title: string;
  readonly preview: string;
  readonly selected: boolean;
}

export interface NotesView {
  readonly notes: readonly NoteSummary[];
  readonly selected: Note | null;
}

const SEED: readonly Note[] = [
  {
    id: 'n1',
    title: 'Welcome to Nodal notes',
    body:
      'Click anywhere in this text and start typing.\n\n' +
      'Everything you would expect from a text field works: arrow keys, Shift to select, double-click for a word, ' +
      'Home and End, Ctrl/Cmd+A, undo and redo, copy, cut and paste.\n\n' +
      'Switch your keyboard to Japanese, Chinese or Korean and type: the IME candidate window opens at the caret, ' +
      'and the composition is underlined until you commit it. Dead keys (´ + e → é) go through the same path.\n\n' +
      'The whole UI, this text included, is drawn on a canvas by a render worker. The only DOM involved is a hidden ' +
      'textarea on the main thread that turns your keystrokes into text.',
    updatedAt: Date.now() - 3 * 60 * 60 * 1000
  },
  {
    id: 'n2',
    title: 'Groceries',
    body: 'Oat milk\nCoffee beans\nSourdough\nApples — the crisp kind\nParmesan',
    updatedAt: Date.now() - 26 * 60 * 60 * 1000
  },
  {
    id: 'n3',
    title: 'Talk outline',
    body: '1. Why a canvas UI\n2. One identity system\n3. Layout that follows the change\n4. Threads: shell, render, data\n5. What is next',
    updatedAt: Date.now() - 4 * 24 * 60 * 60 * 1000
  }
];

export class NotesStore extends Store {
  @State() notes = state<readonly Note[]>(SEED);
  @State() selectedId = state<string | null>(SEED[0].id);

  private nextId = SEED.length + 1;

  @Projection()
  get view(): NotesView {
    const selectedId = this.selectedId.value;
    const sorted = [...this.notes.value].sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      notes: sorted.map(note => ({
        id: note.id,
        title: note.title.trim().length > 0 ? note.title : 'Untitled',
        preview:
          note.body
            .split('\n')
            .find(line => line.trim().length > 0)
            ?.slice(0, 60) ?? 'No additional text',
        selected: note.id === selectedId
      })),
      selected: this.notes.value.find(note => note.id === selectedId) ?? null
    };
  }

  @Action()
  open(id: string): void {
    this.selectedId.value = id;
  }

  @Action()
  create(): void {
    const id = `n${this.nextId++}`;
    this.notes.value = [...this.notes.value, { id, title: '', body: '', updatedAt: Date.now() }];
    this.selectedId.value = id;
  }

  @Action()
  remove(id: string): void {
    const remaining = this.notes.value.filter(note => note.id !== id);
    this.notes.value = remaining;
    if (this.selectedId.value === id) {
      const next = [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      this.selectedId.value = next?.id ?? null;
    }
  }

  @Action()
  setTitle(title: string): void {
    this.update(note => ({ ...note, title }));
  }

  @Action()
  setBody(body: string): void {
    this.update(note => ({ ...note, body }));
  }

  private update(change: (note: Note) => Note): void {
    const id = this.selectedId.value;
    this.notes.value = this.notes.value.map(note =>
      note.id === id ? { ...change(note), updatedAt: Date.now() } : note
    );
  }
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const BG = '#0b1220';
const SIDEBAR = '#0f1729';
const CARD = '#111a2b';
const BORDER = '#1f2a3d';
const ROW_HOVER = '#182338';
const ROW_SELECTED = '#1e2b45';
const TEXT = '#e6edf3';
const MUTED = '#8b98a9';
const FAINT = '#5d6a7b';

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function NoteRow(props: Inputs<{ note: NoteSummary }>, ctx: ComponentContext) {
  const notes = ctx.inject(NotesStore);
  const hovered = state(false);
  const background = combineLatest([props.note, hovered]).pipe(
    map(([note, hover]) => (note.selected ? ROW_SELECTED : hover ? ROW_HOVER : 'transparent'))
  );
  return (
    <column
      padding={12}
      gap={4}
      borderRadius={8}
      backgroundColor={background}
      cursor="pointer"
      onClick={() => notes.dispatch('open', props.note.value.id)}
      onPointerEnter={() => (hovered.value = true)}
      onPointerLeave={() => (hovered.value = false)}>
      <text color={TEXT} fontSize={14} fontWeight={600} maxLines={1} textOverflow="ellipsis">
        {props.note.pipe(map(note => note.title))}
      </text>
      <text color={MUTED} fontSize={12} maxLines={1} textOverflow="ellipsis">
        {props.note.pipe(map(note => note.preview))}
      </text>
    </column>
  );
}

function Sidebar(_props: Inputs<{}>, ctx: ComponentContext) {
  const notes = ctx.inject(NotesStore);
  const rows = notes.projection.view.pipe(map(view => view.notes.map(note => <NoteRow key={note.id} note={note} />)));
  return (
    <column width={280} backgroundColor={SIDEBAR} borderColor={BORDER} borderWidth={1} padding={12} gap={12}>
      <row x="space-between" y="center" paddingLeft={4}>
        <text color={TEXT} fontSize={16} fontWeight={600}>
          Notes
        </text>
        <button
          onClick={() => notes.dispatch('create')}
          padding={6}
          paddingLeft={12}
          paddingRight={12}
          borderRadius={8}
          backgroundColor="primary"
          cursor="pointer">
          <text color="#ffffff" fontSize={13} fontWeight={600}>
            New
          </text>
        </button>
      </row>
      <scrollview gap={4} flex={1}>
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

function Editor(_props: Inputs<{}>, ctx: ComponentContext) {
  const notes = ctx.inject(NotesStore);
  const shell = ctx.inject(ShellStore);
  const view = notes.projection.view;
  const title = view.pipe(
    map(v => v.selected?.title ?? ''),
    distinctUntilChanged()
  );
  const body = view.pipe(
    map(v => v.selected?.body ?? ''),
    distinctUntilChanged()
  );
  const meta = view.pipe(
    map(v => {
      if (v.selected === null) {
        return '';
      }
      const when = new Date(v.selected.updatedAt).toLocaleString();
      const words = wordCount(v.selected.body);
      return `Edited ${when} · ${words} word${words === 1 ? '' : 's'} · ${v.selected.body.length} characters`;
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
          placeholder="Untitled"
          onInput={event => notes.dispatch('setTitle', event.value)}
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
              const selected = notes.view.selected;
              if (selected !== null) {
                shell.dispatch('copyText', `${selected.title}\n\n${selected.body}`);
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
              const selected = notes.view.selected;
              if (selected !== null) {
                notes.dispatch('remove', selected.id);
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
          multiline
          placeholder="Start writing…"
          onInput={event => notes.dispatch('setBody', event.value)}
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
export function NotesApp(_props: Inputs<{}>, ctx: ComponentContext) {
  const notes = ctx.inject(NotesStore);
  const main = notes.projection.view.pipe(
    map(v => v.selected !== null),
    distinctUntilChanged(),
    map(hasNote => (hasNote ? <Editor key="editor" /> : <EmptyState key="empty" />))
  );
  return (
    <row backgroundColor={BG} y="stretch">
      <Sidebar />
      {main}
    </row>
  );
}
