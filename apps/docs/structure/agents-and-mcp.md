---
description: 'Hand an application to an AI agent: its channels as MCP tools and resources, with the commands a person must approve asked about first.'
---

# Agents and MCP

A channel is already the shape an AI agent wants. Its view is what the
application holds, as plain data, and its commands are what it can be
asked to do, by name, with typed arguments. `gesso-framework/agent`
turns the channels an application serves into a surface an agent can
use, and serves that surface over the
[Model Context Protocol](https://modelcontextprotocol.io).

```ts
import { agentSurface, mcpHandler } from 'gesso-framework/agent';

const surface = agentSurface([notes, settings]);

Bun.serve({
  hostname: '127.0.0.1',
  port: 7310,
  fetch: mcpHandler(surface, { name: 'notes', instructions: 'A notes app the person keeps.' })
});
```

`notes` and `settings` are the same `{ token, source }` registrations
the application already hands to `serveChannels` or `createDesktopApp`,
so an agent's command reaches exactly the handler a click does, and its
effect arrives in exactly the view a screen draws. Then, from Claude
Code:

```bash
claude mcp add --transport http notes http://127.0.0.1:7310/mcp
```

## What the agent sees

For each channel:

| What                    | Name                     | Does                                                            |
| ----------------------- | ------------------------ | --------------------------------------------------------------- |
| A resource              | `gesso://<channel>/view` | Holds the view as JSON                                          |
| A read-only tool        | `<channel>_view`         | Returns the view, for the agents that call tools, not resources |
| A tool for each command | `<channel>_<command>`    | Sends the command and returns the view once it has settled      |

Returning the view after a command means an agent sees what its call
did without asking again. The call waits until the view has been quiet
for `quietMs` (50 by default) or for at most `settleMs` (1000), so a
command whose effect waits on a request still comes back with it.

Everything an agent reads about a tool comes from the contract.
[The Vite plugin](/tooling/vite-plugin#channels-described) writes each
channel's schema from its types and JSDoc, and the surface uses it:

- the JSDoc on the token and on each command becomes the tool's
  description;
- each command's parameters become the tool's input, by name, and
  arguments that do not fit are refused with a sentence saying which
  field and why, before the command is sent;
- `@destructive` and `@idempotent` become the hints a client shows
  beside the tool;
- `@hidden` keeps a command away from agents altogether;
- `@confirm` asks the person first;
- a parameter that takes bytes, an `ArrayBuffer` or a typed array, is a
  base64 string in the tool's input, tagged with the type it becomes,
  and the surface decodes it to that type before the command is sent,
  so the application receives what its own components would send.

A channel nobody described is still offered, with its commands taking
a positional `arguments` list and saying so in their descriptions.

## Asking the person

A command marked `@confirm` is not sent until `confirm` says so:

```ts
const surface = agentSurface(channels, {
  confirm: ({ channel, command, arguments: args, destructive }) =>
    askThePerson(`An agent wants to ${command} in ${channel}.`, { destructive })
});
```

`confirm` returns a boolean or a promise of one. Without it, such a
command is refused and the agent is told to ask the person to do it,
which is the safe reading of a contract that asked for a person.

## The server

`mcpHandler` is MCP's Streamable HTTP transport as a `fetch` handler,
`(Request) => Promise<Response>`, which `Bun.serve`, Deno and a service
worker take directly. The framework imports no server. It answers with
JSON rather than an event stream, which the transport allows, and has
nothing to push, so it declines the event stream with a 405.

Two options guard it:

- **`allowedOrigins`.** A request with any other `Origin` header is
  refused. Without that, a web page the person has open could reach a
  server on their own machine and send commands to their application.
  Agents are not browsers, send no `Origin`, and are unaffected.
- **`token`.** Every request must then carry it, as
  `Authorization: Bearer` and the token. Set it whenever the port is
  reachable by anything but the person's own agents.

Bind to `127.0.0.1`, not to every interface, unless you mean it.

`handleMcpMessage(surface, message)` is the same server without the
transport: one JSON-RPC message in, one answer out. It is what to wrap
for stdio, or to relay messages from somewhere else.

## Limits

- **The surface runs where the data does.** It needs the channel
  sources, so it lives in the process or worker that serves them: an
  Electrobun main process, a Bun or Node server, an application worker.
  A browser tab cannot listen on a port, so a web application cannot
  host this server itself.
- **Descriptions come from the Vite plugin.** A process whose bundle
  Vite does not build, such as an Electrobun main process, gets
  undescribed channels unless it calls `describeChannel` itself.
- **Nothing is pushed.** An agent that wants to know about a change
  reads the view again. Subscriptions are not offered.
- **Not yet run inside Electrobun.** The handler has been checked over
  real HTTP under Bun with the official MCP client. Cottontail, the
  main process Electrobun 2 runs, has not been tried.

## Next

[Channels and the barrier](/structure/channels-and-the-barrier) is the
contract this all reads from.
