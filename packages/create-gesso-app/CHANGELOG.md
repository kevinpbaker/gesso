# create-gesso-app

## 0.6.17

## 0.6.16

### Patch Changes

- 1f60081: A channel's view may hold a `SharedArrayBuffer`. It is a handle on memory, so reference equality is the right comparison for it, and posted to another thread it is shared rather than copied: the app worker and the render worker can read one large document without sending it, and what changes is a small plain value saying which version to read. It needs a cross-origin isolated page. A desktop window's channels refuse it by name rather than sending `{}`, an agent is shown its size, and `gesso-vite-plugin` describes it in a view's schema instead of warning. A command still may not take one from an agent.

## 0.6.15

### Patch Changes

- 2cc396a: `standardMenu(appName)` in `gesso-electrobun/desktop`: the application, Edit and Window menus every Mac application has, for `ApplicationMenu.setApplicationMenu`. Without an Edit menu macOS sends ⌘V and ⌘C nowhere, so text fields in a desktop window could not be pasted into or copied from. The Electrobun template installs it.

## 0.6.14

## 0.6.13

## 0.6.12

## 0.6.11

## 0.6.10

## 0.6.9

## 0.6.8

## 0.6.7

## 0.6.6

## 0.6.5

### Patch Changes

- e93e0ee: A `Link` can now name an in-app destination with `to`, and a Cmd-click opens it somewhere new, the way a browser treats an anchor. `to` takes one of the application's own urls (`/epic/BUD-12?story=BUD-13`) or a `RouteTarget` from `to(route, params)`. A plain click, Enter or Space runs `onPress` and then navigates the router in place. A click with Command or Control held (either one, on any platform), a middle click, or Cmd-Enter / Ctrl-Enter runs `onPress` and then asks the shell to open the app at that url somewhere new, leaving the current screen where it is. An `href` link is unchanged: it opens through `openUrl` however it is clicked. When a link has both, `to` wins. `Breadcrumb` items take the same `to`.

  The request is the new `ShellService.openRoute(url)`, and what "somewhere new" means is the shell's decision. `createApp` and `GessoApp` take an `onOpenRoute(url)` for a host with its own idea of a new tab, such as an app inside Jira opening one through Forge's `router.open`. Without one, a browser shell opens a tab at the app's own address for that url: the path on the same origin in `path` mode, the same page with the fragment set in `hash` mode. In `memory` mode there is no address, so the link is followed in place. A handed-in `ShellHistory` can answer the new optional `href(url)` to give the address itself; without it, such a link is also followed in place.

  In `gesso-electrobun`, the view bridge has `openRoute(url)` to pass as `onOpenRoute`, and `createDesktopApp` answers it by opening a new window of the application at that route: `openWindow({ route })`, and an `onOpenRoute(url, window)` option to do something else. A window learns its route from the page it loads: `open` reads `window.route`, `withWindowRoute` puts it in the view url's fragment, and `windowRoute()` reads it back as the window's starting url. An `open` that ignores it keeps working. The Electrobun template does all three.

## 0.6.4

## 0.6.3

## 0.6.2

## 0.6.1

### Patch Changes

- The `create-gesso-app` command is in the published package again. npm 11 dropped a `bin` path written with a leading `./`, so `npm create gesso-app` found nothing to run.

## 0.6.0

## 0.5.1

## 0.5.0

### Minor Changes

- 9322268: A new project comes with an `AGENTS.md`: the framework's rules in one page, written for a coding agent that has only ever seen React, and a `CLAUDE.md` that points Claude Code at it. It covers what Gesso is not, why a component runs once and what that means for state, layout and theme tokens, channels, and how to check work you cannot see in the DOM. The documentation site now publishes `llms.txt`, `llms-full.txt` and a markdown copy of every page for the same readers.
- fa859bb: A desktop app serves its channels to AI agents. `serveDesktopAgent(channels, options)` in `gesso-electrobun/desktop` serves them over MCP from the main process with `Bun.serve`, which Cottontail provides, on `127.0.0.1:7310` or the next free port after it, refusing any request a web page sends, and reports the URL to connect. `messageBoxConfirm(Utils.showMessageBox)` puts a `@confirm` command to the person with the native dialog, Decline by default. The screen tools are not offered there, since the screen is in each window's render worker.

  Electrobun bundles the main process with its own build, which takes no plugins, so `gesso-vite-plugin` now ships `gesso-channels`, a command that reads contracts with the same TypeScript 7 checker and writes a module describing them, for the main process to import once; `--check` fails when it is out of date.

  The Electrobun template uses all of it: the counter is served to agents as the app starts, `hutch run channels` writes `src/shared/channels.described.ts` before every build, `hutch run typecheck` checks it is current, and the contract's JSDoc is written for an agent to read. The template moves to TypeScript 7, clearing the projected config's `baseUrl`, which TypeScript 7 removed, and to Vite 8, with `vite.config.ts` using `import.meta.dirname` and an explicit `.ts` import as Vite 8's config loader asks.

### Patch Changes

- f265910: An AI agent can drive a web application while it runs in development. `gesso-vite-plugin` serves MCP at `/__gesso/mcp` on the dev server and prints the `claude mcp add` line to connect; the agent then sees every channel the open page can reach, the ones its render worker feeds and the ones its application and channel workers serve, and its commands change the page as a click would. Messages travel down the HMR socket to the page, which answers them against the render worker, which asks each worker behind it over a `gesso:agent` port. A command marked `@confirm` is put to the person with the browser's dialog first. The endpoint refuses requests from browser pages, the newest open tab answers, and `agent: false` turns it off. A build carries none of it.

  `gesso-framework/agent` gains what the bridge is made of: `serveAgentPort`, `remoteSurface` and `combineSurfaces` for a surface across threads, `connectDevAgent` for the page's half, and `AgentSurfaceLike` for a surface whose answers are promises, which `handleMcpMessage` and `mcpHandler` now accept. `WorkerApp.openRenderPort(key)` opens a port to the render worker. The scaffolded `AGENTS.md` says how to connect.

