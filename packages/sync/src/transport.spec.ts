import { describe, expect, it } from 'vitest';

import { websocketTransport, type WebSocketLike } from './transport';

class FakeSocket implements WebSocketLike {
  static last: FakeSocket | null = null;
  binaryType = 'blob';
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onclose: ((event: { readonly reason?: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly sent: Uint8Array[] = [];

  constructor(readonly url: string) {
    FakeSocket.last = this;
  }

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({ reason: '' });
  }

  serverOpens(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
}

describe('websocketTransport', () => {
  it('connects to the room as the last path segment, with fresh params each time', async () => {
    let n = 0;
    const transport = websocketTransport({
      url: 'wss://sync.example.com/yjs/',
      room: 'board 42',
      params: async () => ({ token: `t${++n}` }),
      WebSocket: FakeSocket
    });
    const handlers = { open() {}, message() {}, close() {} };

    await transport.connect(handlers);
    expect(FakeSocket.last!.url).toBe('wss://sync.example.com/yjs/board%2042?token=t1');
    expect(FakeSocket.last!.binaryType).toBe('arraybuffer');

    await transport.connect(handlers);
    expect(FakeSocket.last!.url).toBe('wss://sync.example.com/yjs/board%2042?token=t2');
  });

  it('reports open, binary frames and one close, and sends only while open', async () => {
    const events: string[] = [];
    const connection = await websocketTransport({
      url: 'ws://localhost:1234',
      room: 'r',
      WebSocket: FakeSocket
    }).connect({
      open: () => events.push('open'),
      message: data => events.push(`message ${[...data].join(',')}`),
      close: reason => events.push(`close ${reason ?? '-'}`)
    });
    const socket = FakeSocket.last!;

    connection.send(new Uint8Array([9]));
    expect(socket.sent).toHaveLength(0);

    socket.serverOpens();
    connection.send(new Uint8Array([1]));
    socket.onmessage?.({ data: new Uint8Array([2, 3]).buffer });
    socket.onmessage?.({ data: 'text frames are not the protocol' });
    socket.onclose?.({ reason: 'bye' });
    socket.onclose?.({ reason: 'again' });

    expect(socket.sent).toEqual([new Uint8Array([1])]);
    expect(events).toEqual(['open', 'message 2,3', 'close bye']);
  });
});
