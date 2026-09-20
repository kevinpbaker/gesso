# gesso-electrobun

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
