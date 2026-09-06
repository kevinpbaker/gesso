import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { computed } from './computed';
import { internalState } from './InternalState';
import { select } from './select';

interface Track {
  readonly title: string;
  readonly tags: readonly string[];
}

describe('select', () => {
  it('reads one field of a cell as a cell', () => {
    const track = internalState<Track>({ title: 'One', tags: [] });
    const title = select(track, 'title');

    expect(title.value).toBe('One');
    track.value = { title: 'Two', tags: [] };
    expect(title.value).toBe('Two');
  });

  it('emits only when the projected value changes, not when the source does', () => {
    const track = internalState<Track>({ title: 'One', tags: [] });
    const seen: string[] = [];
    select(track, 'title').subscribe(value => seen.push(value));

    track.value = { title: 'One', tags: ['a'] };
    track.value = { title: 'Two', tags: ['a'] };

    expect(seen).toEqual(['One', 'Two']);
  });

  it('compares structurally, so a rebuilt equal projection is not a change', () => {
    const track = internalState<Track>({ title: 'One', tags: ['a'] });
    const seen: unknown[] = [];
    select(track, entry => [...entry.tags]).subscribe(value => seen.push(value));

    track.value = { title: 'Two', tags: ['a'] };

    expect(seen).toHaveLength(1);
  });

  it('takes a source that is a stream rather than a cell', () => {
    const track = new Subject<Track>();
    const seen: string[] = [];
    select(track, 'title').subscribe(value => seen.push(value));

    track.next({ title: 'One', tags: [] });
    track.next({ title: 'One', tags: ['a'] });
    track.next({ title: 'Two', tags: [] });

    expect(seen).toEqual([undefined as unknown as string, 'One', 'Two']);
  });

  it('is a cell, so a computed over it follows it', () => {
    const track = internalState<Track>({ title: 'One', tags: [] });
    const shout = computed(() => select(track, 'title').value.toUpperCase());

    expect(shout.value).toBe('ONE');
  });

  it('reads a nullable source through the function form', () => {
    const track = new BehaviorSubject<Track | null>(null);
    const title = select(track, entry => entry?.title ?? '');

    expect(title.value).toBe('');
    track.next({ title: 'One', tags: [] });
    expect(title.value).toBe('One');
  });
});
