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

On connecting, the agent is told `instructions`, then how to operate a
Gesso app (`OPERATE_INSTRUCTIONS`): read a channel's `_view` first, a
command answers with the view after it, a query reads without moving
the screen, and `ui_snapshot` and the other screen tools cover the
rest. `operate: false` leaves that out, for a server whose tools are
not an app's channels. The dev server tells an agent the same, under
the name it printed, both before a window of the app is open and after
one connects.

## What the agent sees

For each channel:

| What                    | Name                     | Does                                                            |
| ----------------------- | ------------------------ | --------------------------------------------------------------- |
| A resource              | `gesso://<channel>/view` | Holds the view as JSON                                          |
| A read-only tool        | `<channel>_view`         | Returns the view, for the agents that call tools, not resources |
| A tool for each command | `<channel>_<command>`    | Sends the command and returns the view once it has settled      |
| A tool for each query   | `<channel>_<query>`      | Returns what the query answers, and moves nothing on the screen |

Returning the view after a command means an agent sees what its call
did without asking again. The call waits for the view to change and
then to be quiet for `quietMs` (50 by default), or for at most
`settleMs` (1000), so a command whose effect waits on a request still
comes back with it. A command that changes nothing in the view returns
at `settleMs`, since nothing distinguishes it from one still working,
and its answer says the view is the same as before. A command returns
nothing of its own, so that sentence is how an agent learns that an id
it sent matched nothing.

The view's JSON Schema is the `<channel>_view` tool's `outputSchema`.
Command tools return the same view but do not repeat its schema, which
would make the tool list as many times larger as there are commands.

### Queries: reading without moving the screen

A command returns nothing, and its effect is the view the person sees.
So an agent that can only send commands has to change the person's
screen to read anything the view does not hold: it sets the list's
filter to find the issues it wants, and the person is left looking at a
filter they never chose. A channel's view also usually holds only what
is on screen, such as the 60 rows a list draws.

A query answers the agent alone. Declare it beside the commands, as a
function that returns data:

```ts
export const Issues = defineChannel('issues', {
  view: { rows: [] as readonly IssueRow[] },
  commands: {} as { update(id: string, patch: IssuePatch): void },
  queries: {} as {
    /**
     * Issues that match a filter, without changing the person's list.
     * @param limit At most this many; 50 if left out.
     * @returns The issues, newest first.
     */
    find(filter: IssueFilter, limit?: number): readonly IssueRow[];
    /** One issue by id, or null. */
    get(id: string): IssueRow | null;
  }
});
```

