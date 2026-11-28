import type { ReadableCell, ResourceStatus, StorageAdapter } from 'gesso-framework/worker';
import { internalState, type InternalState } from 'gesso-framework/worker';
import { fromBase64, toBase64 } from 'lib0/buffer';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as authProtocol from 'y-protocols/auth';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

import { MESSAGE_AUTH, MESSAGE_AWARENESS, MESSAGE_QUERY_AWARENESS, MESSAGE_SYNC } from './protocol';
import type { SyncConnection, SyncTransport } from './transport';

/**
 * Where the room's connection is.
 *
 * | State        | Means                                                        |
 * | ------------ | ------------------------------------------------------------ |
 * | `offline`    | no connection, and one is waiting to be tried, or never will |
 * | `connecting` | a connection is being opened                                 |
 * | `syncing`    | open, and the two sides are exchanging what the other lacks  |
 * | `online`     | open, and this side holds everything the server held         |
 */
export type ConnectionState = 'offline' | 'connecting' | 'syncing' | 'online';

/** Another person in the room, as plain data. */
export interface Peer<P> {
  /** The peer's Yjs client id: stable while it stays connected. */
  readonly id: number;
  /**
   * What the peer said about itself. It arrived over the network, so
   * an application checks it before it trusts it.
   */
  readonly presence: P;
}

export interface RoomStorage {
  /** Where the offline copy lives: `IndexedDbStorage` or `OpfsStorage` in a worker. */
  readonly adapter: StorageAdapter;
  /** The record the copy is kept under; one per document. */
  readonly key: string;
  /** How long writes wait for edits to stop, in ms. 250 by default, as `persisted`. */
  readonly settle?: number;
}

export interface RoomOptions<P extends object> {
  /** How the room reaches the server. Without one, the document is local only. */
  readonly transport?: SyncTransport;
  /** Where the offline copy is kept. Without one, nothing outlives the worker. */
  readonly storage?: RoomStorage;
  /** What this person shows the others: a name, a colour, what they are looking at. */
  readonly presence?: P;
  /** The shortest gap between two presence messages, in ms. 50 by default. */
  readonly presenceInterval?: number;
  /** The wait before the first retry and the longest wait, in ms. 500 and 30 000 by default. */
  readonly backoff?: { readonly initial?: number; readonly max?: number };
  /** The jitter's random source; `Math.random` by default. For specs. */
  readonly random?: () => number;
  /**
   * What says the network came back, as an `online` event, so a room
   * waiting out a long backoff tries at once. The worker's global
   * scope by default; `null` for none.
   */
  readonly network?: EventTarget | null;
}

export interface Room<P extends object = object> {
  /** The document. Edit it inside `transact`, read it through `snapshot`. */
  readonly doc: Y.Doc;
  /** The transaction origin `transact` uses, for a `Y.UndoManager` of your own. */
  readonly origin: object;
  /**
   * `loading` until there is something to show, `ready` from the
   * offline copy or the first sync, whichever lands first, and `failed`
   * when there is no copy and the server could not be reached. A room
   * that is `failed` becomes `ready` when a later connection syncs.
   */
  readonly status: ReadableCell<ResourceStatus>;
  readonly connection: ReadableCell<ConnectionState>;
  /**
   * Local changes that have not been written to an open connection
   * yet: the edits made offline. The protocol has no acknowledgement,
   * so this counts what was not sent, not what the server stored.
   */
  readonly unsent: ReadableCell<number>;
  /** Everyone else in the room, ordered by id. */
  readonly peers: ReadableCell<readonly Peer<P>[]>;
  /** The last thing that went wrong, for a person to read; null when nothing has. */
  readonly error: ReadableCell<string | null>;
  /**
   * Makes a change. `label` names it for an undo menu (see `bindUndo`),
   * and every change inside `edit` is one transaction, sent as one
   * update.
   */
  transact(label: string, edit: () => void): void;
  /** Changes what this person shows the others. Merged into what was set before, and throttled. */
  setPresence(patch: Partial<P>): void;
  /** Tries to connect now, after a refusal, a `disconnect`, or during a backoff. */
  reconnect(): void;
  /** Closes the connection and stays offline until `reconnect`. Edits still apply and are kept. */
  disconnect(): void;
  /** Writes the offline copy now, for the moment the worker is about to go. */
  save(): Promise<void>;
  /** Disconnects, writes what is pending, and releases everything. */
  destroy(): void;
}

