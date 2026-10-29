# gesso-vite-plugin

## 0.7.0

### Minor Changes

- fe71a86: An application can offer an agent tools of its own, beside its channels' and its screen's: `renderRoot(App).useAgentTools([...])`, and `useAgentTools` on the app builder. A tool is a name, a description, an input schema and a `run` that may answer with text, data and pictures (`agentText`, `agentImages`, `agentError` from `gesso-framework/agent`); its arguments are checked against the schema first. In `gesso-vite-plugin`, `agentInstructions` adds an application's own words to what an agent is told when it connects, and `catalog.exclude` leaves folders of generated code out of the component catalog, so they are not counted as uses.

### Patch Changes

- cedb9ff: A call the dev server's agent bridge sent to a page that then closed or reloaded is answered at once, saying the page closed and to call again, rather than left to time out; a tool that waits on purpose would otherwise have kept the agent waiting for its whole wait.
- 3910bc9: `gesso({ catalog: { root } })` reads another project's components for the agent endpoint, rather than those of the project Vite serves: for an application that designs one, such as a design editor serving the project it works on from another folder. The dev server watches that folder too, so a component saved in a new file there is in the next answer.
- 4198183: The component catalog reads a project's components through the tsconfig it was given, not whichever one sits beside them, and keeps working when a tsconfig it had seen is deleted while the dev server runs: TypeScript refusing the update is a fresh checker, and a failed read is a warning and an empty catalog, never an unhandled rejection that ended the server.
- 0e73baa: The dev server's agent endpoint now offers the project's own components, so an AI agent designing a screen uses what is there instead of drawing it again from boxes. `library_overview` lists every component in one line each, `library_search` finds the ones a few words describe, and `library_get` gives one in full: each input's type, default and meaning, examples, and the files that already use it. They are read from the files the project's tsconfig includes, a component saved in a new file is in the next answer, and they are answered on the dev server, so an agent can read them before a page is open. A library's components join only when named: `gesso({ catalog: { libraries: ['gesso-components'] } })`, and `catalog: false` leaves the tools out.

  `tokens_view` joins the screen tools: the colours, type styles, corner radii, spacing scale and shadows of the theme in force, by name and value, at a control or at the application's outermost content. An agent told the names writes `backgroundColor="surface"` rather than a colour that will not follow the theme into dark mode. `GessoRuntime.themeAt(id)` gives the same theme to anything else that asks.

- 4a13fb4: `ContractReader.readComponents(file)` describes every component a module exports, as the channel reader already describes channels: what each one is for, from its JSDoc, and each input as JSON Schema with its TypeScript type, its description, its `@default`, and whether it is required. A callback, a child and a value only code can make are named for what they are rather than rejected. A type several inputs share, such as `UiLength`, is described once under `$defs`, and an input inherited from a shared props type says which one. Point it at a library's index and it reads the whole library: all 55 of `gesso-components` in under half a second. It is the catalog an AI agent designing with the library reads, so that it reaches for `Badge` instead of drawing one from boxes.

  Every component in `gesso-components` now opens with a one-line JSDoc summary, so hovering one in an editor says what it is. Twelve had their description only in the design note at the top of the file, which attached to whatever was declared under it.

- 4894062: The component catalog can be served from a desktop app's main process. `gesso-vite-plugin/catalog` carries it without Vite: `openCatalog({ root, fs })` reads the project's components with the checker and watches `root` with the `fs` it is given, so a component saved in a new file is in the next answer, and answers null when TypeScript 7 is not installed. `serveDesktopAgent` takes it as `catalog` and offers `library_overview`, `library_search` and `library_get` after the channels and the screen, with the catalog's instructions added to the app's, so an agent designing in a desktop app builds with the project's own components.
- 9c411b1: An application's agent tool can say it waits on purpose, for a person or for its next task, with `waitsUpToMs`: it is listed under MCP's `_meta` as `gesso/waitsUpToMs` (`WAITS_UP_TO`), and the bridges between the agent and the thread, the dev server's and the render worker's, give a call of it that long, where they gave up on every call after two minutes.

## 0.6.30

## 0.6.29

## 0.6.28

## 0.6.27

### Patch Changes

- 4c4ef97: Saving the module a render worker's route table comes from reloads the page instead of half replacing it. When `renderRoot(App).useRoutes(ROUTES)` imported `ROUTES` from the same module as `App`, the plugin hot-replaced that module, and the new `App` was drawn over routes that still resolved the old screens: a page that showed some of a change and not the rest, with nothing to say why. Routes are read once when the runtime is built, so the plugin now leaves such an entry unwired, warns why, and the save reloads. Keep the route table in a module of its own to keep hot replacement for the rest of the app.

