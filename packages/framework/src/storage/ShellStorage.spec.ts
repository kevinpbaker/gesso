import { describe, expect, it } from 'vitest';

import { ShellService, type ShellRequest } from '../app/ShellService';
import { performShellStorage, type ShellLocalStore } from '../app/shellStorage';
import { ShellStorage } from './ShellStorage';

/** A `localStorage` in a Map, with the two failures a real one has. */
class FakeLocalStore implements ShellLocalStore {
  readonly records = new Map<string, string>();
  /** Thrown by the next call, once. */
  next: Error | null = null;

  get length(): number {
    return this.records.size;
  }

  getItem(key: string): string | null {
    this.check();
    return this.records.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.check();
    this.records.set(key, value);
  }

  removeItem(key: string): void {
    this.check();
    this.records.delete(key);
  }

  key(index: number): string | null {
    this.check();
    return [...this.records.keys()][index] ?? null;
  }

  private check(): void {
    const error = this.next;
    if (error !== null) {
      this.next = null;
      throw error;
    }
  }
}

function named(name: string, message = 'refused'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/**
 * A shell wired to a fake `localStorage`, the way `WorkerApp` and
 * `GessoApp` wire the real one.
 *
 * This is the whole round trip: the render side asks, the shell
 * performs, the answer comes back by id.
 */
function wired(store: FakeLocalStore | null): { adapter: ShellStorage; sent: ShellRequest[] } {
  const shell = new ShellService();
  const sent: ShellRequest[] = [];
  shell.setHandler(request => {
    sent.push(request);
    if (request.type === 'storage') {
      shell.settleStorage(
        request.id,
        performShellStorage(request, () => store)
      );
    }
  });
  return { adapter: new ShellStorage(shell), sent };
}

describe('ShellStorage', () => {
  it('writes and reads back through the shell', async () => {
    const store = new FakeLocalStore();
    const { adapter } = wired(store);

    expect(await adapter.write('theme', 'dark')).toBe('ok');
    expect(await adapter.read('theme')).toEqual({ outcome: 'ok', value: 'dark', error: null });
  });

  it('namespaces the keys it writes', async () => {
    const store = new FakeLocalStore();
    const { adapter } = wired(store);

    await adapter.write('theme', 'dark');

    expect([...store.records.keys()]).toEqual(['gesso:theme']);
    // And reports its own keys without the namespace, so what goes in
    // is what comes out.
    expect(await adapter.keys()).toEqual(['theme']);
  });

  it('leaves the keys of another script out of its listing', async () => {
    const store = new FakeLocalStore();
    store.records.set('something-else', 'x');
    const { adapter } = wired(store);
    await adapter.write('theme', 'dark');

    expect(await adapter.keys()).toEqual(['theme']);
  });

  it('says a key it does not hold is not there', async () => {
    const { adapter } = wired(new FakeLocalStore());

    expect(await adapter.read('theme')).toEqual({ outcome: 'ok', value: null, error: null });
  });

  it('answers denied with no shell at all', async () => {
    const adapter = new ShellStorage(new ShellService());

    const read = await adapter.read('theme');
    expect(read.outcome).toBe('denied');
    expect(await adapter.write('theme', 'dark')).toBe('denied');
  });

  it('answers denied when the browser blocks localStorage', async () => {
    const { adapter } = wired(null);

    expect((await adapter.read('theme')).outcome).toBe('denied');
  });

  it('answers full when the quota is spent', async () => {
    const store = new FakeLocalStore();
    const { adapter } = wired(store);
    store.next = named('QuotaExceededError', 'no room');

    expect(await adapter.write('theme', 'dark')).toBe('full');
    expect(await adapter.write('theme', 'dark')).toBe('ok');
  });

  it('sends one request per call, with the op and the key on it', async () => {
    const { adapter, sent } = wired(new FakeLocalStore());

    await adapter.write('theme', 'dark');
    await adapter.read('theme');

    expect(sent.map(request => (request.type === 'storage' ? [request.op, request.key] : []))).toEqual([
      ['write', 'gesso:theme'],
      ['read', 'gesso:theme']
    ]);
  });
});

describe('performShellStorage', () => {
  it('reads every key for a listing', () => {
    const store = new FakeLocalStore();
    store.records.set('a', '1');
    store.records.set('b', '2');

    expect(performShellStorage({ op: 'keys', key: '' }, () => store)).toEqual({
      outcome: 'ok',
      value: null,
      keys: ['a', 'b'],
      error: null
    });
  });

  it('carries the message rather than throwing at the shell', () => {
    const store = new FakeLocalStore();
    store.next = named('SecurityError', 'blocked here');

    expect(performShellStorage({ op: 'read', key: 'a' }, () => store)).toEqual({
      outcome: 'denied',
      value: null,
      keys: [],
      error: 'blocked here'
    });
  });
});