/**
 * A shared document, kept in the application worker.
 *
 *   const room = createRoom(new Y.Doc(), {
 *     transport: websocketTransport({ url: 'wss://sync.example.com', room: 'board-42' }),
 *     storage: { adapter: new IndexedDbStorage(), key: 'board-42' },
 *     presence: { name: 'Ada', color: '#BE9A6E' }
 *   });
 *
 * Every edit applies at once and merges with everyone else's, so there
 * is nothing to roll back and nothing to wait for. The room's cells say
 * where that stands, in plain data a channel can serve as it is.
 */
export function createRoom<P extends object = object>(doc: Y.Doc, options: RoomOptions<P> = {}): Room<P> {
  return new SyncRoom(doc, options);
}

/** The transaction origins a room tells apart. Objects, so nothing else can spell them. */
class Origin {
  constructor(readonly name: string) {}
}

export class SyncRoom<P extends object> implements Room<P> {
  readonly origin = new Origin('gesso-sync:local');
  readonly status: InternalState<ResourceStatus>;
  readonly connection = internalState<ConnectionState>('offline');
  readonly unsent = internalState(0);
  readonly peers = internalState<readonly Peer<P>[]>([]);
  readonly error = internalState<string | null>(null);

  /** The label of the `transact` running now, for `bindUndo`. */
  currentLabel: string | null = null;

  private readonly remote = new Origin('gesso-sync:remote');
  private readonly stored = new Origin('gesso-sync:storage');
  private readonly awareness: awarenessProtocol.Awareness;
  private readonly random: () => number;
  private readonly initialDelay: number;
  private readonly maxDelay: number;
  private readonly presenceInterval: number;
  private readonly network: EventTarget | null;

  private presence: P | null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceDirty = false;

  /** The live connection, once the transport has answered with one. */
  private live: SyncConnection | null = null;
  /** Bumped by every attempt and every deliberate close, so a late answer from an old one is ignored. */
  private attempt = 0;
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set by `disconnect` and by a refusal: no retries until `reconnect`. */
  private held = false;
  private destroyed = false;

  private hydrated: Promise<void>;
  private hydratedDone = false;
  private hadLocalCopy = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private storageDenied = false;
  /** Set once any connection has closed or been refused, so a late hydration can say `failed`. */
  private connectionFailedOnce = false;

  constructor(
    readonly doc: Y.Doc,
    private readonly options: RoomOptions<P>
  ) {
    this.status = internalState<ResourceStatus>('loading');
    this.random = options.random ?? Math.random;
    this.initialDelay = options.backoff?.initial ?? 500;
    this.maxDelay = options.backoff?.max ?? 30_000;
    this.presenceInterval = options.presenceInterval ?? 50;
    this.presence = options.presence === undefined ? null : { ...options.presence };
    this.network =
      options.network === undefined
        ? typeof (globalThis as { addEventListener?: unknown }).addEventListener === 'function'
          ? (globalThis as unknown as EventTarget)
          : null
        : options.network;

    this.awareness = new awarenessProtocol.Awareness(doc);
    this.awareness.setLocalState(this.presence);
    this.awareness.on('update', this.onAwarenessUpdate);
    doc.on('update', this.onDocUpdate);
    this.network?.addEventListener('online', this.onOnline);

    this.hydrated = this.hydrate();
    if (options.transport !== undefined) {
      this.connect();
    }
  }

  transact(label: string, edit: () => void): void {
    const previous = this.currentLabel;
    this.currentLabel = label;
    try {
      this.doc.transact(edit, this.origin);
    } finally {
      this.currentLabel = previous;
    }
  }