## 0.6.26

## 0.6.25

## 0.6.24

## 0.6.23

## 0.6.22

## 0.6.21

## 0.6.20

## 0.6.19

## 0.6.18

## 0.6.17

## 0.6.16

### Patch Changes

- 1f60081: A channel's view may hold a `SharedArrayBuffer`. It is a handle on memory, so reference equality is the right comparison for it, and posted to another thread it is shared rather than copied: the app worker and the render worker can read one large document without sending it, and what changes is a small plain value saying which version to read. It needs a cross-origin isolated page. A desktop window's channels refuse it by name rather than sending `{}`, an agent is shown its size, and `gesso-vite-plugin` describes it in a view's schema instead of warning. A command still may not take one from an agent.

## 0.6.15

## 0.6.14

## 0.6.13

## 0.6.12

### Patch Changes

- In a dev server, an `onError` the application passes to `createApp` is now called as well as the error overlay's reporter, overlay first, instead of replacing it. An application that records its own failures keeps recording them in development and still gets the overlay.

## 0.6.11

## 0.6.10

## 0.6.9

### Patch Changes

- 7af6f56: `@hidden` on a view key keeps it from AI agents. The Vite plugin lists such keys in `ChannelSchema.hidden`, and the agent surface leaves them out of every tool result, the view resource and the output schema, so an application can keep geometry, clipboard text and the like out of an agent's context. A tool's text result is now compact JSON rather than indented, as the same view is in its structured content.

## 0.6.8

## 0.6.7

## 0.6.6

## 0.6.5

## 0.6.4

## 0.6.3

## 0.6.2

### Patch Changes

- e3615bf: The first start of a dev server no longer fails its first page load. Vite's dependency scan never saw the workers the shell constructs or the overlay and agent bridge it loads lazily, so an app with Gesso installed from npm found those packages only when the page asked for them: Vite re-optimized, answered "504 (Outdated Optimize Dep)" for modules already served, and reloaded. The plugin now shows the scan the shell as the dev server serves it and imports each worker entry for it, so everything is pre-bundled up front.

## 0.6.1

## 0.6.0

## 0.5.1

### Patch Changes

- 4958693: A page reloaded after saving a service's module no longer fails with "Service '…' is not registered. A different class of that name is registered". The render worker accepts its services' modules, and Vite leaves a module that accepts an update importing the version from before the save while every other importer moves on, so the reloaded page ran two copies of the service's module, and kept doing so until the dev server restarted. The plugin now keeps the worker entry's imports at the version the rest of the graph imports.

## 0.5.0

### Minor Changes

- f265910: An AI agent can drive a web application while it runs in development. `gesso-vite-plugin` serves MCP at `/__gesso/mcp` on the dev server and prints the `claude mcp add` line to connect; the agent then sees every channel the open page can reach, the ones its render worker feeds and the ones its application and channel workers serve, and its commands change the page as a click would. Messages travel down the HMR socket to the page, which answers them against the render worker, which asks each worker behind it over a `gesso:agent` port. A command marked `@confirm` is put to the person with the browser's dialog first. The endpoint refuses requests from browser pages, the newest open tab answers, and `agent: false` turns it off. A build carries none of it.

  `gesso-framework/agent` gains what the bridge is made of: `serveAgentPort`, `remoteSurface` and `combineSurfaces` for a surface across threads, `connectDevAgent` for the page's half, and `AgentSurfaceLike` for a surface whose answers are promises, which `handleMcpMessage` and `mcpHandler` now accept. `WorkerApp.openRenderPort(key)` opens a port to the render worker. The scaffolded `AGENTS.md` says how to connect.

- c38f97e: A single-thread app can be driven by an AI agent too. `createSyncApp(...)` builders now answer `openRenderPort('gesso:agent')` from the page, with the channels fed there, whatever their channel workers serve, and the screen tools, so the dev server endpoint and WebMCP work exactly as they do for `createApp`. `useWebMcp(true | false | { confirm })` is the builder's form of `createApp({ webmcp })`. In a dev server, `gesso-vite-plugin` now hands a `createSyncApp` builder to the agent bridge and turns WebMCP on unless the app's own `useWebMcp(false)` says otherwise. The screen tools run a pending frame after each action on the main thread as they do in the render worker, so a background tab still reports what changed. `serveApplicationAgent` in `gesso-framework/agent` is the assembly both configurations share.
- 96f4bdc: A channel can describe itself. `describeChannel(token, schema)` attaches a JSON Schema of the channel's view and of each command, and `channelSchema(token)` reads it back, so anything that meets an application only at run time can ask a channel what it holds and what its commands take: an AI agent being handed the channel as tools, a devtools panel, a test that drives an app by its commands.

  `gesso-vite-plugin` writes the schema for you. It reads each contract with TypeScript 7's checker and takes the descriptions from the JSDoc you already wrote: on the token, on each view key, on each command, and `@param` for its parameters. Four tags annotate a command for an agent: `@destructive`, `@idempotent`, `@confirm` and `@hidden`. A value that cannot cross a channel, such as a `Date`, a `Map` or an untyped `[]`, is reported as a build warning naming its path. The plugin needs `typescript` 7 or later installed, says so once if it is not, and `channelSchemas: false` turns the whole thing off.

