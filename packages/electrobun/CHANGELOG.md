# gesso-electrobun

## 0.6.15

### Patch Changes

- 2cc396a: `standardMenu(appName)` in `gesso-electrobun/desktop`: the application, Edit and Window menus every Mac application has, for `ApplicationMenu.setApplicationMenu`. Without an Edit menu macOS sends ⌘V and ⌘C nowhere, so text fields in a desktop window could not be pasted into or copied from. The Electrobun template installs it.
- Updated dependencies [dd812b3]
  - gesso-framework@0.6.15

## 0.6.14

### Patch Changes

- b9ddff5: A desktop window's screen tools can be offered to agents beside its channels: `relayScreenAgent` (`gesso-electrobun/view`) relays the render worker's agent port over the window's RPC, `createScreenAgent` (`gesso-electrobun/desktop`) holds the other end, and `serveDesktopAgent` takes it as `screen`. Only the screen tools cross. Meant for development, since pressing the screen's buttons is everything the person can do.
- gesso-framework@0.6.14

## 0.6.13

### Patch Changes

- Updated dependencies [0020afa]
  - gesso-framework@0.6.13

## 0.6.12

### Patch Changes

- gesso-framework@0.6.12

## 0.6.11

### Patch Changes

- Updated dependencies
  - gesso-framework@0.6.11

## 0.6.10

### Patch Changes

- gesso-framework@0.6.10

## 0.6.9

### Patch Changes

- Updated dependencies [7af6f56]
  - gesso-framework@0.6.9

## 0.6.8

### Patch Changes

- dc47f50: `messageBoxConfirm` now shows a person everything they are being asked to approve, and declines on Enter on macOS. The command's description and the arguments the agent sent were in the dialog's `detail`, which macOS does not show, so a Mac asked only "An AI agent wants to createBranch in workspace" with nothing to say which branch; they are now part of the message, which every platform shows. And the buttons were Allow then Decline: macOS makes the first button the default whatever `defaultId` says, so Enter allowed the command. Decline is now first, and the default on every platform.
- Updated dependencies [a7bb34e]
  - gesso-framework@0.6.8

## 0.6.7

### Patch Changes

- 4f622ec: Channels can now be served from another process without Electrobun. The bridge that carried a desktop window's channels to and from the main process has moved to `gesso-framework/remote`, under names that say what it is: `createRemoteBridge` in the page and `serveRemoteChannels` in the process that owns the data, with the frame format (`GessoFrame`, `frameData`, `FrameAssembler`, `isGessoFrame`, `DEFAULT_CHUNK_BYTES`) beside them. Neither half knows its transport; each takes a `send` function and has a `receive` method, so a web application whose data lives in a server on the person's machine can carry its channels over a WebSocket. The new page "Channels from another process" shows it end to end.

  `gesso-electrobun` keeps every name it had: `createElectrobunBridge`, `serveChannelsToWindow`, `ChannelHost`, `ElectrobunBridge` and the frame exports are now re-exports of the same code, so a desktop application needs no change.

- Updated dependencies [6493881]
- Updated dependencies [4f622ec]
  - gesso-framework@0.6.7

## 0.6.6

### Patch Changes

- gesso-framework@0.6.6

## 0.6.5

### Patch Changes

- e93e0ee: A `Link` can now name an in-app destination with `to`, and a Cmd-click opens it somewhere new, the way a browser treats an anchor. `to` takes one of the application's own urls (`/epic/BUD-12?story=BUD-13`) or a `RouteTarget` from `to(route, params)`. A plain click, Enter or Space runs `onPress` and then navigates the router in place. A click with Command or Control held (either one, on any platform), a middle click, or Cmd-Enter / Ctrl-Enter runs `onPress` and then asks the shell to open the app at that url somewhere new, leaving the current screen where it is. An `href` link is unchanged: it opens through `openUrl` however it is clicked. When a link has both, `to` wins. `Breadcrumb` items take the same `to`.

  The request is the new `ShellService.openRoute(url)`, and what "somewhere new" means is the shell's decision. `createApp` and `GessoApp` take an `onOpenRoute(url)` for a host with its own idea of a new tab, such as an app inside Jira opening one through Forge's `router.open`. Without one, a browser shell opens a tab at the app's own address for that url: the path on the same origin in `path` mode, the same page with the fragment set in `hash` mode. In `memory` mode there is no address, so the link is followed in place. A handed-in `ShellHistory` can answer the new optional `href(url)` to give the address itself; without it, such a link is also followed in place.

  In `gesso-electrobun`, the view bridge has `openRoute(url)` to pass as `onOpenRoute`, and `createDesktopApp` answers it by opening a new window of the application at that route: `openWindow({ route })`, and an `onOpenRoute(url, window)` option to do something else. A window learns its route from the page it loads: `open` reads `window.route`, `withWindowRoute` puts it in the view url's fragment, and `windowRoute()` reads it back as the window's starting url. An `open` that ignores it keeps working. The Electrobun template does all three.

