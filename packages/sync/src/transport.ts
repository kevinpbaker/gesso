/**
 * The seam between a room and the network.
 *
 * A room needs one thing from a transport: a way to open a connection
 * that carries binary frames both ways and says when it opened and when
 * it closed. Reconnecting, backing off, and what the frames mean are the
 * room's job, so a transport is small enough to write for anything that
 * carries bytes: a WebSocket, an Electrobun RPC, a WebRTC data channel,
 * or the in-memory relay the specs use.
 */

/** What a connection reports to the room that opened it. */
export interface SyncConnectionHandlers {
  /** The connection is open and `send` now delivers. Called at most once. */
  open(): void;
  /** One frame arrived. */
  message(data: Uint8Array): void;
  /**
   * The connection is closed, whoever closed it, and whether or not it
   * ever opened. Called exactly once. `reason` is for a person to read.
   */
  close(reason?: string): void;
}

/** One connection, as the room holds it. */
export interface SyncConnection {
  /** Sends one frame. Frames sent before `open` or after `close` are dropped. */
  send(data: Uint8Array): void;
  /** Closes the connection. `close` is still reported to the handlers. */
  close(): void;
}

/**
 * Opens connections for a room.
 *
 * `connect` may answer a promise, for a transport that must fetch a
 * token first. A promise that rejects counts as a connection that
 * closed without opening, and the room backs off and tries again.
 */
export interface SyncTransport {
  connect(handlers: SyncConnectionHandlers): SyncConnection | Promise<SyncConnection>;
}

/** The parts of `WebSocket` the transport uses, so a spec can pass a double. */
export interface WebSocketLike {
  binaryType: string;
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onclose: ((event: { readonly reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: Uint8Array): void;
  close(): void;
}

export interface WebSocketTransportOptions {
  /** The server, as `wss://sync.example.com` or `wss://example.com/sync`. */
  url: string;
  /** The document's name. It is the last segment of the path, as a y-websocket server expects. */
  room: string;
  /**
   * Query parameters, asked for again on every connection, so a token
   * that was refreshed since the last one is the one sent.
   *
   * A query string can end up in a server's access log. Prefer a
   * short-lived token here over a long-lived secret.
   */
  params?: () => Record<string, string> | Promise<Record<string, string>>;
  /** The `WebSocket` constructor; the global one by default. */
  WebSocket?: new (url: string) => WebSocketLike;
}

const OPEN = 1;

/**
 * A transport over a WebSocket, in the URL scheme and binary framing of
 * the y-websocket protocol: y-websocket's own server, y-sweet, and
 * y-partykit all answer it.
 *
 * `WebSocket` exists in a dedicated worker, so this runs in the
 * application worker beside the document and nothing reaches the shell.
 */
export function websocketTransport(options: WebSocketTransportOptions): SyncTransport {
  return {
    async connect(handlers) {
      const params = options.params ? await options.params() : {};
      const query = new URLSearchParams(params).toString();
      const base = options.url.replace(/\/+$/, '');
      const url = `${base}/${encodeURIComponent(options.room)}${query === '' ? '' : `?${query}`}`;
      const Socket = options.WebSocket ?? (globalThis.WebSocket as unknown as new (url: string) => WebSocketLike);
      const socket = new Socket(url);
      socket.binaryType = 'arraybuffer';
      let closed = false;
      socket.onopen = () => handlers.open();
      socket.onmessage = event => {
        if (event.data instanceof ArrayBuffer) {
          handlers.message(new Uint8Array(event.data));
        } else if (event.data instanceof Uint8Array) {
          handlers.message(event.data);
        }
      };
      socket.onclose = event => {
        if (!closed) {
          closed = true;
          handlers.close(event.reason === '' ? undefined : event.reason);
        }
      };
      // A failed socket always closes after it errors, and the close is
      // what the room acts on.
      socket.onerror = () => {};
      return {
        send(data) {
          if (socket.readyState === OPEN) {
            socket.send(data);
          }
        },
        close() {
          socket.close();
        }
      };
    }
  };
}
