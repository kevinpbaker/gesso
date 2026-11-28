/**
 * `gesso-sync`: a channel that several people edit at once.
 *
 * A Yjs document lives in the application worker. `createRoom` keeps it
 * connected, stored offline and aware of who else is there;
 * `snapshot` projects it to the plain data a channel serves; and
 * `bindUndo` puts this person's own edits on the `UndoStack`. Nothing
 * here reaches the render worker or the shell.
 *
 *   const doc = new Y.Doc();
 *   const room = createRoom(doc, {
 *     transport: websocketTransport({ url: 'wss://sync.example.com', room: 'board-42' }),
 *     storage: { adapter: new IndexedDbStorage(), key: 'board-42' }
 *   });
 *
 *   serveChannels([{ token: Board, source: {
 *     view: { cards: snapshot(doc.getArray('cards')), status: room.status, peers: room.peers },
 *     commands: { add: title => room.transact('Add card', () => doc.getArray('cards').push([title])) }
 *   } }]);
 */
export { createRoom, type ConnectionState, type Peer, type Room, type RoomOptions, type RoomStorage } from './room';
export { snapshot, type Snapshot, type SnapshotOptions } from './snapshot';
export { bindUndo, type BindUndoOptions, type BoundUndo } from './undo';
export {
  websocketTransport,
  type SyncConnection,
  type SyncConnectionHandlers,
  type SyncTransport,
  type WebSocketLike,
  type WebSocketTransportOptions
} from './transport';
export { createMemoryRelay, type MemoryRelay } from './memoryRelay';
