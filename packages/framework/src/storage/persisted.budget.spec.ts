import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { persisted } from './persisted';
import type { StorageAdapter, StorageOutcome, StorageRead } from './StorageAdapter';

/**
 * Budgets for persistence.
 *
 * The risk here is sugar that hides cost. The shape
 * it takes here is a write per change: a value that moves with a drag
 * or a keystroke would reach the disk sixty times a second, and on
 * `localStorage` that is sixty synchronous writes on the shell's
 * thread. The gate is what stops it, and these count what actually
 * reaches the store.
 *
 * Counts and not timings, in the shape `LayoutEngine.budget.spec.ts`
 * set.
 */
class CountingStorage implements StorageAdapter {
  reads = 0;
  written: string[] = [];

  constructor(private readonly held: string | null = null) {}

  read(): Promise<StorageRead> {
    this.reads++;
    return Promise.resolve({ outcome: 'ok', value: this.held, error: null });
  }

  write(_key: string, value: string): Promise<StorageOutcome> {
    this.written.push(value);
    return Promise.resolve('ok');
  }

  remove(): Promise<StorageOutcome> {
    return Promise.resolve('ok');
  }

  keys(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
}

describe('persisted budgets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes once for five hundred changes inside the gate', async () => {
    const store = new CountingStorage();
    const state = persisted(store, 'position', { initial: 0, settle: 100 });
    await state.hydrated;

    for (let at = 1; at <= 500; at++) {
      state.set(at);
    }
    await vi.advanceTimersByTimeAsync(100);

    expect(store.written).toEqual(['500']);
  });

  it('reads once at start, whatever is following it', async () => {
    const store = new CountingStorage('7');
    const state = persisted(store, 'position', { initial: 0, settle: 100 });
    const following = [state.value.subscribe(), state.value.subscribe(), state.status.subscribe()];
    await state.hydrated;

    expect(store.reads).toBe(1);
    for (const subscription of following) {
      subscription.unsubscribe();
    }
  });

  it('writes nothing when a value comes back to what is stored', async () => {
    const store = new CountingStorage('3');
    const state = persisted(store, 'position', { initial: 0, settle: 100 });
    await state.hydrated;

    state.set(9);
    state.set(3);
    await vi.advanceTimersByTimeAsync(100);

    expect(store.written).toEqual([]);
  });

  it('writes nothing at all when nothing changed', async () => {
    const store = new CountingStorage('3');
    const state = persisted(store, 'position', { initial: 0, settle: 100 });
    await state.hydrated;

    await vi.advanceTimersByTimeAsync(1000);

    // Hydration writing back what it read would be one wasted write
    // per screen per start, which is the cheapest kind of waste to
    // ship and the hardest to notice.
    expect(store.written).toEqual([]);
  });

  it('takes one write per settled burst, not one per burst member', async () => {
    const store = new CountingStorage();
    const state = persisted(store, 'position', { initial: 0, settle: 50 });
    await state.hydrated;

    for (let burst = 1; burst <= 3; burst++) {
      for (let at = 0; at < 20; at++) {
        state.set(burst * 100 + at);
      }
      await vi.advanceTimersByTimeAsync(50);
    }

    expect(store.written).toEqual(['119', '219', '319']);
  });
});
