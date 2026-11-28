import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { snapshot } from './snapshot';

describe('snapshot', () => {
  it('projects a shared type to plain data and follows it', () => {
    const doc = new Y.Doc();
    const cards = doc.getArray<Y.Map<unknown>>('cards');
    const rows = snapshot(cards, type => type.toJSON() as { title: string }[]);

    expect(rows.value).toEqual([]);

    doc.transact(() => {
      const card = new Y.Map<unknown>();
      card.set('title', 'First');
      cards.push([card]);
    });
    expect(rows.value).toEqual([{ title: 'First' }]);

    cards.get(0).set('title', 'Renamed');
    expect(rows.value).toEqual([{ title: 'Renamed' }]);
  });

  it('projects once per transaction, however much it changed', () => {
    const doc = new Y.Doc();
    const titles = doc.getArray<string>('titles');
    const cell = snapshot(titles);
    const seen: unknown[] = [];
    cell.subscribe(value => seen.push(value));

    doc.transact(() => {
      titles.push(['a']);
      titles.push(['b']);
      titles.push(['c']);
    });

    expect(seen).toEqual([[], ['a', 'b', 'c']]);
  });

  it('does not project for a change to another type', () => {
    const doc = new Y.Doc();
    const cell = snapshot(doc.getArray<string>('titles'));
    const seen: unknown[] = [];
    cell.subscribe(value => seen.push(value));

    doc.getMap('meta').set('name', 'Board');

    expect(seen).toHaveLength(1);
  });

  it('ends with an error naming the path when a value cannot cross', () => {
    const doc = new Y.Doc();
    const meta = doc.getMap<unknown>('meta');
    const cell = snapshot(meta, undefined, { label: 'meta' });
    let failure: Error | null = null;
    cell.subscribe({ error: (error: Error) => (failure = error) });

    meta.set('thumbnail', new Uint8Array([1, 2, 3]));

    expect(failure).not.toBeNull();
    expect(failure!.message).toContain('meta: the value at ".thumbnail" is not plain data');
  });

  it('stops following once disposed and keeps its last value', () => {
    const doc = new Y.Doc();
    const titles = doc.getArray<string>('titles');
    const cell = snapshot(titles);
    titles.push(['kept']);
    cell.dispose();
    titles.push(['ignored']);

    expect(cell.value).toEqual(['kept']);
  });
});
