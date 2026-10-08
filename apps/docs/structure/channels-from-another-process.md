---
description: "Serving channels from outside the page: a server on the person's machine, a desktop main process, or anything that can carry a string, with gesso-framework/remote."
---

# Channels from another process

A render worker attaches to its channels over ports, and normally the
data behind them is in an application worker in the same page. Some
applications keep their data somewhere a page cannot reach: a desktop
application's main process, or a server on the person's own machine
that runs `git`, reads files or holds a database. Nothing can carry a
port across a process boundary, so `gesso-framework/remote` stands in
for one.

| Half                  | Runs in                        | Does                                                                                                  |
| --------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `createRemoteBridge`  | the page's main thread         | accepts the render worker's port handshakes and pumps each port as a numbered stream of string frames |
| `serveRemoteChannels` | the process that owns the data | turns the frames back into the handshake `serveChannels` already answers, and the replies into frames |

Neither half knows the transport. Each takes a `send` function and has
a `receive` method, and whatever moves a string between the two
processes goes in the middle. [Desktop windows](/structure/desktop-windows)
use Electrobun's RPC; a web application served by a local process can
use a WebSocket.

## Over a WebSocket

The page hands the bridge to the shell as its application layer:

```ts
import { createApp } from 'gesso-framework';
import { createRemoteBridge } from 'gesso-framework/remote';

const socket = new WebSocket('ws://127.0.0.1:4317/channels');
const early: string[] = [];

const bridge = createRemoteBridge({
  send: frame => {
    const text = JSON.stringify(frame);
    if (socket.readyState === WebSocket.OPEN) socket.send(text);
    else early.push(text);
  }
});
socket.onopen = () => early.splice(0).forEach(text => socket.send(text));
socket.onmessage = event => bridge.receive(JSON.parse(event.data));

createApp({ appLogicWorker: bridge.endpoint }).mount('#app');
```

The render worker attaches the channel by name, exactly as it would to
one in an application worker, and cannot tell the difference.

The process that owns the data serves one host per connection. In Bun:

```ts
import { serve } from 'gesso-framework';
import { serveRemoteChannels, type RemoteChannelHost } from 'gesso-framework/remote';

const channels = [serve(Catalogue, { view: { items }, commands: { add: item => items.next([...items.value, item]) } })];

Bun.serve<{ host: RemoteChannelHost | null }>({
  hostname: '127.0.0.1',
  port: 4317,
  fetch(request, server) {
    // A WebSocket carries no CORS: check the origin, or any page the
    // person has open could connect to a server on their machine.
    if (request.headers.get('origin') !== 'http://localhost:5173') return new Response(null, { status: 403 });
    return server.upgrade(request, { data: { host: null } }) ? undefined : new Response(null, { status: 400 });
  },
  websocket: {
    open: socket =>
      (socket.data.host = serveRemoteChannels(channels, { send: frame => socket.send(JSON.stringify(frame)) })),
    message: (socket, message) => socket.data.host?.receive(JSON.parse(String(message))),
    close: socket => socket.data.host?.dispose()
  }
});
```

Each page gets its own host, and `provide` keeps a separate record of
what each has seen, so two tabs on the same data agree without anything
here arranging it. The same `channels` can be handed to
[`agentSurface` and `mcpHandler`](/structure/agents-and-mcp#the-server)
in the same process, so an AI agent and the page drive one state.

## What crosses

Frames are JSON: a channel message is serialized once into a frame's
`body`, and split across frames above `DEFAULT_CHUNK_BYTES` (one
megabyte) so no transport is asked to carry one enormous message.
`undefined` inside a value does not survive, which a view key cannot
rely on anyway, since only [plain data](/structure/channels-and-the-barrier#only-plain-data-crosses)
crosses a channel.

## Limits

- **A replica asks for everything once, when it attaches.** If the
  connection drops, the page needs a new bridge and a new shell to
  resync; reloading the page is the simplest way.
- **The bridge carries channels, not the screen.** The agent tools that
  read and press the interface (`ui_snapshot`, `ui_press`) need the
  render worker, which is in the page.
- **`gesso-electrobun` re-exports these** as `createElectrobunBridge`
  and `serveChannelsToWindow`, the names its template uses.
