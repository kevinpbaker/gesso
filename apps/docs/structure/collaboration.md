---
description: 'Several people editing one document at once: a Yjs document in the application worker, projected to plain data, with presence, reconnect, an offline copy and undo of your own edits.'
---

# Editing together

A channel's data usually belongs to one person. When several people
edit the same board, sheet or drawing at once, every edit has to
apply where it was made, reach everyone else, and merge with what they
did in the meantime, including what they did while their train was in
a tunnel. `gesso-sync` does that with a [Yjs](https://yjs.dev)
document in the application worker.

```bash
npm install gesso-sync yjs y-protocols lib0
```

Nothing in it reaches the render worker or the shell. The view reads
plain data from a channel and sends commands, as it does for any
other channel, and cannot tell that the data is shared.

## A room

A room is one shared document and everything that keeps it shared: the
connection, the offline copy, and who else is there.

```ts
// board.app.worker.ts
import * as Y from 'yjs';
import { createRoom, snapshot, websocketTransport } from 'gesso-sync';
import { IndexedDbStorage, serveChannels } from 'gesso-framework/worker';
import { Board, type CardRow } from './board.contract';

const doc = new Y.Doc();
const room = createRoom(doc, {
  transport: websocketTransport({ url: 'wss://sync.example.com', room: 'board-42' }),
  storage: { adapter: new IndexedDbStorage(), key: 'board-42' },
  presence: { name: 'Ada', color: '#BE9A6E' }
});

const cards = doc.getArray<Y.Map<unknown>>('cards');

serveChannels([
  {
    token: Board,
    source: {
      view: {
        cards: snapshot(cards, type => type.toJSON() as CardRow[]),
        status: room.status,
        connection: room.connection,
        unsent: room.unsent,
        peers: room.peers
      },
      commands: {
        toggle: id =>
          room.transact('Toggle card', () => {
            const card = cards.toArray().find(entry => entry.get('id') === id);
            card?.set('done', card.get('done') !== true);
          })
      }
    }
  }
]);
```

The room's cells are already plain data, so they are served as they
are. The document is not, and `snapshot` is where it becomes plain
data.

## The barrier: `snapshot`

A Yjs type is a class instance with history inside it, and it can no
more cross the barrier than a `Map` can. `snapshot(type, project)` is
a cell that holds `project(type)` and computes it again once per
transaction that touched the type, however many changes that
transaction made. The channel's differ then turns the new value into
patches as it does for any key, so a toggle on the third card crosses
as `set cards[2].done` and not as the list.

Without a projection the value is the type's own `toJSON()`.

Two things follow from the projection reading the whole type:

- **Granularity is the knob, as on any channel.** One snapshot per
  thing that changes for its own reasons: the cards, the board's
  name, the comments. One snapshot of the whole document is diffed
  in full on every keystroke anyone makes.
- **Every value is checked, not only the first.** `provide` checks a
  key's first emission. A snapshot's data comes from other people's
  edits, so a value that was plain at the start can stop being plain
  later: someone puts a `Uint8Array` in a map. The snapshot then ends
  with an error naming the path, and the channel reports it.
  `{ check: false }` turns that off for a type you know is safe and
  large.

## Edits apply at once and never roll back

`room.transact(label, edit)` runs `edit` as one Yjs transaction. The
document changes at once, the snapshot follows, and the update goes
to the server if a connection is open. There is no commit to wait for
and nothing to put back, because a shared document merges edits
rather than refusing them: two people toggling the same card end up
agreeing on one answer, and two people adding cards both see both
cards.

That is why [`mutate`](/recipes/loading-and-saving#an-optimistic-like)
is not used here. `mutate` is for a write a server can refuse. A room
has no refusal to guard against.

`unsent` counts the local changes that have not been written to an
open connection: the edits made offline. A "Saved" line reads it:

```tsx
<text
  text={computed(() =>
    board.view.unsent.value === 0 ? 'Saved' : `${board.view.unsent.value} changes waiting for the network`
  )}
/>
```

The y-websocket protocol has no acknowledgement, so `unsent` counts
what was not sent, not what the server stored.

## Where a room stands

`status` uses the five words every request uses ([loading, failing,
and saving](/recipes/loading-and-saving#one-vocabulary-for-a-request)),
so a skeleton and a retry screen work as they do anywhere:

| `status`  | Means                                                                       |
| --------- | --------------------------------------------------------------------------- |
| `loading` | there is nothing to show yet                                                |
| `ready`   | there is a document: from the offline copy or the first sync, whichever won |
| `failed`  | there is no offline copy and the server could not be reached                |

A room with an offline copy is `ready` before the network answers,
and stays `ready` while it syncs behind the copy. That is the
store-first rule from `resource`'s `peek`: a board opened twice is
instant the second time. A `failed` room becomes `ready` when a later
connection syncs.

`connection` says where the network is:

| `connection` | Means                                                           |
| ------------ | --------------------------------------------------------------- |
| `offline`    | no connection, and one is waiting to be tried, or never will be |
| `connecting` | a connection is being opened                                    |
| `syncing`    | open, and the two sides are exchanging what the other lacks     |
| `online`     | open, and this side holds everything the server held            |

`error` is the last thing that went wrong, as a sentence, and goes
back to null when a connection syncs.

## Reconnecting

A connection that closes is tried again, with the wait doubling each
time from half a second to thirty, and each wait somewhere between
half and all of that, so a server that drops everyone at once is not
met by everyone at once. A connection that opens resets the wait. An
`online` event on the worker's global scope cuts a long wait short.

On every connection the two sides swap state vectors, so only what
each side lacks travels. Edits made offline go in the first reply,
which is when `unsent` returns to 0.

`disconnect()` closes the connection on purpose and stays offline
until `reconnect()`. Edits still apply and are kept, and they merge
when the room reconnects.

### A refusal

When the server refuses the connection (an expired token, a document
this person may not open), the room stops: `connection` is `offline`,
`error` says why, and nothing is retried, because retrying will not
change the answer. Call `reconnect()` after whatever was wrong is put
right.

### The transport

`websocketTransport` speaks the y-websocket protocol: y-websocket's
own server, y-sweet and y-partykit all answer it. The room is the last
segment of the URL's path.

```ts
websocketTransport({
  url: 'wss://sync.example.com',
  room: 'board-42',
  params: async () => ({ token: await auth.freshToken() })
});
```

`params` is called again on every connection, so a token refreshed
since the last one is the one sent. A query string can end up in a
server's access log, so put a short-lived token there and never a
long-lived secret.

A transport is any object with `connect(handlers)`, so a room can run
over an Electrobun RPC or a WebRTC data channel as well. The contract
is in `SyncTransport`'s JSDoc.

## Who else is here

`presence` is what this person shows the others, and `room.peers` is
what everyone else shows, as plain data ordered by id:

```ts
room.setPresence({ focus: 'card-3' });
// on everyone else's screen: peers = [{ id: 1234, presence: { name: 'Ada', color: '#BE9A6E', focus: 'card-3' } }]
```

`setPresence` merges into what was set before, and sends at most once
per `presenceInterval` (50 ms by default): the first change at once,
the last of a burst at the end of the interval. Disconnecting says
goodbye, so the others see this person leave at once rather than when
the server notices the socket has gone.

A peer's presence came over the network from someone else's code, so
check its shape before you draw it.

What a person is pointing at is the one piece of view state that does
have to cross: the others cannot see it otherwise. Send it with a
command, and keep the caret, the hover and the scroll offset on the
render thread as [What must not
cross](/structure/channels-and-the-barrier#what-must-not-cross) says.

## The offline copy

`storage` keeps the document in any [`StorageAdapter`](/structure/persistence),
written once the edits stop (`settle`, 250 ms by default) and read
back when the room is made. `save()` writes it now, for the moment
the worker is about to go.

Reading it back cannot race an edit the way `persisted` can. An edit
made before the copy was read merges with the copy, as an edit from
another person would, and nothing is written until the copy has been
read, so the stored document is never replaced by one that has not
seen it. `denied` and `full` act as they do for `persisted`: the
document keeps working in memory and `error` says so once.

## Undo

Undo in a shared document cannot be an inverse operation recorded by
hand. "Put the old title back" also wipes out the title somebody else
typed since. `bindUndo` puts each local edit on an
[`UndoStack`](/structure/undo) as an entry that calls
`Y.UndoManager`, which removes this person's own change and leaves
everyone else's standing:

```ts
import { UndoStack } from 'gesso-framework/worker';
import { bindUndo } from 'gesso-sync';

const undo = new UndoStack();
bindUndo(room, undo);

room.transact('Rename board', () => meta.set('name', name));
undo.undo(); // the rename, and nothing anyone else did
```

The label passed to `transact` is the entry's label, so the menu cells
(`undoLabel`, `canUndo`) and Mod+Z work as for any other entry. Each
new label starts a new entry, and the same label again within
`captureTimeout` (500 ms) extends the one before it, which is how a
run of typing becomes one undo. Edits from other people never appear
on this person's stack.

## Agents edit like people

An AI agent works the app through the same commands
([Agents and MCP](/structure/agents-and-mcp)), so an agent's edit is a
`transact` like a person's: it merges, it reaches everyone else live,
and it lands on the undo stack of the person whose app it was made in.

## Specs without a server

`createMemoryRelay()` is a sync server in memory that answers the same
protocol, so two rooms can be tested together in bare vitest:

```ts
const relay = createMemoryRelay();
const ada = createRoom(new Y.Doc(), { transport: relay.transport('board') });
const ben = createRoom(new Y.Doc(), { transport: relay.transport('board') });

relay.dropAll(); // a network drop
relay.setReachable(false); // a server that is down
relay.deny('token expired'); // a refusal
```

Every frame arrives on a later microtask, as on a network, so a spec
awaits before it looks.

## Limits

- **No server is included.** Run y-websocket's server, y-sweet or
  y-partykit, or a host that serves one of them.
- **A server cannot refuse one edit.** It can refuse the connection,
  but a rule such as "only the owner may delete a card" has to be
  checked on the server, and the protocol has no way to send a single
  refused edit back.
- **The text editor is not bound to `Y.Text`.** A shared rich text
  field, with each person's caret and selection shown to the others, is
  not built yet. Plain strings in a `Y.Map` work as any other value.
- **Undo can skip.** When everything an entry would undo has already
  been deleted by someone else, `Y.UndoManager` moves on to the entry
  before it, and one press then undoes two of this person's edits.
- **Measured in node, not yet in a browser.** The specs run two rooms
  over the in-memory relay. A run against a real y-websocket server in
  a worker has not been made.