Answer it where the data is, in `serve` (or `useChannel`'s `source`):

```ts
serve(Issues, {
  view: { rows: list.rows$ },
  commands: { update: (id, patch) => store.update(id, patch) },
  queries: { find: (filter, limit = 50) => store.find(filter, limit), get: id => store.get(id) ?? null }
});
```

`channel<View, Commands, Queries>(name, initial)` declares the same
thing. A query returns plain data, or a promise of it. The agent gets
`issues_find`, marked read-only and safe to repeat, with its input from
the parameters and its description from the JSDoc and `@returns`. The
answer comes back as JSON, and as `structuredContent` (wrapped as
`{ result }` when it is not an object). It has no `outputSchema`, for
the same reason as a command. A query that throws is a failed call
that the agent reads, and one that has not answered in 30 seconds is
said to have not answered. `@hidden` keeps a query from agents.

Queries are for agents only. The screen's components already have the
view, and they do not call queries.

### From the contract

Everything an agent reads about a tool comes from the contract.
[The Vite plugin](/tooling/vite-plugin#channels-described) writes each
channel's schema from its types and JSDoc, and the surface uses it:

- the JSDoc on the token and on each command becomes the tool's
  description;
- each command's parameters become the tool's input, by name, and
  arguments that do not fit are refused with a sentence saying which
  field and why, before the command is sent; a value written in the
  wrong JSON type, as smaller models often write them (an object or
  array as JSON text, even with a line break left raw in a string, a
  number as a string, `"true"`), is put back in the type the schema
  asks for first, where the schema does not take that string as it is,
  and an optional value sent as `null` where the schema takes no null,
  or as `""` where it must be an enum's word or match a pattern `""`
  does not (an id), is taken as left out;
- `@destructive` and `@idempotent` become the hints a client shows
  beside the tool;
- `@hidden` keeps a command away from agents altogether, and on a view
  key keeps that key out of every view an agent reads: its tool
  results, its resource and its output schema;
- `@confirm` asks the person first;
- a parameter that takes bytes, an `ArrayBuffer` or a typed array, is a
  base64 string in the tool's input, tagged with the type it becomes,
  and the surface decodes it to that type before the command is sent,
  so the application receives what its own components would send.

A channel nobody described is still offered, with its commands taking
a positional `arguments` list and saying so in their descriptions.

## Asking the person

A command marked `@confirm` is not sent until the person says yes.

### In their words

The person is asked a question, not shown a command and its arguments.
Write the question after the tag, with `{parameter}` (or
`{parameter.field}`) where an argument goes:

```ts
/** Moves an issue to another state. @confirm Move {id} to {state}? */
move(id: string, state: IssueState): void;
```

When the question needs the data, word it where the data is, in `serve`
(or `useChannel`'s `source`). The function takes what the command takes
and returns a string or `{ title, detail?, action? }`:

```ts
serve(Expenses, {
  view: { rows },
  commands: { remove: id => store.remove(id) },
  confirm: {
    remove: id => {
      const expense = store.get(id);
      return {
        title: 'Delete this expense?',
        detail: `${money(expense.cents)} ${expense.category}, ${expense.note}`,
        action: 'Delete'
      };
    }
  }
});
```

A bare `@confirm` still works. Gesso then asks "Allow remove in
expenses?", with the command's description and arguments as the
detail. Wording that throws is passed over for the next.

### On the app's own screen

```ts
import { agentConfirmDialog } from 'gesso-components';

renderRoot(App).useAgentConfirm(agentConfirmDialog());
```

`agentConfirmDialog()` asks in a `Dialog` on the canvas, in the app's
theme. It shows the question, its detail, which agent is asking ("Asked
by Claude Code"), and a button with the question's own word, painted
as danger for a `@destructive` command. A new project from
`create-gesso-app` has it already. To draw your own, pass any
`AgentConfirmAsk`: it is given the request and the running app's
services, its outermost content (for the theme), and a signal that is
aborted when the question is withdrawn.

Without `useAgentConfirm`, the page asks with the browser's own dialog,
as before.

### When nobody can be asked

The answer is `approved`, `declined`, or `unavailable` (with a reason
as `{ unavailable: why }`), and a boolean is taken as the first two.
`unavailable` is not a no. The command is not sent, and the agent is
told that nobody could be asked and why, so it can ask the person to
bring the window forward:

```text
Nobody could be asked to approve expenses.remove: the app's window is hidden. The person did not decline it.
Ask them to bring the app's window forward and call it again, or to do it themselves.
```

Gesso answers `unavailable` when the window is hidden, when the
browser does not show its dialog (a `window.confirm` that answers no in
under 50 ms was never shown), when an in-app question gets no answer in
`AGENT_CONFIRM_MS` (110 seconds, inside the time the page gives a
call), and when the app gave agents no way to ask.

### On a server

`agentSurface` takes the same `confirm`:

```ts
const surface = agentSurface(channels, {
  confirm: ({ question, agent, destructive }) =>
    askThePerson(question.title, { detail: question.detail, agent, destructive })
});
```

`agent` is the client's own name for itself, from MCP's `clientInfo`,
when the transport knows it: `mcpHandler` and the dev server both do.
Without `confirm`, a `@confirm` command is refused and the agent is
told to ask the person to do it, which is the safe reading of a
contract that asked for a person.

## What agents did

Every runtime keeps a record of what AI agents have done to the app:
`AgentActivityService`. The agent bridge writes an entry for each call
of a tool that can change something (a command, a screen action, a
tool the app offers that is not read-only), with the agent that made
it, as its client names itself, and what came of it: `changed`,
`unchanged`, `declined`, `unasked` or `failed`. Reading a view, a
query or the screen is not recorded.

To show the person, put `AgentActivityToast` from `gesso-components`
anywhere in the app. Once an agent has been quiet for a moment, it says
the burst of changes in one toast:

```text
Claude Code made 9 changes: update ×8, create.
```

A new project has one already. For a history of your own, inject the
service: `entries` is everything kept (the last 500), `latest` is each
entry as it is recorded, and `describeAgentActivity(entries)` says a
run of them in that sentence.

A server records the same way, by wrapping its surface:

```ts
const activity = new AgentActivityService();
mcpHandler(recordAgentActivity(agentSurface(channels), activity), { name: 'notes' });
```

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

An agent that edits the code reads its work through these too, so they
say when the code broke it. If the application threw as it started,
every one of them answers with what was thrown and where
(`ReferenceError: Each is not defined at App (src/App.tsx:88:12)`), not
with "has not started yet", and a saved fix starts it without the page
being reloaded. If a later change threw as it loaded, the outline still
comes back, headed with that error and a note that it is the screen from
before the change.

### The screen tools act as the person

A press through `ui_press` is the person's click. So an agent can press
anything the person can, and that includes the Delete in a confirmation
that the screen draws. A command whose contract says `@confirm` is put
to the person when an agent sends it, but a button that sends the same
command from the screen is not, unless the app says so.

Mark a control with `agentConfirm`, and an agent's press, typing or key
on it, or on anything inside it, is put to the person first, through
the same `confirm` as a `@confirm` command (the app's own dialog, when
it has `useAgentConfirm`):

```tsx
<box agentConfirm="Delete this expense?">
  <Button label="Delete" tone="danger" onClick={() => expenses.send.remove(id)} />
</box>
```

A string is the question. `true` asks one written from the control's
name ("Allow pressing button "Delete"?"). `agentConfirm={false}` on a
control inside a marked one lets that control through. The outline
says `(asks the person first)` on each control that asks. Focus, Tab,
Escape and the arrow keys never ask. A person's own clicks are
untouched, and nothing is drawn or announced differently.

## In development, with nothing to write

A web application's channels are in its workers, and a browser tab
cannot listen on a port, so it cannot host the server above. In
development it does not need to. [The Vite plugin](/tooling/vite-plugin)
serves MCP at `/__gesso/mcp` on the dev server and prints the commands
to connect when it starts, under the root folder's name unless
`agentName` gives another:

```text
  ➜  Agents:  http://localhost:5173/__gesso/mcp  (MCP, as my-app)
             claude mcp add --transport http my-app http://localhost:5173/__gesso/mcp
             codex mcp add my-app --url http://localhost:5173/__gesso/mcp
             gemini mcp add --transport http my-app http://localhost:5173/__gesso/mcp
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
to you before it is sent, in the app's own dialog (`useAgentConfirm`)
or else with the browser's.

With several tabs open, the newest answers, and closing it hands back
to the one before. While more than one is open, the endpoint also lists
`windows_list`, which numbers them with their titles and addresses, and
`windows_use`, which sends one agent's calls to the window it names
until that window closes. Other agents keep the newest. With none open, the agent is told to open one. The
endpoint refuses any request from a browser page, so a site you have
open cannot reach it, and a build carries none of it.

## Designing with what the project has

An agent asked for a screen draws it from boxes unless it knows the
project already has a `PageHeader`, a `StatusPill` and an `EmptyState`,
what each takes, and how the project writes them. Those are the
project's own, made by its designers and its agents, so the dev server
reads them from the project's source with the checker that describes
its channels, and offers them beside the channel and screen tools:

| Tool               | Gives                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| `library_overview` | Every component, one line each: what it is for, where it is from, how often used |
| `library_search`   | The components a few words find, best first                                      |
| `library_get`      | One in full: each input's type, default and meaning, and the files that use it   |
| `tokens_view`      | The theme's colours, type styles, radii, spacing and shadows, by name and value  |
| `render_frame`     | A module drawn to a PNG at a width, in the app's own pixels                      |

A component is a function whose first parameter is `Inputs<P>` and that
returns a child, or a class extending `Component`. What it is for is
its JSDoc, else its props type's, and an input's meaning is the JSDoc
on that prop, with `@default`, `@example` and `@deprecated` read too.
Inputs every control shares, such as a layout props type, are folded
into one line, so an agent reads the inputs that make the component
what it is. A component saved in a new file is in the next answer.

The three `library_` tools are answered on the dev server, where the
checker runs, so an agent can read them before any page is open, and
the instructions an agent gets when it connects tell it to. `tokens_view`
is answered in the page, because a theme is a value in the running
application: it reads the theme in force at a control, or at the
application's outermost content when none is named, and tells the agent
to write `backgroundColor="surface"` rather than the colour.

An application that designs something other than itself, as a design
editor designs its project, names the themes it designs in with
`renderThemesWith` on its render root. Then `tokens_view` and
`render_frame` mean those when asked for no theme, the light one before
the dark, because the editor's own chrome is not what the agent is
designing; `theme: "app"` still asks for the application's own.

`gesso-components`' components join the project's whenever the project
has the package. Other libraries join when the plugin names them, and
`gesso({ catalog: { libraries: [] } })` offers the project's own alone.

### Seeing what it built

`render_frame` is how an agent looks at what it wrote. It names a module
from the project root, as `library_overview` gives it, and a width, and
gets back a PNG as an MCP image: the module's default export, or its
only component, or the export it names, given the inputs it passes. The
page draws it with a runtime of its own on a canvas nobody sees, through
the same layout, text and paint as the application, so the picture is
the application's pixels rather than a likeness of them, in the
theme being designed in unless `light`, `dark` or `app` is asked for.

```json
{ "module": "src/mocks/Settings", "width": 390, "scale": 2 }
```

Without a height a frame is as tall as its content, which suits a
component or a section; a whole screen is given one, and fills it. The
answer says when nothing was drawn, either no height at all or nothing
but the background in the height given (a dialog closed until an input
opens it), and what was thrown while it was drawn, and an error the frame
caused is reported to the agent instead of over the person's screen. In
a dev server, a component of the project drawn without an input it
requires is refused before it is drawn, naming the input, since most
draw without one and look nearly right.

A frame's `ShellService` reports the scheme the frame is in: `dark` for
`theme: "dark"`, the application's own for `app`. So a root that picks
its theme from the shell's colour scheme, as every new project's does,
is drawn in the theme asked for and not in whichever the page is in.

A frame shares the running application's channels and services, so a
screen shows the application's real data, and a command the frame
sends reaches the application as one from the screen would. A mock with
no logic sends none.

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
them in the app's own dialog when it has one (`useAgentConfirm`), and
otherwise with the browser's `window.confirm`. Pass your own to ask
another way:

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
dialog: what the command does and the arguments the agent sent, with
Decline as the first button and the default, so Enter and Escape both
decline. The channels are passed in rather
than read from the app, because the per-window ones are about a window
an agent does not have.

### The window's screen, in development

The screen tools (`ui_snapshot`, `ui_press`, `ui_type`, `ui_focus`,
`ui_key`, `tokens_view` and `render_frame`) are served by each window's
render worker, out of the main process's reach. The window's page can reach it, and already talks to
the main process over the RPC, so it relays them:

```ts
// The window's page
import { relayScreenAgent } from 'gesso-electrobun/view';

const app = createApp({ ... });
const relay = relayScreenAgent(app, message => view.rpc?.send.screenAgent(message));
// in the RPC's message handlers: screenAgent: message => relay(message)
app.mount(host);

// The main process
import { createScreenAgent } from 'gesso-electrobun/desktop';

const screen = createScreenAgent();
// for each window: const relayed = screen.attach(message => window.webview.rpc?.send.screenAgent(message));
// in its RPC's message handlers: screenAgent: message => relayed.receive(message)
const agent = serveDesktopAgent(channels, { screen: dev ? screen.surface : undefined });
```

Only the screen tools cross; the channels the render worker replicates
are already served by the main process. An application whose state
lives in its window instead, an editor say, with nothing in the main
process to serve it, passes `createScreenAgent({ windowChannels: true })`
and the window's channels cross too. The relay only needs something to
carry messages each way, so a window loaded from a dev server rather
than `views://` can carry them over a WebSocket to the main process.

`render_frame` loads the module an agent names from where the window is
served. A window whose modules are served from somewhere else, such as
an editor serving the project it works on from another folder, says
where with `renderRoot(App).loadModulesWith(path => import(...))`. Agents operate the window
attached last. Pressing the screen's buttons is everything the person
can do, including clicking through a confirmation drawn on the screen
that is not marked `agentConfirm`, so offer it in development, not to
every agent holding the token.

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

### A window behind another app's, on macOS

An agent usually works while the person is in their AI app, with the
window behind it. WebKit takes a covered window's page for a hidden one
and stops it after four minutes, so anything an agent asks of the
window (the screen tools, a window's own channels) waits until the
window comes forward. Channels served from the main process do not
cross into the window and are not affected. `keepRunningWhenCovered`
turns WebKit's occlusion detection off for the window's web view, so a
covered window keeps running; pass it `bun:ffi`, once the page has
loaded:

```ts
import * as ffi from 'bun:ffi';
import { keepRunningWhenCovered } from 'gesso-electrobun/desktop';

window.webview.on('dom-ready', () => {
  const why = keepRunningWhenCovered(window.webview.ptr, ffi);
  if (why !== null) console.warn(`The window may stop while covered: ${why}`);
});
```

A minimized window, or an app hidden with ⌘H, is still hidden, and its
page still stops.

### The project's components, on the desktop

The catalog of
[Designing with what the project has](#designing-with-what-the-project-has)
can be served from the main process too. `gesso-vite-plugin/catalog`
carries it without Vite, and `serveDesktopAgent` offers it after the
channels and the screen, with its instructions added to the app's:

```ts
import * as fs from 'node:fs';
import { openCatalog } from 'gesso-vite-plugin/catalog';

const catalog = await openCatalog({ root: projectRoot, fs });
const agent = serveDesktopAgent(channels, { screen: screen.surface, catalog: catalog ?? undefined });
// on quit: catalog?.dispose();
```

`openCatalog` answers null when TypeScript 7 is not installed, because
the checker is what reads the components. Given `fs`, it watches
`root`, so a component saved in a new file is in the next answer;
without it, the catalog is read once. Like the screen tools, it belongs
in development or in a tool that works on a project on the person's
own machine: a packaged app has no TypeScript in it to read with.

## The server

`mcpHandler` is MCP's Streamable HTTP transport as a `fetch` handler,
`(Request) => Promise<Response>`, which `Bun.serve`, Deno and a service
worker take directly. The framework imports no server. It answers with
JSON rather than an event stream, which the transport allows.

It also says some things unasked. A session that opens the GET event
stream (with the `Mcp-Session-Id` that `initialize` gave) and sends
`resources/subscribe` for a channel's view hears
`notifications/resources/updated` when that view changes, once for each
burst of changes. Every open stream hears
`notifications/tools/list_changed` when the tools change. The
capabilities say `subscribe` and `listChanged`. A surface that cannot
`watch` declines the stream with a 405. The dev server's endpoint opens
the same stream and says when the tools change, which happens when a
window with other tools connects, after an edit for example. It does
not say when a view changes.

Two options guard it, and a third, `authorize`, decides what each agent
may do (see [Scopes and OAuth](#scopes-and-oauth)):

- **`allowedOrigins`.** A request with any other `Origin` header is
  refused. Without that, a web page the person has open could reach a
  server on their own machine and send commands to their application.
  Agents are not browsers, send no `Origin`, and are unaffected.
- **`token`.** Every request must then carry it, as
  `Authorization: Bearer` and the token. Set it whenever the port is
  reachable by anything but the person's own agents.

Bind to `127.0.0.1`, not to every interface, unless you mean it. The
token is compared in constant time, so it cannot be guessed a character
at a time from how quickly a wrong one is refused.

### Scopes and OAuth

One token lets an agent do everything. For agents that may do some
things and not others, give `authorize` instead. It takes each request
and returns what that request may do, or null to refuse it:

```ts
mcpHandler(surface, {
  name: 'tracker',
  authorize: async request => {
    const claims = await verifyAccessToken(request.headers.get('authorization'));
    return claims === null ? null : { subject: claims.sub, scopes: claims.scope.split(' ') };
  },
  oauth: { resource: 'https://tracker.example.com/mcp', authorizationServers: ['https://auth.example.com'] }
});
```

Every tool says the scope it needs, under `_meta['gesso/scope']`:

| Tool                                       | Scope                     |
| ------------------------------------------ | ------------------------- |
| `<channel>_view`, a query, a view resource | `<channel>:read`          |
| A command                                  | `<channel>:write`         |
| `ui_*`                                     | `screen`                  |
| `tokens_view`, `render_frame`              | `design`                  |
| An app's own tool                          | `app:read` or `app:write` |

`<channel>:write` includes `<channel>:read`, and `*` is everything.
`@scope admin` on a command or a query gives it a scope of its own.
`@scope tracker` on the token names its scopes `tracker:read` and
`tracker:write` instead of after the channel. An app's own tool takes
`scope` beside `readOnly`.

An agent is listed only the tools and resources its grant holds. A call
of any other tool is refused with HTTP 403 and
`WWW-Authenticate: Bearer error="insufficient_scope", scope="issues:write"`,
which is how MCP tells a client to ask for more. `around` is told the
grant as `caller.grant`.

With `oauth`, Gesso takes the part of the resource server in MCP's
authorization flow. A refused request's 401 points at the server's
protected resource metadata (RFC 9728), which `mcpHandler` answers
under `/.well-known/oauth-protected-resource`. The metadata gives the
authorization servers and every scope the tools need.
`protectedResourceMetadata(surface, oauth)` gives the same metadata to
a server that routes that path somewhere else. Checking a token (its
signature, that its audience is the `resource`, that it has not
expired) is `authorize`'s job. Gesso is not an authorization server,
and it does not register clients.

### Prompts

`prompts` offers the person ready-made messages to their agent, which
most agents show as slash commands. Each is text the application wrote
once, with `{{name}}` for each argument the person fills in:

```ts
mcpHandler(surface, {
  name: 'notes',
  prompts: [
    {
      name: 'summarise',
      description: 'Summarise a notebook',
      arguments: [{ name: 'notebook', required: true }],
      text: 'Read the notebook {{notebook}} with notes_read and write a summary as a new note.'
    }
  ]
});
```

A prompt is the way of working the application knows best, handed to
whoever uses it: the person runs `/summarise` and their agent is told
what to do and with which tools. `serveDesktopAgent` takes the same
option, and the Vite plugin's `agentPrompts` offers them from the dev
server, whether or not a page is open.

### Which agent is asking

A command is called with its arguments and nothing else, so it cannot
tell one agent from another. The server can: `initialize` begins a
session, answered with an `Mcp-Session-Id` that the client sends on
every request after, and the session remembers the `clientInfo` the
client gave. `around` runs around each request with that caller, or
null for a request outside any session, so an application can keep it
where its commands will find it:

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import type { McpCaller } from 'gesso-framework/agent';

const asking = new AsyncLocalStorage<McpCaller | null>();

mcpHandler(surface, {
  token,
  around: (caller, handle) => asking.run(caller, handle)
});

// In a command, as it runs:
const who = asking.getStore();
// { session: '9f…', number: 2, client: { name: 'claude-code', version: '2.1.0' } }
```

`number` counts sessions from 1 as they begin, a short way to tell two
sessions of one client apart. `DELETE` with the session's id ends it. A
request naming a session the server has forgotten is still answered, as
one from an unknown caller. `serveDesktopAgent` takes `around` too.

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
- **A desktop app offers its screen only when the window relays it.**
  The screen tools need the render worker, which is in the window; see
  [The window's screen, in development](#the-window-s-screen-in-development).

## Next

[Channels and the barrier](/structure/channels-and-the-barrier) is the
contract this all reads from.
