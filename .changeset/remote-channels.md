---
'gesso-framework': patch
'gesso-electrobun': patch
---

Channels can now be served from another process without Electrobun. The bridge that carried a desktop window's channels to and from the main process has moved to `gesso-framework/remote`, under names that say what it is: `createRemoteBridge` in the page and `serveRemoteChannels` in the process that owns the data, with the frame format (`GessoFrame`, `frameData`, `FrameAssembler`, `isGessoFrame`, `DEFAULT_CHUNK_BYTES`) beside them. Neither half knows its transport; each takes a `send` function and has a `receive` method, so a web application whose data lives in a server on the person's machine can carry its channels over a WebSocket. The new page "Channels from another process" shows it end to end.

`gesso-electrobun` keeps every name it had: `createElectrobunBridge`, `serveChannelsToWindow`, `ChannelHost`, `ElectrobunBridge` and the frame exports are now re-exports of the same code, so a desktop application needs no change.