- b90ecb2: An agent can operate the interface, not only the channels. Beside the channel tools, the page now offers `ui_snapshot`, the screen as an outline of what a screen reader announces with a short ref per control, and `ui_press`, `ui_type`, `ui_focus` and `ui_key`, which act on a control named by ref or by role and name and answer with the outline afterwards. They go through the accessibility mirror's own path, so a press is a click, a value is a keyboard edit, a disabled control refuses, and a focus trap holds. Available in the dev server endpoint and through WebMCP. `GessoRuntime.focusedNodeId()` reports which node holds focus.

  The dev bridge also announces the page again whenever its HMR socket reconnects, so a restarted dev server no longer tells an agent that no page is open while one is.

- 28f5b72: `createApp({ pageKeys: true })` says the application is the page: a key pressed while nothing on the page has focus goes to the app, and the canvas takes focus. Keys only reached the app through its canvas, so a page that loads with focus on its body ignored every shortcut until the first click. The templates `create-gesso-app` writes turn it on; an app embedded in a larger page leaves it off.
- 765fd4d: The templates' pages set `overscroll-behavior: none`. A full-page app hands a scroll it can't use back to the page, and on a Mac Chrome then stretched the whole page and showed white behind it, or took a sideways swipe as Back.
- cf3b16a: `createApp({ webmcp: true })` offers an application's channels to an AI agent in the browser through WebMCP. Once the app mounts, every tool the agent surface offers, a view tool per channel and a tool per command, is registered with `document.modelContext.registerTool` (or the older `navigator.modelContext`), and removed when the app is disposed. View tools carry `readOnlyHint`, `@destructive` commands carry `consequentialHint`, a call answers with the view it left or rejects with the sentence that says why, and a `@confirm` command is put to the person with `window.confirm` unless `webmcp: { confirm }` supplies the application's own dialog. In a browser without WebMCP nothing is registered and nothing fails. The code loads on demand, so the shell is no bigger for an app that does not ask.

  `gesso-framework/agent` adds `registerWebMcpTools`, `connectWebMcp`, `pageModelContext` and `confirmInWindow`. `gesso-vite-plugin` turns `webmcp` on in a dev server; the app's own setting still decides.

## 0.4.2

## 0.4.1

## 0.4.0

## 0.3.0

## 0.2.1

### Patch Changes

- 53f5703: **A scaffolded sibling keeps its whole name.** `create-gesso-app
../gessosheet`, run from inside a checkout called `gesso`, finished by
  announcing `Created gessosheet in heet.`

  The closing message worked out where the project had landed by testing
  whether the target path started with the current directory and slicing
  that many characters off the front. That is a string test standing in
  for a path one, and `/work/gessosheet` starts with `/work/gesso`
  without ever having been inside it, so the name lost its first four
  characters and the `cd` line underneath told the reader to go
  somewhere that does not exist.

  It is `relative` now, which answers the question that was being asked.
  Which of the two paths to print is then readability rather than
  correctness: a child or a sibling is shorter said relatively, and is
  what the caller typed, while a target on the far side of the tree is a
  run of `..` segments the absolute path beats. The files were always
  written to the right place; only the message was wrong.

- b2840a2: **A scaffold installs the framework it was released beside.** Both
  templates still asked for `gesso-core@^0.1.0` and its siblings after
  the packages moved to 0.2.0, so `npm create gesso-app` against the
  registry resolved a scaffold onto the previous framework.

  The ranges are current again, and they are no longer maintained by
  remembering. `pnpm changeset:version` now runs
  `scripts/sync-template-ranges.ts` after it moves the packages, which
  points every `gesso-*` range in the templates at the version that
  package is actually at. The templates are the one manifest a release
  would otherwise miss: they are data the CLI copies rather than
  workspace members, so changesets does not know they exist.

  `pnpm check:scaffold` already refused a drifted template and still
  does. It kept its job; it simply is not the only thing standing
  between a release and a stale scaffold any more, having fired on 0.2.0
  and been talked past.

## 0.2.0

### Patch Changes

- 6c078dd: **The Electrobun template's README no longer explains a `vendor/` that
  is not there.** The CLI appends the vendoring section itself, and only
  under `--local`, so the template carrying its own hardcoded copy meant a
  registry-scaffolded project shipped with a section about a directory it
  does not have, and a `--local` one got the section twice. Removed from
  the template; the two other lines that assumed every project was
  vendored now say which route they are about.

## 0.1.0

First public release.

```bash
npm create gesso-app my-app
```

Scaffolds a Gesso application: a Vite project whose interface is built,
laid out and painted in a render worker, with the main thread holding
the canvas and forwarding input.

Two templates. `web` is a browser project with the render worker, the
Vite plugin and the development error overlay wired up. `electrobun` is
a native window with its state in the main process, where every window
is a replica of the same channels.

`--local` packs the packages out of a Gesso checkout instead of
installing them from the registry, which is how to scaffold a project
against changes that are not released yet. It is also how
`pnpm check:scaffold` runs, so that gate tests the working tree rather
than the last release.

The CLI is compiled rather than shipped as TypeScript, because `node`
only strips types on 24 and later and this is the first thing a
stranger runs.
