# gesso-vite-plugin

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
