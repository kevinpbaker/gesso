import { describe, expect, it } from 'vitest';

import { internalState } from './InternalState';
import { resource, type ResourceStatus } from './resource';

/** A fetch that answers when the spec says so, one deferral per key asked for. */
function deferred<T>() {
  const waiting: { key: string; resolve: (value: T | null) => void; reject: (error: unknown) => void }[] = [];
  const fetch = (key: string): Promise<T | null> =>
    new Promise<T | null>((resolve, reject) => waiting.push({ key, resolve, reject }));
  return {
    fetch,
    calls: () => waiting.length,
    answer: (index: number, value: T | null) => waiting[index]!.resolve(value),
    refuse: (index: number, error: unknown) => waiting[index]!.reject(error)
  };
}

/** Lets whatever a resolved promise scheduled actually run. */
const settle = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('resource', () => {
  it('is idle with nothing asked for, and asks nothing', async () => {
    const key = internalState<string | null>(null);
    const asking = deferred<string>();
    const page = resource(key, asking.fetch);

    expect(page.status.value).toBe<ResourceStatus>('idle');
    expect(page.value.value).toBeNull();
    expect(asking.calls()).toBe(0);
    await page.settled;
  });

  it('says loading while it has nothing to show, then ready', async () => {
    const key = internalState<string | null>(null);
    const asking = deferred<string>();
    const page = resource(key, asking.fetch);

    key.value = 'a';
    expect(page.status.value).toBe<ResourceStatus>('loading');
    asking.answer(0, 'A');
    await page.settled;
    expect(page.status.value).toBe<ResourceStatus>('ready');
    expect(page.value.value).toBe('A');
  });

  it('shows what is already held at once, and stays ready while it refreshes', async () => {
    // The store-first rule: a page opened twice is instant the second
    // time and correct a moment later, and Back is never a spinner.
    const held = new Map([['a', 'stored']]);
    const key = internalState<string | null>(null);
    const asking = deferred<string>();
    const page = resource(key, asking.fetch, { peek: (one: string) => held.get(one) ?? null });

    key.value = 'a';
    expect(page.value.value).toBe('stored');
    expect(page.status.value).toBe<ResourceStatus>('ready');
    asking.answer(0, 'fresh');
    await page.settled;
    expect(page.value.value).toBe('fresh');
  });

  it('drops the answer to the request before last', async () => {
    // The generation counter, which is the whole reason this exists:
    // opening one thing, going back and opening another before the
    // first answers must not end with the first answer on screen.
    const key = internalState<string | null>(null);
    const asking = deferred<string>();
    const page = resource(key, asking.fetch);

    key.value = 'a';
    key.value = 'b';
    asking.answer(1, 'B');
    await page.settled;
    asking.answer(0, 'A');
    await settle();
    expect(page.value.value).toBe('B');
    expect(page.requested).toBe('b');
  });

  it('reports an answer of null as missing when there is nothing to show', async () => {
    const key = internalState<string | null>(null);
    const asking = deferred<string>();
    const page = resource(key, asking.fetch);

    key.value = 'gone';
    asking.answer(0, null);
    await page.settled;
    expect(page.status.value).toBe<ResourceStatus>('missing');
    expect(page.value.value).toBeNull();
  });

  it('reports a rejection as failed, with the message', async () => {
    const key = internalState<string | null>(null);
    const asking = deferred<string>();
    const page = resource(key, asking.fetch);

    key.value = 'a';
    asking.refuse(0, new Error('offline'));
    await page.settled;
    expect(page.status.value).toBe<ResourceStatus>('failed');
    expect(page.error.value).toBe('offline');
  });

  it('keeps a stale value on screen when a refresh fails, and stays ready', async () => {
    const held = new Map<string, string>();
    const key = internalState<string | null>(null);
    const asking = deferred<string>();
    const page = resource(key, asking.fetch, { peek: (one: string) => held.get(one) ?? null });

    key.value = 'a';
    asking.answer(0, 'first');
    await page.settled;
    held.set('a', 'first');

    key.value = 'a';
    asking.refuse(1, new Error('offline'));
    await page.settled;
    // Stale is not wrong, and an empty page would be worse.
    expect(page.value.value).toBe('first');
    expect(page.status.value).toBe<ResourceStatus>('ready');
    expect(page.error.value).toBe('offline');
  });

  it('asks again on retry without blanking what is on screen', async () => {
    const key = internalState<string | null>(null);
    const asking = deferred<string>();
    const page = resource(key, asking.fetch);

    key.value = 'a';
    asking.refuse(0, new Error('offline'));
    await page.settled;
    expect(page.status.value).toBe<ResourceStatus>('failed');

    const again = page.retry();
    expect(page.status.value).toBe<ResourceStatus>('loading');
    asking.answer(1, 'A');
    await again;
    expect(page.value.value).toBe('A');
    expect(page.error.value).toBeNull();
  });

  it('retries the same key, and does nothing when nothing was asked for', async () => {
    const key = internalState<string | null>(null);
    const asking = deferred<string>();
    const page = resource(key, asking.fetch);

    await page.retry();
    expect(asking.calls()).toBe(0);

    key.value = 'a';
    asking.answer(0, 'A');
    await page.settled;
    void page.retry();
    expect(asking.calls()).toBe(2);
    // A retry over a value already held leaves it there rather than
    // blanking the screen to ask the same question again.
    expect(page.status.value).toBe<ResourceStatus>('ready');
    expect(page.value.value).toBe('A');
  });

  it('takes a value written here, for an answer edited locally', async () => {
    const key = internalState<string | null>(null);
    const asking = deferred<string>();
    const page = resource(key, asking.fetch);

    key.value = 'a';
    asking.answer(0, 'first');
    await page.settled;
    page.set('first and more');
    expect(page.value.value).toBe('first and more');
    expect(page.status.value).toBe<ResourceStatus>('ready');
  });

  it('goes back to idle when the key goes away', async () => {
    const key = internalState<string | null>(null);
    const asking = deferred<string>();
    const page = resource(key, asking.fetch);

    key.value = 'a';
    asking.answer(0, 'A');
    await page.settled;
    key.value = null;
    await page.settled;
    expect(page.status.value).toBe<ResourceStatus>('idle');
    expect(page.value.value).toBeNull();
  });

  it('publishes status, value and error as one record for a channel key', async () => {
    const key = internalState<string | null>(null);
    const asking = deferred<string>();
    const page = resource(key, asking.fetch);
    const seen: string[] = [];
    const following = page.state.subscribe(state => seen.push(`${state.status}:${state.value ?? '-'}`));

    key.value = 'a';
    asking.answer(0, 'A');
    await page.settled;
    following.unsubscribe();
    expect(seen).toEqual(['idle:-', 'loading:-', 'ready:A']);
  });

  it('gives back its subscription to the key when disposed', () => {
    const key = internalState<string | null>(null);
    const asking = deferred<string>();
    const page = resource(key, asking.fetch);

    page.dispose();
    key.value = 'a';
    expect(asking.calls()).toBe(0);
    expect(page.status.value).toBe<ResourceStatus>('idle');
  });
});
