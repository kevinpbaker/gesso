import { MemoryStorage, type StorageAdapter, type StorageRead } from 'gesso-framework/worker';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { createMemoryRelay, type MemoryRelay } from './memoryRelay';
import { createRoom, type Room } from './room';
import type { SyncTransport } from './transport';

/** Lets every frame in flight arrive: each hop is a microtask, and a timer runs after all of them. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

const rooms: Room<object>[] = [];
let relay: MemoryRelay;

const open = <P extends object = object>(
  options: Parameters<typeof createRoom<P>>[1] = {},
  doc = new Y.Doc()
): Room<P> => {
  const room = createRoom<P>(doc, { network: null, ...options });
  rooms.push(room as Room<object>);
  return room;
};

const titles = (room: Room): string[] => room.doc.getArray<string>('titles').toArray();

afterEach(() => {
  for (const room of rooms.splice(0)) {
    room.destroy();
  }
  relay?.destroy();
  vi.useRealTimers();
});

describe('createRoom', () => {
  it('brings two people to the same document', async () => {
    relay = createMemoryRelay();
    const ada = open({ transport: relay.transport('board') });
    const ben = open({ transport: relay.transport('board') });
    await settle();

    expect(ada.connection.value).toBe('online');
    expect(ada.status.value).toBe('ready');

    ada.transact('Add', () => ada.doc.getArray<string>('titles').push(['From Ada']));
    ben.transact('Add', () => ben.doc.getArray<string>('titles').push(['From Ben']));
    await settle();

    expect(titles(ada)).toEqual(titles(ben));
    expect(titles(ada)).toHaveLength(2);
  });

  it('merges what both sides did while apart, and counts what was not sent', async () => {
    relay = createMemoryRelay();
    const ada = open({ transport: relay.transport('board'), backoff: { initial: 5, max: 5 } });
    const ben = open({ transport: relay.transport('board'), backoff: { initial: 5, max: 5 } });
    await settle();

    ada.disconnect();
    ben.disconnect();
    ada.transact('Add', () => ada.doc.getArray<string>('titles').push(['Offline Ada']));
    ada.transact('Add', () => ada.doc.getArray<string>('titles').push(['Offline Ada 2']));
    ben.transact('Add', () => ben.doc.getArray<string>('titles').push(['Offline Ben']));

    expect(ada.unsent.value).toBe(2);
    expect(ada.connection.value).toBe('offline');

    ada.reconnect();
    ben.reconnect();
    await settle();

    expect(ada.unsent.value).toBe(0);
    expect(ben.unsent.value).toBe(0);
    expect([...titles(ada)].sort()).toEqual(['Offline Ada', 'Offline Ada 2', 'Offline Ben']);
    expect(titles(ada)).toEqual(titles(ben));
  });

  it('reconnects by itself after the network drops', async () => {
    relay = createMemoryRelay();
    const ada = open({ transport: relay.transport('board'), backoff: { initial: 40, max: 40 } });
    const ben = open({ transport: relay.transport('board'), backoff: { initial: 40, max: 40 } });
    await settle();

    relay.dropAll();
    await settle();
    expect(ada.connection.value).toBe('offline');
    ada.transact('Add', () => ada.doc.getArray<string>('titles').push(['While dropped']));

    await new Promise(resolve => setTimeout(resolve, 60));
    await settle();

    expect(ada.connection.value).toBe('online');
    expect(titles(ben)).toEqual(['While dropped']);
  });

  it('backs off, doubling up to the ceiling, and tries at once when the network returns', async () => {
    vi.useFakeTimers();
    relay = createMemoryRelay();
    relay.setReachable(false);
    const tries: number[] = [];
    const inner = relay.transport('board');
    const counting: SyncTransport = {
      connect(handlers) {
        tries.push(Date.now());
        return inner.connect(handlers);
      }
    };
    const network = new EventTarget();
    const room = open({ transport: counting, random: () => 1, backoff: { initial: 100, max: 400 }, network });

    await vi.advanceTimersByTimeAsync(0);
    expect(tries).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(99);
    expect(tries).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(tries).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(200);
    expect(tries).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(400);
    expect(tries).toHaveLength(4);
    // The ceiling holds.
    await vi.advanceTimersByTimeAsync(400);
    expect(tries).toHaveLength(5);

    relay.setReachable(true);
    network.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(tries).toHaveLength(6);
    expect(room.connection.value).toBe('online');
  });

  it('spreads retries with jitter between half and all of the ceiling', async () => {
    vi.useFakeTimers();
    relay = createMemoryRelay();
    relay.setReachable(false);
    let tries = 0;
    const inner = relay.transport('board');
    open({
      transport: { connect: handlers => (tries++, inner.connect(handlers)) },
      random: () => 0,
      backoff: { initial: 100 }
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(49);
    expect(tries).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(tries).toBe(2);
  });

  it('is failed with nothing to show and no server, and ready once a server answers', async () => {
    relay = createMemoryRelay();
    relay.setReachable(false);
    const room = open({ transport: relay.transport('board'), backoff: { initial: 5, max: 5 } });
    await settle();

    expect(room.status.value).toBe('failed');
    expect(room.error.value).toContain('unreachable');

    relay.setReachable(true);
    await new Promise(resolve => setTimeout(resolve, 20));
    await settle();

    expect(room.status.value).toBe('ready');
    expect(room.error.value).toBeNull();
  });

  it('is ready at once with no transport: a local document', () => {
    const room = open();
    expect(room.status.value).toBe('ready');
    expect(room.connection.value).toBe('offline');
  });

  it('stops on a refusal, says why, and connects again when asked', async () => {
    vi.useFakeTimers();
    relay = createMemoryRelay();
    relay.deny('token expired');
    const room = open({ transport: relay.transport('board'), backoff: { initial: 10, max: 10 } });
    await vi.advanceTimersByTimeAsync(0);

    expect(room.connection.value).toBe('offline');
    expect(room.error.value).toBe('The server refused the connection: token expired');

    await vi.advanceTimersByTimeAsync(1000);
    expect(relay.connections).toBe(0);
    expect(room.connection.value).toBe('offline');

    relay.deny(null);
    room.reconnect();
    await vi.advanceTimersByTimeAsync(0);
    expect(room.connection.value).toBe('online');
  });

  it('asks the transport again on every connection, so a fresh token is used', async () => {
    relay = createMemoryRelay();
    const inner = relay.transport('board');
    const tokens: string[] = [];
    let issued = 0;
    const transport: SyncTransport = {
      async connect(handlers) {
        tokens.push(`token-${++issued}`);
        return inner.connect(handlers);
      }
    };
    const room = open({ transport, backoff: { initial: 5, max: 5 } });
    await settle();
    room.disconnect();
    room.reconnect();
    await settle();

    expect(tokens).toEqual(['token-1', 'token-2']);
    expect(room.connection.value).toBe('online');
  });

  it('treats a transport that throws as a closed connection, and retries', async () => {
    relay = createMemoryRelay();
    const inner = relay.transport('board');
    let calls = 0;
    const room = open({
      transport: {
        connect(handlers) {
          calls++;
          if (calls === 1) {
            throw new Error('no token yet');
          }
          return inner.connect(handlers);
        }
      },
      backoff: { initial: 40, max: 40 }
    });
    await settle();
    expect(room.error.value).toContain('no token yet');

    await new Promise(resolve => setTimeout(resolve, 60));
    await settle();
    expect(room.connection.value).toBe('online');
  });
});

describe('the offline copy', () => {
  it('is written after edits stop, and read back into a new room', async () => {
    vi.useFakeTimers();
    const adapter = new MemoryStorage();
    const first = open({ storage: { adapter, key: 'board', settle: 100 } });
    await vi.advanceTimersByTimeAsync(0);
    first.transact('Add', () => first.doc.getArray<string>('titles').push(['Kept']));

    expect(await adapter.keys()).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(await adapter.keys()).toEqual(['board']);

    relay = createMemoryRelay();
    relay.setReachable(false);
    const second = open({ storage: { adapter, key: 'board' }, transport: relay.transport('board') });
    await vi.advanceTimersByTimeAsync(0);

    expect(titles(second)).toEqual(['Kept']);
    expect(second.status.value).toBe('ready');
    expect(second.connection.value).toBe('offline');
  });

  it('keeps an edit made before the copy was read, and the copy as well', async () => {
    const adapter = new MemoryStorage();
    const seed = new Y.Doc();
    seed.getArray<string>('titles').push(['Stored']);
    await adapter.write('board', Buffer.from(Y.encodeStateAsUpdate(seed)).toString('base64'));

    let release!: () => void;
    const slow: StorageAdapter = {
      read: key =>
        new Promise<StorageRead>(resolve => {
          release = () => void adapter.read(key).then(resolve);
        }),
      write: (key, value) => adapter.write(key, value),
      remove: key => adapter.remove(key),
      keys: () => adapter.keys()
    };
    const room = open({ storage: { adapter: slow, key: 'board', settle: 1 } });
    room.transact('Add', () => room.doc.getArray<string>('titles').push(['Early']));
    expect(room.status.value).toBe('loading');

    release();
    await settle();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect([...titles(room)].sort()).toEqual(['Early', 'Stored']);
    const reread = new Y.Doc();
    const stored = await adapter.read('board');
    Y.applyUpdate(reread, Buffer.from(stored.value!, 'base64'));
    expect([...reread.getArray<string>('titles').toArray()].sort()).toEqual(['Early', 'Stored']);
  });

  it('says once that the store is full, and keeps the edit', async () => {
    const adapter = new MemoryStorage();
    adapter.full = true;
    const room = open({ storage: { adapter, key: 'board' } });
    await settle();
    room.transact('Add', () => room.doc.getArray<string>('titles').push(['Unsaved']));
    await room.save();

    expect(room.error.value).toBe('Storage is full, so the offline copy was not updated.');
    expect(titles(room)).toEqual(['Unsaved']);
  });
});

describe('presence', () => {
  it('shows who is here, what they changed, and that they left', async () => {
    relay = createMemoryRelay();
    const ada = open<{ name: string; focus?: string }>({
      transport: relay.transport('board'),
      presence: { name: 'Ada' },
      presenceInterval: 1
    });
    const ben = open<{ name: string; focus?: string }>({
      transport: relay.transport('board'),
      presence: { name: 'Ben' },
      presenceInterval: 1
    });
    await settle();

    expect(ada.peers.value.map(peer => peer.presence.name)).toEqual(['Ben']);
    expect(ben.peers.value.map(peer => peer.presence.name)).toEqual(['Ada']);
    expect(ben.peers.value[0]!.id).toBe(ada.doc.clientID);

    ada.setPresence({ focus: 'card-3' });
    await settle();
    expect(ben.peers.value[0]!.presence).toEqual({ name: 'Ada', focus: 'card-3' });

    ada.disconnect();
    await settle();
    expect(ben.peers.value).toEqual([]);
    expect(ada.peers.value).toEqual([]);
  });

  it('sends the first change at once and the last of a burst at the end of the interval', async () => {
    vi.useFakeTimers();
    relay = createMemoryRelay();
    const ada = open<{ x: number }>({ transport: relay.transport('board'), presence: { x: 0 }, presenceInterval: 50 });
    const ben = open<{ x: number }>({ transport: relay.transport('board'), presenceInterval: 50 });
    await vi.advanceTimersByTimeAsync(0);

    const seen: number[] = [];
    ben.peers.subscribe(peers => {
      const x = peers[0]?.presence.x;
      if (x !== undefined && seen[seen.length - 1] !== x) {
        seen.push(x);
      }
    });

    for (let x = 1; x <= 10; x++) {
      ada.setPresence({ x });
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(seen[seen.length - 1]).toBe(1);

    await vi.advanceTimersByTimeAsync(50);
    expect(seen).toEqual([0, 1, 10]);
  });
});
