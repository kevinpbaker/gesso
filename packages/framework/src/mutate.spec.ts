import { describe, expect, it } from 'vitest';

import { internalState } from './InternalState';
import { mutate } from './mutate';

/** The toggle every optimistic like is: in the list, or not. */
const toggled = (list: readonly string[], id: string): readonly string[] =>
  list.includes(id) ? list.filter(entry => entry !== id) : [...list, id];

/** A commit the spec settles by hand, so the race can be written down. */
function held() {
  const waiting: { resolve: (value: unknown) => void; reject: (error: unknown) => void }[] = [];
  return {
    commit: (): Promise<unknown> => new Promise((resolve, reject) => waiting.push({ resolve, reject })),
    accept: (index: number) => waiting[index]!.resolve(undefined),
    refuse: (index: number) => waiting[index]!.reject(new Error('refused')),
    calls: () => waiting.length
  };
}

describe('mutate', () => {
  it('applies the change before the commit, not after it', async () => {
    const favourites = internalState<readonly string[]>([]);
    const commit = held();
    const like = mutate(favourites, toggled, commit.commit);

    const running = like.run('t1');
    // No await between the press and the change: that is the point.
    expect(favourites.value).toEqual(['t1']);
    commit.accept(0);
    expect(await running).toBe(true);
    expect(favourites.value).toEqual(['t1']);
  });

  it('puts a refused change back', async () => {
    const favourites = internalState<readonly string[]>([]);
    const commit = held();
    const like = mutate(favourites, toggled, commit.commit);

    const running = like.run('t1');
    commit.refuse(0);
    expect(await running).toBe(false);
    expect(favourites.value).toEqual([]);
  });

  it('treats a commit answering false as a refusal', async () => {
    const favourites = internalState<readonly string[]>([]);
    const like = mutate(favourites, toggled, async () => false);

    expect(await like.run('t1')).toBe(false);
    expect(favourites.value).toEqual([]);
  });

  it('lets anything else through, undefined included', async () => {
    const favourites = internalState<readonly string[]>([]);
    const like = mutate(favourites, toggled, async () => undefined);

    expect(await like.run('t1')).toBe(true);
    expect(favourites.value).toEqual(['t1']);
  });

  it('leaves a newer change alone when the rejection arrives late', async () => {
    // Without the guard a slow rejection fights a fast second press,
    // and the cell ends up saying the opposite of the last thing
    // anyone did.
    const favourites = internalState<readonly string[]>([]);
    const commit = held();
    const like = mutate(favourites, toggled, commit.commit);

    const first = like.run('t1');
    expect(favourites.value).toEqual(['t1']);
    void like.run('t1');
    expect(favourites.value).toEqual([]);

    commit.refuse(0);
    expect(await first).toBe(false);
    expect(favourites.value).toEqual([]);
  });

  it('compares structurally, so a rebuilt equal value still rolls back', async () => {
    const record = internalState({ title: 'before' });
    const commit = held();
    const rename = mutate(record, (_current, title: string) => ({ title }), commit.commit);

    const running = rename.run('after');
    // Something rewrote the cell with an equal but different object.
    record.value = { title: 'after' };
    commit.refuse(0);
    await running;
    expect(record.value).toEqual({ title: 'before' });
  });

  it('counts writes in flight and settles back to none', async () => {
    const favourites = internalState<readonly string[]>([]);
    const commit = held();
    const like = mutate(favourites, toggled, commit.commit);
    const seen: number[] = [];
    const following = like.pending.subscribe(value => seen.push(value));

    const first = like.run('t1');
    const second = like.run('t2');
    expect(like.pending.value).toBe(2);
    commit.accept(0);
    commit.accept(1);
    await Promise.all([first, second]);
    following.unsubscribe();
    // A count and not a flag: two presses are two writes, and a flag
    // cleared by the first would say the second had finished.
    expect(seen).toEqual([0, 1, 2, 1, 0]);
  });

  it('hands the applied value to the commit, so the write knows what it is confirming', async () => {
    const favourites = internalState<readonly string[]>(['t1']);
    const applied: (readonly string[])[] = [];
    const like = mutate(favourites, toggled, async (_id: string, next: readonly string[]) => {
      applied.push(next);
    });

    await like.run('t1');
    expect(applied).toEqual([[]]);
  });
});
