import { describe, expect, it, vi } from 'vitest';

import { state } from '../../State';
import { Action, Projection, State } from '../decorators';
import { Store } from '../Store';
import { attachStore } from './attachStore';
import { exposeStore } from './exposeStore';
import type { StorePort } from './StoreWorkerProtocol';

/**
 * A synchronous pair of connected ports, so replication can be tested
 * without the scheduling noise of real workers.
 */
function createPortPair(): { host: StorePort; client: StorePort; fromHost: unknown[] } {
  const fromHost: unknown[] = [];
  const host: StorePort = { postMessage: () => {}, onmessage: null };
  const client: StorePort = { postMessage: () => {}, onmessage: null };
  host.postMessage = message => {
    fromHost.push(message);
    client.onmessage?.({ data: message });
  };
  client.postMessage = message => host.onmessage?.({ data: message });
  return { host, client, fromHost };
}

interface CartItem {
  id: string;
  name: string;
  price: number;
}

class CartStore extends Store {
  @State() items = state<CartItem[]>([]);
  @State() note = state('');

  @Projection()
  get summary(): { itemCount: number; totalPrice: number } {
    return {
      itemCount: this.items.value.length,
      totalPrice: this.items.value.reduce((sum, item) => sum + item.price, 0)
    };
  }

  @Projection()
  get lines(): CartItem[] {
    return this.items.value;
  }

  @Action()
  addItem(item: CartItem): void {
    this.items.value = [...this.items.value, item];
  }

  @Action()
  removeItem(id: string): void {
    this.items.value = this.items.value.filter(item => item.id !== id);
  }

  @Action()
  setNote(note: string): void {
    this.note.value = note;
  }

  @Action()
  explode(): void {
    throw new Error('action failed');
  }
}

function connect() {
  const { host, client, fromHost } = createPortPair();
  const exposed = exposeStore(CartStore, host);
  const replica = attachStore(CartStore, client);
  return { exposed, replica, fromHost };
}

function patchesIn(messages: readonly unknown[]): { op: string; projection: string }[] {
  return messages
    .filter(m => (m as { type?: string }).type === 'store:patch')
    .flatMap(m => (m as { patches: { op: string; projection: string }[] }).patches);
}

const hat: CartItem = { id: '1', name: 'Hat', price: 20 };
const scarf: CartItem = { id: '2', name: 'Scarf', price: 15 };

describe('store replication', () => {
  it('sends the current value of every projection on attach', () => {
    const { replica } = connect();
    const summary: unknown[] = [];
    replica.projection.summary.subscribe(value => summary.push(value));

    expect(summary).toEqual([{ itemCount: 0, totalPrice: 0 }]);
  });

  it('drives the replica from a dispatched action', () => {
    const { replica } = connect();
    const summary: unknown[] = [];
    replica.projection.summary.subscribe(value => summary.push(value));

    replica.dispatch('addItem', hat);

    expect(summary.at(-1)).toEqual({ itemCount: 1, totalPrice: 20 });
  });

  it('keeps list projections in step through adds and removes', () => {
    const { replica } = connect();
    const lines: unknown[] = [];
    replica.projection.lines.subscribe(value => lines.push(value));

    replica.dispatch('addItem', hat);
    replica.dispatch('addItem', scarf);
    replica.dispatch('removeItem', '1');

    expect(lines.at(-1)).toEqual([scarf]);
  });

  it('does not emit when a state change leaves the projection unchanged', () => {
    const { replica } = connect();
    const summary: unknown[] = [];
    replica.projection.summary.subscribe(value => summary.push(value));
    expect(summary).toHaveLength(1);

    // note is not part of summary, so nothing should cross the wire.
    replica.dispatch('setNote', 'gift wrap');

    expect(summary).toHaveLength(1);
  });

  it('emits once for a batch that touches one projection repeatedly', () => {
    const { replica } = connect();
    const summary: unknown[] = [];
    replica.projection.summary.subscribe(value => summary.push(value));
    const beforeBatch = summary.length;

    replica.applyPatches([
      { op: 'set', projection: 'summary', path: ['itemCount'], value: 7 },
      { op: 'set', projection: 'summary', path: ['totalPrice'], value: 70 }
    ]);

    // Two patches, one emission: bindings must not see a half-applied
    // view model, nor be woken twice for one change.
    expect(summary.length - beforeBatch).toBe(1);
    expect(summary.at(-1)).toEqual({ itemCount: 7, totalPrice: 70 });
  });

  it('sends only what changed, not the whole projection', () => {
    const { replica, fromHost } = connect();
    replica.projection.lines.subscribe();
    fromHost.length = 0;

    replica.dispatch('addItem', hat);
    replica.dispatch('addItem', scarf);

    const linePatches = patchesIn(fromHost).filter(p => p.projection === 'lines');
    expect(linePatches).toHaveLength(2);
    // Appending must be a splice of the new element, never a resend of
    // the list — that is the entire reason projections are diffed.
    expect(linePatches.every(p => p.op === 'splice')).toBe(true);
  });

  it('sends nothing at all when no projection changed', () => {
    const { replica, fromHost } = connect();
    replica.projection.summary.subscribe();
    replica.projection.lines.subscribe();
    fromHost.length = 0;

    replica.dispatch('setNote', 'gift wrap');

    // The action ran on the authoritative store, but nothing it
    // published moved, so the wire stays quiet.
    expect(patchesIn(fromHost)).toEqual([]);
  });

  it('reports an action that throws instead of going silent', () => {
    const { replica } = connect();
    const onError = vi.fn();
    replica.onError(onError);

    replica.dispatch('explode');

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe('action failed');
  });

  it('reports an unknown action', () => {
    const { replica } = connect();
    const onError = vi.fn();
    replica.onError(onError);

    replica.dispatch('noSuchAction');

    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0])).toMatch(/not found/);
  });

  it('throws a helpful error for a member that is not a projection', () => {
    const { replica } = connect();

    expect(() => (replica.projection as unknown as Record<string, unknown>).addItem).toThrow(
      /is not a @Projection\(\) on store 'CartStore'/
    );
  });

  it('refuses select(), which has nothing to read on a replica', () => {
    const { replica } = connect();

    expect(() => replica.select()).toThrow(/remote, so select\(\) has nothing to read/);
  });

  it('ignores patches for a projection it does not know', () => {
    const { replica } = connect();

    expect(() => replica.applyPatches([{ op: 'set', projection: 'future', path: [], value: 1 }])).not.toThrow();
  });
});
