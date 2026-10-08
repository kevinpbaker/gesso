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
did without asking again. The call waits for the view to change and
then to be quiet for `quietMs` (50 by default), or for at most
`settleMs` (1000), so a command whose effect waits on a request still
comes back with it. A command that changes nothing in the view returns
at `settleMs`, since nothing distinguishes it from one still working.

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

## Operating the interface

Channels are the application's own vocabulary, and the right way in for
anything they cover. Not everything is covered: a dialog's buttons, a
tab, a field the person is halfway through. For those an agent has to
do what a person does, and a canvas gives it no DOM to query and no
element to click.

So the page offers the screen too, as a screen reader hears it:

| Tool          | Does                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `ui_snapshot` | The screen as an outline: each control's role, name, state, value and a ref |
| `ui_press`    | Presses a control, as a click would                                         |
| `ui_type`     | Replaces a field's text                                                     |
| `ui_focus`    | Moves focus to a control                                                    |
| `ui_key`      | Presses a key where focus is: Enter, Escape, Tab, ArrowDown                 |

```text
- text "Newsletter" [e1]
- textbox "Your name" value="Ada Lovelace" [e3] (focused)
- checkbox "Send me the weekly email" [checked] [e4]
- button "Save" [e5]
```

A control is named by its ref, or by role and name: a name matches
exactly before it matches as a part, so `Save` is not `Save as`, and
two matches are an error listing both rather than a guess. A ref stays
the same from one snapshot to the next. Every action answers with the
outline as it is afterwards, read once the screen holds still.

Acting goes through the path the accessibility mirror uses, so a press
is the click a pointer makes and a value is the edit a keyboard makes.
An agent can do exactly what a person could and no more: a disabled
control refuses it, and an open focus trap holds it as it holds Tab.
The outline is also exactly what `gesso-testing` queries, so a control
a test can find by role and name is one an agent can use.

These are offered wherever the page's channels are, in the dev server
endpoint and through WebMCP, after the channel tools.

## In development, with nothing to write

A web application's channels are in its workers, and a browser tab
cannot listen on a port, so it cannot host the server above. In
development it does not need to. [The Vite plugin](/tooling/vite-plugin)
serves MCP at `/__gesso/mcp` on the dev server and prints the command
to connect when it starts:

```text
  ➜  Agents:  http://localhost:5173/__gesso/mcp
             claude mcp add --transport http my-app http://localhost:5173/__gesso/mcp
```

Open the app in a browser, connect, and the agent sees every channel
the open page can reach: the ones its render worker feeds itself, and
the ones its application worker and channel workers serve. Its
commands change the page in front of you as they would from a click.

The dev server cannot reach a worker, but the page can, and it already
holds a socket to the server for hot replacement. So each message an
agent posts goes down that socket to the page, the page answers it
against the render worker, and the render worker asks each worker
behind it over a port of its own. A command marked `@confirm` is put
to you in the page with the browser's own dialog before it is sent.

With several tabs open, the newest answers, and closing it hands back
to the one before. With none open, the agent is told to open one. The
endpoint refuses any request from a browser page, so a site you have
open cannot reach it, and a build carries none of it.

## In the browser, with WebMCP

[WebMCP](https://webmachinelearning.github.io/webmcp/) is the other
direction: the page registers tools with the browser, and an agent
the browser runs or hosts calls them. No server, no port, and the tools
last exactly as long as the page. One option offers every channel the
page can reach:

```ts
createApp({ webmcp: true }).mount('#app');
```

Once the app mounts, each tool the surface offers is registered with
`document.modelContext.registerTool`, and removed when the app is
disposed. The view tools carry `readOnlyHint`, a command marked
`@destructive` carries `consequentialHint`, and a call answers with the
view it left, or fails with the sentence that says why.

WebMCP has no way to ask the person, so a `@confirm` command is put to
them with the browser's `window.confirm`. Pass your own to use the
application's dialog:

```ts
createApp({ webmcp: { confirm: request => myDialog.ask(request) } });
```

The code loads on demand, only for an app that asked, so the shell
stays the size it was. In a dev server the plugin turns it on for you;
the app's own `webmcp` still decides.

WebMCP is new. Chrome offers it as an origin trial from Chrome 149 to
156, and a page without the trial token, or a browser without the
feature, has no `document.modelContext`, in which case nothing is
registered and nothing fails. Before Chrome 150 the same API was
`navigator.modelContext`, which is read when the new name is missing.

## Single-thread apps

An app made with `createSyncApp` has no render worker; the page draws,
so the page answers the agent. Everything above works the same: the
dev server endpoint, the screen tools, and WebMCP, which a
single-thread app asks for on its builder:

```ts
createSyncApp(App).useChannel(Notes, { source }).useWebMcp().mountSync('#app');
```

`useWebMcp` takes `true`, `false` or `{ confirm }`, as `webmcp` does
for `createApp`, and the plugin turns it on in a dev server unless the
app says otherwise. The agent sees the channels fed from the page, the
ones any channel worker serves, and the screen.

## On the desktop

A desktop app's channels are served from its main process, so that is
where an agent connects. `serveDesktopAgent` from
`gesso-electrobun/desktop` serves them over MCP with `Bun.serve`, which
Cottontail, Electrobun's main-process runtime, provides as Bun does:

```ts
const counter = serve(Counter, { view: { count }, commands: { increment } });

createDesktopApp({ channels: window => [counter, windowsChannel(app, window)], ... });

const agent = serveDesktopAgent([counter], {
  name: 'my-app',
  confirm: messageBoxConfirm(Utils.showMessageBox)
});
console.log(`claude mcp add --transport http my-app ${agent.url}`);
```

It listens on `127.0.0.1:7310`, or the next free port of the nine after
it, and refuses any request a web page sends. `messageBoxConfirm` puts a
`@confirm` command to the person with the operating system's own
dialog, with Decline as the default. The channels are passed in rather
than read from the app, because the per-window ones are about a window
an agent does not have, and the screen tools are not offered: the
screen is in each window's render worker, out of the main process's
reach.

Electrobun bundles the main process with its own build, which takes no
plugins, so the Vite plugin never describes the contracts there.
`gesso-channels`, a command in `gesso-vite-plugin`, describes them ahead
of time instead:

```bash
gesso-channels src/shared/Counter.ts --out src/shared/channels.described.ts
```

It reads the contracts with the same checker and writes a module that
attaches each schema when imported; the main process imports it once.
`--check` writes nothing and fails when the module is out of date. A
project from `create-gesso-app --template electrobun` has all of this
wired: every script that builds runs `gesso-channels` first, and
`hutch run typecheck` checks the module is current.

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
  A browser tab cannot listen on a port, so a web application in
  production cannot host this server itself; in development the dev
  server does it for the page.
- **Descriptions come from the Vite plugin or `gesso-channels`.** A
  bundle neither has seen offers its channels undescribed, with
  arguments as a positional list.
- **Nothing is pushed.** An agent that wants to know about a change
  reads the view again. Subscriptions are not offered.
- **A desktop app offers its channels, not its screen.** The screen
  tools need the render worker, which is in the window, not the main
  process.

## Next

[Channels and the barrier](/structure/channels-and-the-barrier) is the
contract this all reads from.