- 88d93b3: A command may carry bytes. An `ArrayBuffer` or a typed array in a command's parameters is no longer reported as unable to cross a channel, because a command's argument is structured-cloned and bytes clone as themselves; a file can be sent as its bytes, with no base64 pass on the render thread. The schema describes such a field as a base64 string tagged `x-gesso-binary` with the type it becomes, and the agent surface decodes an agent's base64 back into that type before the command is sent. Bytes in a view key are still a warning, since a view is diffed.
- fa859bb: A desktop app serves its channels to AI agents. `serveDesktopAgent(channels, options)` in `gesso-electrobun/desktop` serves them over MCP from the main process with `Bun.serve`, which Cottontail provides, on `127.0.0.1:7310` or the next free port after it, refusing any request a web page sends, and reports the URL to connect. `messageBoxConfirm(Utils.showMessageBox)` puts a `@confirm` command to the person with the native dialog, Decline by default. The screen tools are not offered there, since the screen is in each window's render worker.

  Electrobun bundles the main process with its own build, which takes no plugins, so `gesso-vite-plugin` now ships `gesso-channels`, a command that reads contracts with the same TypeScript 7 checker and writes a module describing them, for the main process to import once; `--check` fails when it is out of date.

  The Electrobun template uses all of it: the counter is served to agents as the app starts, `hutch run channels` writes `src/shared/channels.described.ts` before every build, `hutch run typecheck` checks it is current, and the contract's JSDoc is written for an agent to read. The template moves to TypeScript 7, clearing the projected config's `baseUrl`, which TypeScript 7 removed, and to Vite 8, with `vite.config.ts` using `import.meta.dirname` and an explicit `.ts` import as Vite 8's config loader asks.

- cf3b16a: `createApp({ webmcp: true })` offers an application's channels to an AI agent in the browser through WebMCP. Once the app mounts, every tool the agent surface offers, a view tool per channel and a tool per command, is registered with `document.modelContext.registerTool` (or the older `navigator.modelContext`), and removed when the app is disposed. View tools carry `readOnlyHint`, `@destructive` commands carry `consequentialHint`, a call answers with the view it left or rejects with the sentence that says why, and a `@confirm` command is put to the person with `window.confirm` unless `webmcp: { confirm }` supplies the application's own dialog. In a browser without WebMCP nothing is registered and nothing fails. The code loads on demand, so the shell is no bigger for an app that does not ask.

  `gesso-framework/agent` adds `registerWebMcpTools`, `connectWebMcp`, `pageModelContext` and `confirmInWindow`. `gesso-vite-plugin` turns `webmcp` on in a dev server; the app's own setting still decides.

### Patch Changes

- 4624080: Dependencies resolve their `worker` build ahead of their `browser` one. Application code runs in workers, and a package's browser build may reach for `document`: every markdown parser built on micromark imports `decode-named-character-reference`, whose browser build does, and a render worker that imported one died on start with "document is not defined". Pass `workerConditions: false` to resolve as Vite does by default.
- f3a9544: Workers are built as ES modules, matching the module workers the plugin constructs, so a dynamic import in a worker becomes a chunk loaded when it runs instead of being inlined into the worker. Vite's default, IIFE, cannot split. An application that sets `worker.format` keeps its choice.

## 0.4.2

## 0.4.1

## 0.4.0

## 0.3.0

## 0.2.1

## 0.2.0

## 0.1.0

First public release.

`gesso()` finds an application's worker entries, writes the constructions and
the hot-replacement wiring, and mounts the development error overlay.

It is optional by design: nothing in `gesso-core` or `gesso-framework`
mentions Vite, and the literal `new Worker(new URL(...))` construction stays
the documented fallback. The plugin's factories go in first, so your own
options spread over them.

It also names the one failure that looks like a bug in the framework: a save
that reloads the page instead of replacing a module, because a module is
reached from the main thread as well as from the render worker.
