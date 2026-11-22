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

## The files

| File            | What it is                                                       |
| --------------- | ---------------------------------------------------------------- |
| `src/main.ts`   | The main thread: create the app and mount it into `#app`         |
| `src/worker.ts` | The render worker: name the root component, and feed the channel |
| `src/App.tsx`   | The screen                                                       |
| `src/clicks.ts` | The `clicks` channel: the count, and what can be asked of it     |

`main.ts` and `worker.ts` are two files rather than one because a
component cannot cross `postMessage`, so the root has to be named on the
worker's side of the barrier.

## An AI agent can use it

`pnpm dev` prints an address and the line to add it to Claude Code,
Codex or Gemini CLI. With the app open in a browser, an agent connected
there can read the count (`clicks_view`), add to it (`clicks_add`), and
reset it (`clicks_reset`), which asks you first because `clicks.ts`
marks it `@confirm`. It can also read and press anything on screen, the
way a screen reader does (`ui_snapshot`, `ui_press`). The comments in
`clicks.ts` are what it reads to know what each command does, and the
dev server says when one is missing.

`main.ts` names no worker, and that is `gesso-vite-plugin` in
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
"jsxImportSource": "gesso-framework"
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

## Where to go next

- `AGENTS.md` is the framework's rules in one page, written for a coding
  agent and just as useful to read yourself. `CLAUDE.md` points Claude
  Code at it.
- `App.tsx` is commented with what each part of it is doing.
- `gesso-components` has the controls: inputs, overlays, structure,
  data and media. `Button` and `Switch` in `App.tsx` are two of them.
- Every prop takes a value or an Observable of that value. That is the
  whole binding model, and it is why the component body runs once.
