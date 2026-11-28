# gesso-sync

A Gesso channel that several people edit at once: a [Yjs](https://yjs.dev) document in the application worker, projected to the view as plain data, with presence, reconnect, an offline copy and undo of your own edits.

```bash
npm install gesso-sync yjs y-protocols lib0
```

```ts
// board.app.worker.ts
import * as Y from 'yjs';
import { createRoom, snapshot, websocketTransport } from 'gesso-sync';
import { IndexedDbStorage, serveChannels } from 'gesso-framework/worker';

const doc = new Y.Doc();
const room = createRoom(doc, {
  transport: websocketTransport({ url: 'wss://sync.example.com', room: 'board-42' }),
  storage: { adapter: new IndexedDbStorage(), key: 'board-42' },
  presence: { name: 'Ada' }
});

serveChannels([
  {
    token: Board,
    source: {
      view: { cards: snapshot(doc.getArray('cards')), status: room.status, peers: room.peers },
      commands: { add: title => room.transact('Add card', () => doc.getArray('cards').push([title])) }
    }
  }
]);
```

## What is in it

- `createRoom`: the document, kept connected (y-websocket protocol, backoff with jitter), stored offline in any `StorageAdapter`, and aware of who else is here.
- `snapshot`: a shared type as a cell of plain data, checked on every change.
- `bindUndo`: this person's own edits on an `UndoStack`, undone without touching anyone else's.
- `websocketTransport` and the `SyncTransport` interface.
- `createMemoryRelay`: a sync server in memory, for specs.

The guide is [Editing together](https://gesso-docs.vercel.app/structure/collaboration).
