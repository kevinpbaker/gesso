# gesso-electrobun

Run a Gesso application in an [Electrobun](https://electrobun.dev) window, with its stores in the main process.

```bash
npm install gesso-core gesso-framework gesso-electrobun rxjs
```

The scaffold writes a working project for you:

```bash
npm create gesso-app my-app -- --template electrobun
```

## The arrangement

The application layer is a **process** rather than a worker. State lives in the main process and every window replicates it, so two windows agree because they are replicas of the same channels, not because anything synchronises them.

```ts
// the main process
import { createDesktopApp } from 'gesso-electrobun/desktop';

createDesktopApp({ channels: [{ token: Notes, source }] }).open('/');
```

## Entry points

- `gesso-electrobun` -- the shared vocabulary, including the frame protocol
- `gesso-electrobun/main` -- the main process side
- `gesso-electrobun/view` -- inside a window
- `gesso-electrobun/desktop` -- `createDesktopApp` and `windowsChannel`

## What is checked, and what is not

A window has been opened from a fresh scaffold on **WebKitGTK**, with the counter pressed, the appearance flipped, and a second window replicating the first.

**WKWebView on macOS and WebView2 on Windows have not been run**, because the machines to run them on were not available. The adapter is written against Electrobun's own abstraction and is expected to work on both; expected is not measured, and this file will say so until it is.

## Documentation

[Gesso on Electrobun](https://gesso-docs.vercel.app/structure/gesso-on-electrobun) | [Desktop windows](https://gesso-docs.vercel.app/structure/desktop-windows)

MIT (c) Kevin Baker
