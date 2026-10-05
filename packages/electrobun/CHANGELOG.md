# gesso-electrobun

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
