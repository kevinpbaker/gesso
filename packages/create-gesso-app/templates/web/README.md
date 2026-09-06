# {{name}}

A Gesso application. The interface is built, laid out, painted and
hit-tested in a render worker; the page's own thread creates the canvas,
forwards input and does nothing else.

```bash
pnpm install    # or npm install
pnpm dev
```

Then `pnpm build` for a production bundle, `pnpm preview` to serve it,
and `pnpm typecheck` to check the types without building.

## The three files

| File            | What it is                                               |
| --------------- | -------------------------------------------------------- |
| `src/main.ts`   | The main thread: create the app and mount it into `#app` |
| `src/worker.ts` | The render worker: name the root component               |
| `src/App.tsx`   | The screen                                               |

There are three rather than two because a component cannot cross
`postMessage`, so the root has to be named on the worker's side of the
barrier.

`main.ts` names no worker, and that is `@gesso/vite-plugin` in
`vite.config.ts`. It finds `worker.ts` beside `main.ts` and writes the
construction, which has to be written out as a literal because a bundler
emits a chunk for a worker it can see constructed and cannot see through
a variable holding the URL. The plugin also, while the dev server is
running:

- replaces the screen when you save `App.tsx`, instead of reloading the
  page, and puts the keyboard focus back where it was;
- draws what the render worker threw over the application that was
  running when it threw it, source-mapped, with the node named as a path
  through your components rather than as an id;
- says so when a save is about to reload the page, which happens when a
  module is reachable from the main thread as well as from the worker.

If you would rather say it out loud, write it and the plugin leaves the
construction alone:

```ts
createApp({
  renderWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
});
```

```json
"jsx": "react-jsx",
"jsxImportSource": "@gesso/framework"
```

Those two lines in `tsconfig.json` are the whole of what makes `<row>`
and `<text>` work. JSX here is a spelling rather than a runtime: it
compiles onto the element factories and produces the identical tree, so
`Row({ gap: 8 }, Text({ text: 'Ready' }))` is the same thing written the
other way.

## Reporting errors from a production build

The overlay is a development tool and a production build carries no
reference to it. What a shipped application wants instead is its own
`onError`, which takes the same three arguments:

```ts
createApp({
  onError: (message, stack, source) => {
    reportToYourService({ message, stack, source });
  }
});
```

`source` is one of `message`, `uncaught`, `renderer`, `listener` or
`channel`, and it says what the failure cost: a `listener` error means
one handler did not run, a `renderer` error means the surface stopped
being updated, and a `channel` error means the data behind an intact
view has stopped arriving.

## Why `vendor/` exists, and how to remove it

Gesso is not published to a registry yet. A `package.json` naming a
version of `@gesso/core` would produce a project that cannot install, so
`create-gesso-app` packed the packages out of its own workspace, put the
tarballs in `vendor/` and pointed the manifest at them:

```json
"@gesso/core": "file:vendor/gesso-core-0.1.0.tgz"
```

The packed packages declare each other by version range, so without help
a package manager is free to go looking for `@gesso/core@^0.1.0` on a
registry that has never heard of it. `overrides` in `package.json` is
what tells npm; `overrides` in `pnpm-workspace.yaml` is what tells pnpm,
which reads it nowhere else. Both files say the same thing twice for
that reason.

To pick up a change made in the Gesso workspace, run `create-gesso-app`
again over this directory with `--force`, or repack by hand:

```bash
cd path/to/gesso/packages/core && pnpm build
pnpm pack --pack-destination path/to/this/project/vendor
```

When the packages are published, this all goes away: delete `vendor/`,
delete `pnpm-workspace.yaml`, delete `overrides`, and put version ranges
back in `dependencies`.

## Where to go next

- `App.tsx` is commented with what each part of it is doing.
- `@gesso/components` has the controls: inputs, overlays, structure,
  data and media. `Switch` in `App.tsx` is one of them.
- Every prop takes a value or an Observable of that value. That is the
  whole binding model, and it is why the component body runs once.
