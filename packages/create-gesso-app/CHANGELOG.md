# create-gesso-app

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