  setPresence(patch: Partial<P>): void {
    this.presence = { ...(this.presence ?? ({} as P)), ...patch };
    if (this.presenceTimer !== null) {
      this.presenceDirty = true;
      return;
    }
    this.flushPresence();
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      if (this.presenceDirty) {
        this.flushPresence();
      }
    }, this.presenceInterval);
  }

  reconnect(): void {
    if (this.destroyed || this.options.transport === undefined) {
      return;
    }
    this.held = false;
    this.attempts = 0;
    this.clearRetry();
    if (this.live === null && this.connection.value !== 'connecting') {
      this.connect();
    }
  }

  disconnect(): void {
    this.held = true;
    this.clearRetry();
    this.closeLive();
    this.connection.value = 'offline';
  }

  async save(): Promise<void> {
    const storage = this.options.storage;
    if (storage === undefined || this.storageDenied) {
      return;
    }
    await this.hydrated;
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.dirty = false;
    const outcome = await storage.adapter.write(storage.key, toBase64(Y.encodeStateAsUpdate(this.doc)));
    if (outcome === 'denied') {
      this.storageDenied = true;
      this.error.value =
        'This browser will not let the document be kept offline. Edits are kept while the page is open.';
    } else if (outcome === 'full') {
      this.error.value = 'Storage is full, so the offline copy was not updated.';
    } else if (outcome === 'failed') {
      this.error.value = 'The offline copy could not be written.';
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.disconnect();
    this.destroyed = true;
    if (this.dirty) {
      void this.save();
    } else if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    if (this.presenceTimer !== null) {
      clearTimeout(this.presenceTimer);
    }
    this.network?.removeEventListener('online', this.onOnline);
    this.doc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    this.awareness.destroy();
  }

  // ---- storage ----

  private async hydrate(): Promise<void> {
    const storage = this.options.storage;
    if (storage !== undefined) {
      const read = await storage.adapter.read(storage.key);
      if (read.outcome === 'ok' && read.value !== null) {
        try {
          Y.applyUpdate(this.doc, fromBase64(read.value), this.stored);
          this.hadLocalCopy = true;
        } catch {
          // A copy that will not decode is treated as no copy, as
          // `persisted` treats a record that will not parse.
        }
      } else if (read.outcome === 'denied') {
        this.storageDenied = true;
      }
    }
    this.hydratedDone = true;
    if (this.hadLocalCopy || this.options.transport === undefined) {
      this.markReady();
    } else if (this.status.value === 'loading' && this.connectionFailedOnce) {
      this.status.value = 'failed';
    }
    if (this.dirty) {
      this.scheduleSave();
    }
  }

  private scheduleSave(): void {
    if (this.options.storage === undefined || this.storageDenied || this.destroyed) {
      return;
    }
    this.dirty = true;
    if (!this.hydratedDone) {
      // Writing now would replace the stored copy with a document that
      // has not read it yet. The write follows hydration instead.
      return;
    }
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, this.options.storage.settle ?? 250);
  }

  private markReady(): void {
    if (this.status.value !== 'ready') {
      this.status.value = 'ready';
    }
  }

  // ---- connection ----

  private connect(): void {
    const transport = this.options.transport;
    if (transport === undefined || this.destroyed || this.held) {
      return;
    }
    const attempt = ++this.attempt;
    this.connection.value = 'connecting';
    let connection: SyncConnection | null = null;
    let opened = false;
    const current = (): boolean => attempt === this.attempt && !this.destroyed;

    const handlers = {
      open: () => {
        if (!current()) {
          return;
        }
        opened = true;
        if (connection !== null) {
          this.onOpen(connection);
        }
      },
      message: (data: Uint8Array) => {
        if (current()) {
          this.onMessage(data);
        }
      },
      close: (reason?: string) => {
        if (current()) {
          this.onClose(reason);
        }
      }
    };

    Promise.resolve()
      .then(() => transport.connect(handlers))
      .then(
        made => {
          if (!current()) {
            made.close();
            return;
          }
          connection = made;
          this.live = made;
          if (opened) {
            this.onOpen(made);
          }
        },
        (failure: unknown) => {
          if (current()) {
            this.onClose(failure instanceof Error ? failure.message : String(failure));
          }
        }
      );
  }

  private onOpen(connection: SyncConnection): void {
    this.attempts = 0;
    this.connection.value = 'syncing';
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    connection.send(encoding.toUint8Array(encoder));
    if (this.presence !== null) {
      // Setting it again sends it, through the awareness listener.
      this.awareness.setLocalState(this.presence);
    }
  }

  private onMessage(data: Uint8Array): void {
    try {
      const decoder = decoding.createDecoder(data);
      const type = decoding.readVarUint(decoder);
      if (type === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        const kind = syncProtocol.readSyncMessage(decoder, encoder, this.doc, this.remote);
        if (encoding.length(encoder) > 1) {
          this.send(encoding.toUint8Array(encoder));
        }
        if (kind === syncProtocol.messageYjsSyncStep1) {
          // The reply just sent carries everything the server lacked,
          // the edits made offline among them.
          this.unsent.value = 0;
        } else if (kind === syncProtocol.messageYjsSyncStep2) {
          this.connection.value = 'online';
          this.error.value = null;
          this.markReady();
        }
      } else if (type === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this.remote);
      } else if (type === MESSAGE_QUERY_AWARENESS) {
        this.send(this.awarenessFrame([...this.awareness.getStates().keys()]));
      } else if (type === MESSAGE_AUTH) {
        authProtocol.readAuthMessage(decoder, this.doc, (_doc, reason) => this.onRefused(reason));
      }
    } catch (failure) {
      this.error.value = `A message from the server could not be read: ${failure instanceof Error ? failure.message : String(failure)}`;
    }
  }

  private onRefused(reason: string): void {
    this.held = true;
    this.error.value = `The server refused the connection: ${reason}`;
    this.closeLive();
    this.connection.value = 'offline';
    this.failIfNothingToShow();
  }

  private onClose(reason?: string): void {
    this.live = null;
    this.forgetPeers();
    this.connection.value = 'offline';
    this.connectionFailedOnce = true;
    if (reason !== undefined && this.error.value === null) {
      this.error.value = `The connection closed: ${reason}`;
    }
    this.failIfNothingToShow();
    this.scheduleRetry();
  }

  private failIfNothingToShow(): void {
    this.connectionFailedOnce = true;
    if (this.status.value === 'loading' && this.hydratedDone && !this.hadLocalCopy) {
      this.status.value = 'failed';
    }
  }

  private scheduleRetry(): void {
    if (this.held || this.destroyed || this.retryTimer !== null) {
      return;
    }
    const ceiling = Math.min(this.maxDelay, this.initialDelay * 2 ** this.attempts);
    // Half to all of the ceiling, so a server that drops everyone at
    // once is not met by everyone at once.
    const delay = ceiling * (0.5 + this.random() * 0.5);
    this.attempts++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private readonly onOnline = (): void => {
    if (this.retryTimer !== null) {
      this.clearRetry();
      this.attempts = 0;
      this.connect();
    }
  };

  private closeLive(): void {
    const live = this.live;
    this.attempt++;
    this.live = null;
    if (live !== null) {
      if (this.awareness.getLocalState() !== null) {
        // Say goodbye, so the others see this person leave now rather
        // than when the server notices the socket is gone.
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(
            this.awareness,
            [this.doc.clientID],
            // The typings leave out null, which the protocol uses for "gone".
            new Map([[this.doc.clientID, null]]) as unknown as Map<number, Record<string, unknown>>
          )
        );
        live.send(encoding.toUint8Array(encoder));
      }
      live.close();
    }
    this.forgetPeers();
  }

  private forgetPeers(): void {
    const others = [...this.awareness.getStates().keys()].filter(id => id !== this.doc.clientID);
    if (others.length > 0) {
      awarenessProtocol.removeAwarenessStates(this.awareness, others, this.remote);
    }
  }

  private send(frame: Uint8Array): void {
    this.live?.send(frame);
  }

  private get isOpen(): boolean {
    return this.live !== null && (this.connection.value === 'syncing' || this.connection.value === 'online');
  }

  // ---- document and presence ----

  private readonly onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this.stored) {
      return;
    }
    this.scheduleSave();
    if (origin === this.remote) {
      return;
    }
    if (this.isOpen) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.send(encoding.toUint8Array(encoder));
    } else {
      this.unsent.value = this.unsent.value + 1;
    }
  };

  private readonly onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ): void => {
    if (origin === 'local' && this.isOpen) {
      this.send(this.awarenessFrame([...added, ...updated, ...removed]));
    }
    this.publishPeers();
  };

  private flushPresence(): void {
    this.presenceDirty = false;
    this.awareness.setLocalState(this.presence);
  }

  private publishPeers(): void {
    const peers: Peer<P>[] = [];
    for (const [id, state] of this.awareness.getStates()) {
      if (id !== this.doc.clientID && state !== null && state !== undefined) {
        peers.push({ id, presence: state as P });
      }
    }
    peers.sort((a, b) => a.id - b.id);
    const previous = this.peers.value;
    if (
      previous.length === peers.length &&
      previous.every((peer, index) => peer.id === peers[index]!.id && peer.presence === peers[index]!.presence)
    ) {
      return;
    }
    this.peers.value = peers;
  }

  private awarenessFrame(clients: number[]): Uint8Array {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients));
    return encoding.toUint8Array(encoder);
  }
}
