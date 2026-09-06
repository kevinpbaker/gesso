import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { persisted } from './persisted';
import { MemoryStorage, type StorageAdapter, type StorageOutcome, type StorageRead } from './StorageAdapter';

interface Settings {
  readonly theme: string;
  readonly density: number;
}

const DEFAULTS: Settings = { theme: 'light', density: 1 };

/** A store that answers whatever the spec tells it to, when it likes. */
class ScriptedStorage implements StorageAdapter {
  read: () => Promise<StorageRead>;
  writes: string[] = [];
  removed = 0;
  outcome: StorageOutcome = 'ok';

  constructor(read: StorageRead) {
    this.read = () => Promise.resolve(read);
  }

  write(_key: string, value: string): Promise<StorageOutcome> {
    this.writes.push(value);
    return Promise.resolve(this.outcome);
  }

  remove(): Promise<StorageOutcome> {
    this.removed++;
    return Promise.resolve('ok');
  }

  keys(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
}

function stored(value: string): StorageRead {
  return { outcome: 'ok', value, error: null };
}

describe('persisted', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the default while the read is in the air', async () => {
    const state = persisted(new ScriptedStorage(stored('{"theme":"dark","density":2}')), 'settings', {
      initial: DEFAULTS
    });

    // The frame the screen mounts on: the default, and `loading`.
    // Nothing null, and no fourth state to draw.
    expect(state.current).toEqual(DEFAULTS);
    expect(state.status.value).toBe('loading');

    await state.hydrated;

    expect(state.current).toEqual({ theme: 'dark', density: 2 });
    expect(state.status.value).toBe('ready');
  });

  it('says missing when nothing was stored, and keeps the default', async () => {
    const state = persisted(new MemoryStorage(), 'settings', { initial: DEFAULTS });

    await state.hydrated;

    expect(state.status.value).toBe('missing');
    expect(state.current).toEqual(DEFAULTS);
  });

  it('says failed when the store refused, and keeps the default', async () => {
    const store = new ScriptedStorage(stored(''));
    store.read = () => Promise.resolve({ outcome: 'denied', value: null, error: 'blocked here' });
    const state = persisted(store, 'settings', { initial: DEFAULTS });

    await state.hydrated;

    expect(state.status.value).toBe('failed');
    expect(state.error.value).toBe('blocked here');
    expect(state.current).toEqual(DEFAULTS);
  });

  it('treats a half-written record as nothing stored', async () => {
    const state = persisted(new ScriptedStorage(stored('{"theme":')), 'settings', { initial: DEFAULTS });

    await state.hydrated;

    expect(state.status.value).toBe('missing');
    expect(state.current).toEqual(DEFAULTS);
  });

  it('refuses a record an older build wrote', async () => {
    const state = persisted(new ScriptedStorage(stored('{"colour":"dark"}')), 'settings', {
      initial: DEFAULTS,
      revive: raw => (typeof (raw as Settings).theme === 'string' ? (raw as Settings) : null)
    });

    await state.hydrated;

    expect(state.status.value).toBe('missing');
    expect(state.current).toEqual(DEFAULTS);
  });

  it('leaves a value the person set before the read landed', async () => {
    const store = new ScriptedStorage(stored('{"theme":"dark","density":2}'));
    const state = persisted(store, 'settings', { initial: DEFAULTS });

    // A press one frame after the screen opened, before OPFS answered.
    state.set({ theme: 'sepia', density: 3 });
    await state.hydrated;

    // Theirs is the newer truth. The same guard `mutate` puts on its
    // rollback, for the same reason.
    expect(state.current).toEqual({ theme: 'sepia', density: 3 });
  });

  it('writes once the changes stop', async () => {
    const store = new ScriptedStorage(stored('{"theme":"light","density":1}'));
    const state = persisted(store, 'settings', { initial: DEFAULTS, settle: 200 });
    await state.hydrated;

    state.set({ theme: 'dark', density: 1 });
    expect(store.writes).toEqual([]);

    await vi.advanceTimersByTimeAsync(200);

    expect(store.writes).toEqual(['{"theme":"dark","density":1}']);
  });

  it('does not write back what it just read', async () => {
    const store = new ScriptedStorage(stored('{"theme":"dark","density":2}'));
    const state = persisted(store, 'settings', { initial: DEFAULTS, settle: 200 });
    await state.hydrated;

    await vi.advanceTimersByTimeAsync(500);

    expect(store.writes).toEqual([]);
  });

  it('writes at once when asked to save', async () => {
    const store = new ScriptedStorage(stored('{"theme":"light","density":1}'));
    const state = persisted(store, 'settings', { initial: DEFAULTS, settle: 5000 });
    await state.hydrated;

    state.set({ theme: 'dark', density: 1 });
    await state.save();

    expect(store.writes).toEqual(['{"theme":"dark","density":1}']);
  });

  it('keeps the value and reports the failure when the store is full', async () => {
    const store = new ScriptedStorage(stored('{"theme":"light","density":1}'));
    const state = persisted(store, 'settings', { initial: DEFAULTS, settle: 0 });
    await state.hydrated;
    store.outcome = 'full';

    state.set({ theme: 'dark', density: 1 });
    await state.save();

    // The change is real and only the remembering of it failed, so
    // nothing is rolled back.
    expect(state.current).toEqual({ theme: 'dark', density: 1 });
    expect(state.saveError.value).toBe('There is no room left to store this.');

    // And the next one is still attempted, because a quota can be
    // given back.
    store.outcome = 'ok';
    state.set({ theme: 'sepia', density: 1 });
    await state.save();
    expect(state.saveError.value).toBeNull();
    expect(store.writes.length).toBe(2);
  });

  it('stops writing after a denial', async () => {
    const store = new ScriptedStorage(stored('{"theme":"light","density":1}'));
    const state = persisted(store, 'settings', { initial: DEFAULTS, settle: 0 });
    await state.hydrated;
    store.outcome = 'denied';

    state.set({ theme: 'dark', density: 1 });
    await state.save();
    expect(store.writes.length).toBe(1);

    state.set({ theme: 'sepia', density: 1 });
    await state.save();

    // Permanent for the session: asking again is work that cannot
    // change the answer.
    expect(store.writes.length).toBe(1);
  });

  it('counts the writes in the air', async () => {
    const store = new ScriptedStorage(stored('{"theme":"light","density":1}'));
    const state = persisted(store, 'settings', { initial: DEFAULTS, settle: 0 });
    await state.hydrated;

    state.set({ theme: 'dark', density: 1 });
    const saving = state.save();
    expect(state.saving.value).toBe(1);

    await saving;
    expect(state.saving.value).toBe(0);
  });

  it('forgets the record and the value together', async () => {
    const store = new ScriptedStorage(stored('{"theme":"dark","density":2}'));
    const state = persisted(store, 'settings', { initial: DEFAULTS, settle: 0 });
    await state.hydrated;

    await state.forget();

    expect(store.removed).toBe(1);
    expect(state.current).toEqual(DEFAULTS);
  });

  it('stops writing once disposed', async () => {
    const store = new ScriptedStorage(stored('{"theme":"light","density":1}'));
    const state = persisted(store, 'settings', { initial: DEFAULTS, settle: 10 });
    await state.hydrated;

    state.set({ theme: 'dark', density: 1 });
    state.dispose();
    await vi.advanceTimersByTimeAsync(100);

    expect(store.writes).toEqual([]);
  });
});