- Updated dependencies [e93e0ee]
  - gesso-framework@0.6.5

## 0.6.4

### Patch Changes

- Updated dependencies [2f6a858]
  - gesso-framework@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies
  - gesso-framework@0.6.3

## 0.6.2

### Patch Changes

- gesso-framework@0.6.2

## 0.6.1

### Patch Changes

- gesso-framework@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [bf21b17]
- Updated dependencies [684b59a]
- Updated dependencies [e9f86a2]
- Updated dependencies [b0233fa]
- Updated dependencies [013e064]
- Updated dependencies [820aee8]
- Updated dependencies [cc9e62b]
  - gesso-framework@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [77195a4]
- Updated dependencies [6b71716]
- Updated dependencies [581cf89]
  - gesso-framework@0.5.1

## 0.5.0

### Minor Changes

- fa859bb: A desktop app serves its channels to AI agents. `serveDesktopAgent(channels, options)` in `gesso-electrobun/desktop` serves them over MCP from the main process with `Bun.serve`, which Cottontail provides, on `127.0.0.1:7310` or the next free port after it, refusing any request a web page sends, and reports the URL to connect. `messageBoxConfirm(Utils.showMessageBox)` puts a `@confirm` command to the person with the native dialog, Decline by default. The screen tools are not offered there, since the screen is in each window's render worker.

  Electrobun bundles the main process with its own build, which takes no plugins, so `gesso-vite-plugin` now ships `gesso-channels`, a command that reads contracts with the same TypeScript 7 checker and writes a module describing them, for the main process to import once; `--check` fails when it is out of date.

  The Electrobun template uses all of it: the counter is served to agents as the app starts, `hutch run channels` writes `src/shared/channels.described.ts` before every build, `hutch run typecheck` checks it is current, and the contract's JSDoc is written for an agent to read. The template moves to TypeScript 7, clearing the projected config's `baseUrl`, which TypeScript 7 removed, and to Vite 8, with `vite.config.ts` using `import.meta.dirname` and an explicit `.ts` import as Vite 8's config loader asks.

### Patch Changes

- Updated dependencies [5a27b40]
- Updated dependencies [f265910]
- Updated dependencies [d36a2fa]
- Updated dependencies [c38f97e]
- Updated dependencies [b90ecb2]
- Updated dependencies [96f4bdc]
- Updated dependencies [88d93b3]
- Updated dependencies [dc7f199]
- Updated dependencies [8fb3607]
- Updated dependencies [53b4c46]
- Updated dependencies [f0ade22]
- Updated dependencies [29a36ac]
- Updated dependencies [fac08c0]
- Updated dependencies [8c1b8ed]
- Updated dependencies [2bfedcd]
- Updated dependencies [979053a]
- Updated dependencies [1dfb6c2]
- Updated dependencies [99538fa]
- Updated dependencies [fb2a6d8]
- Updated dependencies [28f5b72]
- Updated dependencies [b7c9514]
- Updated dependencies [0bef08b]
- Updated dependencies [af33f45]
- Updated dependencies [93d580b]
- Updated dependencies [68b01e0]
- Updated dependencies [5d67836]
- Updated dependencies [acad77f]
- Updated dependencies [444371c]
- Updated dependencies [62883e0]
- Updated dependencies [f02740f]
- Updated dependencies [cf3b16a]
- Updated dependencies [5b59d13]
  - gesso-framework@0.5.0

## 0.4.2

### Patch Changes

- gesso-framework@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies
  - gesso-framework@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - gesso-framework@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [025321a]
- Updated dependencies [025321a]
  - gesso-framework@0.3.0

## 0.2.1

### Patch Changes

- gesso-framework@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [be07839]
  - gesso-framework@0.2.0

## 0.1.0

First public release.

Run a Gesso application in an Electrobun window, with its stores in the main
process. The application layer is a process rather than a worker, and every
window replicates the same channels, so two windows agree by construction.

Entry points: the root for the shared frame protocol, `/main`, `/view` and
`/desktop`.

Checked on WebKitGTK, from a fresh scaffold: a window opened, the counter
pressed, the appearance flipped, and a second window replicating the first.
WKWebView on macOS and WebView2 on Windows have not been run.
