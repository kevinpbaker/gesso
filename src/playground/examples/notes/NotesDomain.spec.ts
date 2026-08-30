import { describe, expect, it } from 'vitest';

import { NotesDomain } from './NotesDomain';
import { InMemoryNotesRepository, type Note } from './NotesRepository';
import { NotesViewModel } from './NotesViewModel';

/**
 * The application layer, tested with nothing but vitest.
 *
 * No runtime, no graph, no canvas, no worker — that is the whole point
 * of the barrier being a declared contract. Everything below is plain
 * classes over plain observables, so the rules can be checked directly
 * rather than through a rendered screen.
 */

const SEED: readonly Note[] = [
  { id: 'n1', title: 'First', body: 'one\ntwo', updatedAt: 300 },
  { id: 'n2', title: 'Second', body: '', updatedAt: 200 },
  { id: 'n3', title: '  ', body: '\n\nbody after blanks', updatedAt: 100 }
];

function build(seed: readonly Note[] = SEED) {
  const repository = new InMemoryNotesRepository(seed);
  let clock = 1000;
  const domain = new NotesDomain(repository, () => ++clock);
  return { repository, domain, view: new NotesViewModel(domain) };
}

function latest<T>(observable: { subscribe(next: (value: T) => void): { unsubscribe(): void } }): T {
  let value!: T;
  observable.subscribe(next => (value = next)).unsubscribe();
  return value;
}

describe('NotesDomain', () => {
  it('opens the first note and orders newest first', () => {
    const { domain } = build();
    expect(latest(domain.open)?.id).toBe('n1');
    expect(latest(domain.ordered).map(note => note.id)).toEqual(['n1', 'n2', 'n3']);
  });

  it('creates a note, selects it, and stamps it as newest', () => {
    const { domain } = build();
    const id = domain.create();
    expect(latest(domain.open)?.id).toBe(id);
    expect(latest(domain.ordered)[0]!.id).toBe(id);
  });

  it('moves the selection to the newest survivor when the open note is deleted', () => {
    const { domain } = build();
    domain.remove('n1');
    expect(latest(domain.open)?.id).toBe('n2');
  });

  it('leaves the selection alone when some other note is deleted', () => {
    const { domain } = build();
    domain.remove('n3');
    expect(latest(domain.open)?.id).toBe('n1');
  });

  it('has nothing open once the last note is gone', () => {
    const { domain } = build([SEED[0]!]);
    domain.remove('n1');
    expect(latest(domain.open)).toBeNull();
  });

  it('stamps an edit and leaves every other note untouched', () => {
    const { domain, repository } = build();
    domain.select('n3');
    domain.setTitle('Renamed');
    const notes = repository.current();
    expect(notes.find(note => note.id === 'n3')).toMatchObject({ title: 'Renamed', updatedAt: 1001 });
    expect(notes.find(note => note.id === 'n1')).toMatchObject({ title: 'First', updatedAt: 300 });
  });

  it('ignores an edit when nothing is open', () => {
    const { domain, repository } = build([SEED[0]!]);
    domain.remove('n1');
    domain.setBody('into the void');
    expect(repository.current()).toEqual([]);
  });
});

describe('NotesViewModel', () => {
  it('names an untitled note and previews its first non-blank line', () => {
    const { view } = build();
    const rows = latest(view.rows);
    expect(rows.map(row => row.title)).toEqual(['First', 'Second', 'Untitled']);
    expect(rows[2]!.preview).toBe('body after blanks');
    expect(rows[1]!.preview).toBe('No additional text');
  });

  it('marks exactly the open note as selected', () => {
    const { domain, view } = build();
    domain.select('n2');
    expect(
      latest(view.rows)
        .filter(row => row.selected)
        .map(row => row.id)
    ).toEqual(['n2']);
  });

  it('trims a preview to a row rather than sending the whole body', () => {
    const { view } = build([{ id: 'n1', title: 'Long', body: 'x'.repeat(500), updatedAt: 1 }]);
    expect(latest(view.rows)[0]!.preview).toHaveLength(60);
  });

  it('flattens the open note to what crosses the barrier', () => {
    const { view } = build();
    // A formatted string, not a Date and not a raw timestamp: the
    // first cannot cross, and the second would make the view build a
    // Date on every keystroke.
    expect(latest(view.open)).toMatchObject({ id: 'n1', title: 'First', body: 'one\ntwo' });
    expect(typeof latest(view.open)!.editedAt).toBe('string');
  });
});
