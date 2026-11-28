---
'gesso-sync': patch
---

A new package, `gesso-sync`, for a channel that several people edit at once. `createRoom` keeps a Yjs document in the application worker connected over the y-websocket protocol, with reconnect and backoff, an offline copy in any `StorageAdapter`, and presence. `snapshot` projects a shared type to the plain data a channel serves. `bindUndo` puts this person's own edits on an `UndoStack`. `createMemoryRelay` is a sync server in memory for specs.
