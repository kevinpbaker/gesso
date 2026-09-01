# {{name}}

A Gesso application. The interface is built, laid out, painted and
hit-tested in a render worker; the page's own thread creates the canvas,
forwards input and does nothing else.

```bash
npm install
npm run dev
```

Then `npm run build` for a production bundle, `npm run preview` to serve
it, and `npm run typecheck` to check the types without building.

## The three files

| File            | What it is                                                          |
| --------------- | ------------------------------------------------------------------- |
| `src/main.ts`   | The main thread: create the app, name the worker, mount into `#app` |
| `src/worker.ts` | The render worker: name the root component                          |
| `src/App.tsx`   | The screen                                                          |

There are three rather than two because a component cannot cross
`postMessage`, so the root has to be named on the worker's side of the
barrier. Two lines carry weight:

```ts
renderWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
```

That expression has to stay written out. A bundler emits a chunk for a
worker it can see constructed, and it cannot see through a variable
holding the URL.

```json
"jsx": "react-jsx",
"jsxImportSource": "@gesso/framework"
```

Those two lines in `tsconfig.json` are the whole of what makes `<row>`
and `<text>` work. JSX here is a spelling rather than a runtime: it
compiles onto the element factories and produces the identical tree, so
`Row({ gap: 8 }, Text({ text: 'Ready' }))` is the same thing written the
other way.

## Why `vendor/` exists, and how to remove it

Gesso is not published to a registry yet. A `package.json` naming a
version of `@gesso/core` would produce a project that cannot install, so
`create-gesso-app` packed the three packages out of its own workspace,
put the tarballs in `vendor/` and pointed `dependencies` and `overrides`
at them:

```json
"@gesso/core": "file:vendor/gesso-core-0.1.0.tgz"
```

`overrides` is there because `@gesso/framework` and `@gesso/components`
declare each other by version range, and without it a package manager
is free to go looking for `@gesso/core@^0.1.0` on a registry that has
never heard of it.

Use **npm**, not pnpm. npm satisfies those ranges from the tarballs
already in the tree; pnpm 11 resolves them independently and goes to the
registry, where the packages are not.

To pick up a change made in the Gesso workspace, run
`create-gesso-app` again over this directory with `--force`, or repack
by hand:

```bash
cd path/to/gesso && pnpm --filter './packages/*' build
cd packages/core && pnpm pack --pack-destination path/to/this/project/vendor
```

When the packages are published, this all goes away: delete `vendor/`,
delete `overrides`, and put version ranges back in `dependencies`.

## Where to go next

- `App.tsx` is commented with what each part of it is doing.
- `@gesso/components` has the controls: inputs, overlays, structure,
  data and media. `Switch` in `App.tsx` is one of them.
- Every prop takes a value or an Observable of that value. That is the
  whole binding model, and it is why the component body runs once.
