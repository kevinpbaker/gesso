import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as authProtocol from 'y-protocols/auth';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

import { MESSAGE_AUTH, MESSAGE_AWARENESS, MESSAGE_QUERY_AWARENESS, MESSAGE_SYNC } from './protocol';
import type { SyncConnection, SyncConnectionHandlers, SyncTransport } from './transport';

/**
 * A sync server in memory, for specs and for a demo with no network.
 *
 * It answers the same protocol a y-websocket server does, so a room
 * cannot tell it from one. Every frame is delivered on a later
 * microtask, as a network would deliver it, so an `await` is what lets
 * one arrive.
 *
 *   const relay = createMemoryRelay();
 *   const a = createRoom(new Y.Doc(), { transport: relay.transport('board') });
 *   const b = createRoom(new Y.Doc(), { transport: relay.transport('board') });
 */
export interface MemoryRelay {
  /** A transport that connects to the named room on this relay. */
  transport(room: string): SyncTransport;
  /** The relay's own copy of a room's document. */
  doc(room: string): Y.Doc;
  /** How many connections are open now, across every room. */
  readonly connections: number;
  /** Closes every open connection, as a network drop would. */
  dropAll(): void;
  /** While false, every connection closes without opening, as an unreachable server does. */
  setReachable(reachable: boolean): void;
  /** While set, every new connection is refused with this reason, as a server refuses a bad token. */
  deny(reason: string | null): void;
  /** Closes everything and releases the documents. */
  destroy(): void;
}

interface RelayConnection {
  readonly handlers: SyncConnectionHandlers;
  readonly room: RelayRoom;
  /** The awareness client ids this connection has announced. */
  readonly clients: Set<number>;
  open: boolean;
  closed: boolean;
}

interface RelayRoom {
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  readonly connections: Set<RelayConnection>;
}

export function createMemoryRelay(): MemoryRelay {
  const rooms = new Map<string, RelayRoom>();
  let reachable = true;
  let denied: string | null = null;

  const deliver = (connection: RelayConnection, data: Uint8Array): void => {
    queueMicrotask(() => {
      if (connection.open && !connection.closed) {
        connection.handlers.message(data);
      }
    });
  };

  const roomOf = (name: string): RelayRoom => {
    const existing = rooms.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null);
    const room: RelayRoom = { doc, awareness, connections: new Set() };
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const frame = encoding.toUint8Array(encoder);
      for (const connection of room.connections) {
        if (connection !== origin) {
          deliver(connection, frame);
        }
      }
    });
    awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        const changed = [...added, ...updated, ...removed];
        if (isRelayConnection(origin)) {
          for (const id of added) {
            origin.clients.add(id);
          }
          for (const id of removed) {
            origin.clients.delete(id);
          }
        }
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
        const frame = encoding.toUint8Array(encoder);
        for (const connection of room.connections) {
          if (connection !== origin) {
            deliver(connection, frame);
          }
        }
      }
    );
    rooms.set(name, room);
    return room;
  };

  const close = (connection: RelayConnection, reason?: string): void => {
    if (connection.closed) {
      return;
    }
    connection.closed = true;
    connection.open = false;
    connection.room.connections.delete(connection);
    if (connection.clients.size > 0) {
      awarenessProtocol.removeAwarenessStates(connection.room.awareness, [...connection.clients], null);
    }
    queueMicrotask(() => connection.handlers.close(reason));
  };

  const receive = (connection: RelayConnection, data: Uint8Array): void => {
    const { doc, awareness } = connection.room;
    const decoder = decoding.createDecoder(data);
    const type = decoding.readVarUint(decoder);
    if (type === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, doc, connection);
      if (encoding.length(encoder) > 1) {
        deliver(connection, encoding.toUint8Array(encoder));
      }
    } else if (type === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), connection);
    } else if (type === MESSAGE_QUERY_AWARENESS) {
      deliver(connection, awarenessFrame(awareness, [...awareness.getStates().keys()]));
    }
  };

  const relayConnections = new WeakSet<object>();
  const isRelayConnection = (value: unknown): value is RelayConnection =>
    typeof value === 'object' && value !== null && relayConnections.has(value);

  return {
    transport(name) {
      return {
        connect(handlers): SyncConnection {
          const room = roomOf(name);
          const connection: RelayConnection = { handlers, room, clients: new Set(), open: false, closed: false };
          relayConnections.add(connection);
          queueMicrotask(() => {
            if (connection.closed) {
              return;
            }
            if (!reachable) {
              close(connection, 'unreachable');
              return;
            }
            connection.open = true;
            room.connections.add(connection);
            handlers.open();
            if (denied !== null) {
              const encoder = encoding.createEncoder();
              encoding.writeVarUint(encoder, MESSAGE_AUTH);
              authProtocol.writePermissionDenied(encoder, denied);
              deliver(connection, encoding.toUint8Array(encoder));
              const reason = denied;
              queueMicrotask(() => close(connection, reason));
              return;
            }
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_SYNC);
            syncProtocol.writeSyncStep1(encoder, room.doc);
            deliver(connection, encoding.toUint8Array(encoder));
            const states = [...room.awareness.getStates().keys()];
            if (states.length > 0) {
              deliver(connection, awarenessFrame(room.awareness, states));
            }
          });
          return {
            send(data) {
              if (connection.open && !connection.closed) {
                queueMicrotask(() => {
                  if (connection.open && !connection.closed) {
                    receive(connection, data);
                  }
                });
              }
            },
            close() {
              close(connection);
            }
          };
        }
      };
    },
    doc(name) {
      return roomOf(name).doc;
    },
    get connections() {
      let count = 0;
      for (const room of rooms.values()) {
        count += room.connections.size;
      }
      return count;
    },
    dropAll() {
      for (const room of rooms.values()) {
        // A copy: closing a connection removes it from the set being walked.
        for (const connection of Array.from(room.connections)) {
          close(connection, 'dropped');
        }
      }
    },
    setReachable(next) {
      reachable = next;
    },
    deny(reason) {
      denied = reason;
    },
    destroy() {
      for (const room of rooms.values()) {
        for (const connection of Array.from(room.connections)) {
          close(connection, 'relay destroyed');
        }
        room.awareness.destroy();
        room.doc.destroy();
      }
      rooms.clear();
    }
  };
}

function awarenessFrame(awareness: awarenessProtocol.Awareness, clients: number[]): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, clients));
  return encoding.toUint8Array(encoder);
}
