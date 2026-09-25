<div align="center">

# Gesso

**A retained-mode UI framework that draws your app on a canvas, lays it out like Chrome, and never lets the main thread touch it.**

_gesso_ (**JESS**-oh): the primer coat that makes a raw canvas take paint.

TypeScript · RxJS · Canvas2D & WebGPU · zero DOM layout · zero runtime dependencies beyond `rxjs`

[Why](#why-gesso) · [Sixty seconds](#sixty-seconds) · [Three threads](#three-threads-and-a-declared-barrier) · [What's inside](#whats-inside) · [Proof](#proof-not-promises) · [Get started](#get-started) · [Architecture](#architecture)

</div>

---

## Why Gesso

Every web UI framework is, in the end, a clever way to ask the DOM to do layout. The DOM is a fine document renderer and a mediocre application runtime: layout is opaque, styling is a global namespace, and every millisecond of your business logic competes with paint for the one thread that matters.

Gesso starts from the other end. It owns the whole stack (component model, retained scene graph, layout, input, rasterization) and treats the browser as a place to put a canvas and a source of raw pointer events. The consequences are the point:

- **Three threads, and the one you can see does the least.** The shell owns the `<canvas>` and forwards input. The render worker owns components, layout, hit-testing and painting. The application worker owns your data and reaches the render worker directly, over a channel that never touches the main thread.
- **Layout you can trust, because Chrome checked it.** Gesso borrows CSS's vocabulary (`flexGrow`, `gap`, `padding`, `position: 'absolute'`, `fr(1)`), so it must borrow CSS's answers. Every layout conformance case is rendered by headless Chrome, and the engine is asserted to match every box within 0.1 px.
- **Layout you can interrogate.** `engine.explain(node)` tells you _why_ a box is the size it is, in sentences, in the order the rules applied. A hover inspector paints margin, padding and content boxes and a heatmap of what the last frame actually re-measured. Misspell a prop and the graph builder throws instead of silently ignoring it.
- **Cost follows the change, not the tree.** A text edit deep in a 10k-node page re-measures fewer than 20 nodes. A scroll frame re-measures zero. These are CI budgets, not aspirations.
- **Two renderers, one truth.** Canvas2D and WebGPU consume the same `LayoutRecord`s through the same `UiRenderer` contract, are checked draw-for-draw in tests, and pixel-diffed against each other in headless Chrome.

## Sixty seconds

An application is three files across three threads, joined by one shared module that holds names and shapes and no implementation.

```ts
// notes.contract.ts: the only module both workers import
import { channel } from 'gesso-framework';

export interface NotesView {
  readonly rows: readonly NoteRow[];
  readonly open: OpenNote | null;
}
export interface NotesCommands {
  open(id: string): void;
  create(): void;
  setBody(body: string): void;
}

export const Notes = channel<NotesView, NotesCommands>('notes', { rows: [], open: null });
```

`channel()` returns a token: a name, an initial value per key, and a phantom type. No class, no decorators, nothing to bundle.

```ts
// notes.app.worker.ts: your application. Plain classes, plain RxJS.
import { serveChannels } from 'gesso-framework';

const repository = new OpfsNotesRepository(SEED_NOTES);
const domain = new NotesDomain(repository);
const view = new NotesViewModel(domain);

serveChannels([
  {
    token: Notes,
    source: {
      view: { rows: view.rows, open: view.open },
      commands: {
        open: id => domain.select(id),
        create: () => domain.create(),
        setBody: body => domain.setBody(body)
      }
    }
  }
]);
```

Above `serveChannels` there is no framework import in that file's dependency graph. No decorator, no base class, no runtime, so every layer beneath it is testable with bare vitest, in node, with no browser and no graph.

```tsx
// notes.render.worker.ts: everything the user sees
import { renderRoot, internalState } from 'gesso-framework';

function NotesApp(props, ctx) {
  const notes = ctx.channel(Notes);
  return (
    <column gap={12} padding={24}>
      {notes.view.rows.pipe(map(rows => rows.map(row => createComponent(NoteRow, { row }, row.id))))}
      <button onClick={() => notes.send.create()} padding={8} borderRadius={6}>
        <text text="New note" />
      </button>
    </column>
  );
}

renderRoot(NotesApp).useChannel(Notes);
```

```ts
// main.ts: the main thread's entire job
createApp({
  renderWorker: () => new Worker(new URL('./notes.render.worker.ts', import.meta.url), { type: 'module' }),
  appLogicWorker: () => new Worker(new URL('./notes.app.worker.ts', import.meta.url), { type: 'module' })
}).mount('#app');
```

The shell spawns both workers, creates one `MessageChannel` between them, hands each an end, and then holds neither. It cannot be in a patch's way even by accident.

Notice what isn't there. No re-render pass: the component body runs **once**, and the `Observable` is bound straight into the retained graph. No virtual DOM diff: component identity _is_ node identity, so there is no second reconciler. No `useEffect`. No CSS. No base class to extend for your state, and no framework type anywhere in your domain layer.

Single-thread mode exists too, `createSyncApp(NotesApp).useChannel(Notes, { source }).mountSync('#app')`, for tests, headless rendering, and environments without `OffscreenCanvas`. Channels resolve in-process there, so the same contract runs with no ports.

## Three threads and a declared barrier

| Thread            | Owns                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shell** (main)  | the `<canvas>`, input forwarding, the editing proxy for IME, `ResizeObserver`, and the APIs that exist only here: history and the address bar, `localStorage`, clipboard, IPC |
| **App worker**    | api → storage → domain → view models. Plain RxJS                                                                                                                              |
| **Render worker** | components, the retained graph, layout, input dispatch, hit-testing, rasterization, and the runtime services                                                                  |

Application work has to cost something somewhere, and the arrangement decides what. State in the render worker costs dropped frames. State on the shell costs input latency. State in the app worker costs neither, which is what its thread buys.

Only plain data crosses. `provide()` checks each key's first emission in development and throws naming the path when it finds a `Date`, a `Map`, a `Set` or a class instance, because the structural differ excludes class instances by prototype check and would otherwise report "changed" forever. The view model is the flattening point, and the barrier makes that a startup error rather than a silent performance bug.

Granularity is the tuning knob. Declare keys finely (`rows` and `open` separately, not one `state` object), because a key holding a large array re-diffs that array on any change.

The full model, including which cells live where and what each one crosses, is in [Channels and the barrier](apps/docs/structure/channels-and-the-barrier.md) and [Workers](apps/docs/guide/workers.md).

## What's inside

The documentation site under [`apps/docs`](apps/docs) is the reference. This is the map.

| Area                         | The short version                                                                                                                                                                                                                                                                                                                                                                                                                           | Read more                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Layout**                   | Flexbox in full: `stretch` by default, automatic minimum size, CSS §9.7 freeze-and-redistribute, wrap, reverse, RTL, `margin: auto`, `aspectRatio`. CSS Grid with typed tracks (`fr()`, `minmax()`, `repeat()`). `absolute`, `relative` and `sticky` positioning, anchored overlays that flip to stay on screen, `overflow` on any container. Lengths are tagged values, never strings: `columns: '1fr 1fr'` throws and names the property. | [Flex](apps/docs/layout/flex.md) · [Grid](apps/docs/layout/grid.md) · [Positioning](apps/docs/layout/positioning-and-overlays.md) · [Scrolling](apps/docs/layout/overflow-and-scrolling.md) |
| **Text**                     | One paragraph algorithm shared by the engine and both renderers. Word and character wrapping, `maxLines`, ellipsis, hanging spaces, fit-content width, real baselines. Line breaks checked against Chrome in seven scripts, including CJK, Arabic, Hebrew, Devanagari and Thai.                                                                                                                                                             | [Text](apps/docs/guide/text.md) · [Rich text](apps/docs/guide/rich-text.md) · [Fonts](apps/docs/appearance/fonts.md)                                                                        |
| **Virtualization**           | `LazyColumn({ count: 100_000, estimatedExtent: 28 }, i => Row(...))` mounts the visible rows plus an overscan band. Anchoring keeps the row under your eye still when estimates get corrected above it.                                                                                                                                                                                                                                     | [Virtualization](apps/docs/layout/virtualization.md)                                                                                                                                        |
| **Explainability**           | `engine.explain(node)` returns constraints received, sizes measured, and per-axis `decidedBy` in human sentences. A change is laid out from the nearest relayout boundary, not the root, and the inspector shows which.                                                                                                                                                                                                                     | [Asking the engine why](apps/docs/layout/explain.md) · [Inspecting a node](apps/docs/tooling/inspecting-a-node.md)                                                                          |
| **Typed authoring**          | Every factory is typed from the property registry, so a prop's type is by construction the type layout and paint read. `Row({ y: 'middle' })` is a compile error. Components are classes or functions; JSX is optional and compiles to the same calls with the same types.                                                                                                                                                                  | [Your first component](apps/docs/guide/counter.md) · [Components run once](apps/docs/guide/components-run-once.md) · [Cells and bindings](apps/docs/guide/cells-and-bindings.md)            |
| **Components**               | Five tiers, one contract: controlled by default with an optional `defaultX`, themed through `UiTheme` tokens with no colour props, keyboard operable from a keymap that is data, and emitting semantics from the day it was written. Inputs, overlays, structure, data and media.                                                                                                                                                           | [Components](apps/docs/components/index.md) · [Forms](apps/docs/guide/forms.md)                                                                                                             |
| **Semantics**                | Nodes carry `role`, `label`, `value` and `states`, or inherit them from the component that built them. The runtime diffs a semantics tree per frame and mirrors it to the platform's accessibility API. An unknown `role` fails the build.                                                                                                                                                                                                  | [Semantics](apps/docs/access/semantics.md) · [The mirror](apps/docs/access/the-mirror.md) · [Keyboard](apps/docs/access/keyboard.md)                                                        |
| **Testing**                  | `gesso-testing` mounts a tree on a manual clock over a canvas double and queries it through the same semantics tree a screen reader gets. A `toHaveBox` that misses prints `explain`'s answer under it.                                                                                                                                                                                                                                     | [Testing](apps/docs/guide/testing.md)                                                                                                                                                       |
| **Routing**                  | Routes declare full paths and a `parent`, so params are typed from the path and a misspelled one is a compile error. One outlet renders the matched chain; guards run outermost first; the only thing on the wire is a url.                                                                                                                                                                                                                 | [Routing](apps/docs/structure/routing.md)                                                                                                                                                   |
| **Modifiers**                | Extend what an element _does_ (hover, press, focus rings, tooltips, drag, measurement) without wrapping it in a component. The analogue is Compose's `Modifier.Node` or Svelte's `use:action`.                                                                                                                                                                                                                                              | [Modifiers](apps/docs/interaction/modifiers.md) · [Writing a modifier](apps/docs/interaction/writing-a-modifier.md)                                                                         |
| **Animation & transitions**  | `animate` and `spring` on cells, declarative `transition` on elements, FLIP between boxes on reorder, enter and exit, and shared elements that morph across routes. An idle app reports `ticks 0.00`. Reduced motion arrives from the shell and everything but spinners snaps under it.                                                                                                                                                     | [Motion](apps/docs/appearance/motion.md) · [Enter and exit](apps/docs/appearance/enter-and-exit.md) · [Shared elements](apps/docs/appearance/shared-elements.md)                            |
| **Editing, selection, find** | `EditableText` has a caret, selection, undo, IME composition and clipboard, with the buffer owned by the render worker. Selection spans text runs. Find is a controller over the retained graph.                                                                                                                                                                                                                                            | [Text editing and IME](apps/docs/interaction/text-editing-and-ime.md) · [Selection](apps/docs/interaction/selection.md) · [Find](apps/docs/interaction/find.md)                             |
| **Input**                    | Pointer, wheel, keyboard, focus, gestures and hit-testing run in the render worker against the painted boxes. Event props are declarative and reconciled with the node, so a handler can never outlive its element.                                                                                                                                                                                                                         | [Pointer and keyboard](apps/docs/interaction/pointer-and-keyboard.md) · [Gestures](apps/docs/interaction/touch-and-gestures.md) · [Drag and drop](apps/docs/interaction/drag-and-drop.md)   |
| **Two renderers**            | `Canvas2DRenderer` and `WebGPURenderer` implement one `UiRenderer` interface. The WebGPU backend builds a single ordered command list in Canvas2D's exact sequence. The framework picks at runtime; nothing above the renderer knows which one it got.                                                                                                                                                                                      | [Canvas2D and WebGPU](apps/docs/rendering/canvas2d-and-webgpu.md)                                                                                                                           |
| **Themes**                   | `UiEnvironment` carries typed, scoped, reactive values down the tree, and a theme change dirties exactly the nodes that read it. A motion vocabulary sits beside the theme rather than inside it.                                                                                                                                                                                                                                           | [Themes and the environment](apps/docs/appearance/themes-and-the-environment.md) · [Light and dark](apps/docs/guide/appearance.md)                                                          |
| **Devtools**                 | A canvas app that throws leaves its last good frame on screen, looking exactly like one that works. `gesso-devtools` draws the error over the app with source-mapped stacks, and a Chrome devtools panel shows the tree, a node's report, the workers' consoles, the frame profiler and the action log.                                                                                                                                     | [Devtools](apps/docs/tooling/devtools.md) · [Errors and the overlay](apps/docs/structure/errors-and-the-overlay.md) · [Frames and phases](apps/docs/tooling/frames-and-phases.md)           |
| **Desktop**                  | `gesso-electrobun` runs an application in a native window with its stores in the main process. The scaffold has a template for it.                                                                                                                                                                                                                                                                                                          | [Gesso on Electrobun](apps/docs/structure/gesso-on-electrobun.md) · [Desktop windows](apps/docs/structure/desktop-windows.md)                                                               |

## Proof, not promises

| Claim                                   | Evidence                                                                                                                                                                                                                                                       | Run it                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Layout matches Chrome                   | Conformance cases rendered by headless Chrome, every box within 0.1 px. Known divergences are pinned as `it.fails` so a fix reports itself instead of passing silently                                                                                         | `pnpm test:run` · regenerate with `pnpm fixtures:layout` |
| Text breaks where Chrome breaks         | Paragraphs in seven Noto faces (Latin, CJK, Arabic, Hebrew, Devanagari, Thai, colour emoji), laid out by Chrome and by `layoutParagraph` over Chrome's own run widths, agree on every line's offsets, ink and baseline. The few that differ are pinned by name | `pnpm fixtures:text:check`                               |
| Cost follows the change                 | Budgets: full layout once; a deep text edit measures **< 20** nodes from one relayout root; a scroll frame measures **0**; a row gaining a child re-lays out the row, not the root                                                                             | `LayoutEngine.budget.spec.ts`                            |
| Renderers agree                         | A draw-for-draw parity spec, plus a headless-Chrome pixel diff of the compare route that fails above 0.05 %                                                                                                                                                    | `pnpm parity:webgpu`                                     |
| A blocked shell costs frames nothing    | Busy-loop the main thread for five seconds. Input latency climbs, because the person is waiting on the shell, while the render worker's worst frame gap does not move                                                                                          | `#framework`                                             |
| The patch stream bypasses main          | With the shell busy-looped, a channel fed from the app worker keeps delivering patches throughout, and the render worker's frame gap is unchanged                                                                                                              | `#framework`                                             |
| Application state outlives the renderer | Switching renderer replaces the render worker (the frame count restarts) while a channel keeps counting across the swap                                                                                                                                        | `#framework`, renderer toggle                            |
| Data survives a reload                  | The notes example persists through `FileSystemSyncAccessHandle` in the app worker: type a marker, reload, and it is still there                                                                                                                                | `#example-notes`                                         |
| The published packages work             | Every package is packed to a tarball, installed with npm into a fresh Vite project, typechecked against the rolled-up declarations with `skipLibCheck: false`, built, and clicked in Chrome                                                                    | `pnpm check:install`                                     |
| The scaffold produces a working app     | `create-gesso-app` runs into a temporary directory; the result is installed, typechecked, built, and its dev server is driven in headless Chrome until the counter counts. Both templates                                                                      | `pnpm check:scaffold` · `pnpm check:scaffold:electrobun` |
| The public surface is reviewed          | Each package's exported declarations are committed as `packages/*/api/*.api.d.ts`; an added export fails the check as an added line                                                                                                                            | `pnpm api:check`                                         |
| Every control works from the keyboard   | One form holding every control in the library, tabbed through from nothing, each control operated by its role's key with the result read from the semantics tree                                                                                               | `Keyboard.spec.ts` in `gesso-components`                 |
| A screen reader has something to read   | Chrome's own computed accessibility tree for the example routes, written to committed reports in `apps/playground/accessibility/`: every node's role, name, states and value, and the order the Tab key reaches them in                                        | `pnpm check:a11y`                                        |
| A route cannot change silently          | Covered playground routes are captured in headless Chrome and diffed against committed baselines                                                                                                                                                               | `pnpm screenshots`                                       |
| The docs do not lie                     | Every live example on the site has a worker and a spec behind it, every quoted code region exists, and every page carries a description                                                                                                                        | `pnpm docs:check`                                        |

One thing is deliberately **not** claimed: no screen reader has been run against any of this. `pnpm check:a11y` proves the information reaches the platform's accessibility API and that presses and focus come back, which is the strongest evidence a Linux machine can produce. VoiceOver and NVDA remain unrun.

Everything in that table runs on every push and pull request (`.github/workflows/ci.yml`), except the screenshot gate, which is advisory there: canvas text is rasterised with the system's fonts, so baselines captured on one machine are not comparable with a runner's output.

Every claim of doneness in this project has an exit criterion observable in a browser, not just a test runner, because WebGPU cannot run in vitest at all and a passing suite is not evidence a route renders. The input-latency measurement is the cautionary tale: the first cut stamped the event where the shell forwards it, which reads ~0 ms however blocked the shell is, because the listener only runs once the thread is free. The vitest suite was perfectly happy with it. The browser check is what found it.

## Get started

```bash
pnpm install
pnpm dev                      # the playground; open the URL Vite prints
pnpm docs:dev                 # the documentation site
pnpm create:app ../my-app --local   # scaffold a project against this working tree
```

The packages are on npm, so `pnpm create gesso-app my-app` scaffolds a project anywhere, and `--template electrobun` makes it a native window. `--local` packs them out of this checkout and points the new project at the tarballs instead, which is what you want while you are changing them. [Installation](apps/docs/guide/installation.md) covers setting a project up by hand.

### The playground

One shell, switched by hash:

| Route             | What you'll see                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `#debug`          | Layout inspector over DOM boxes: hover a node, read why it's that size                         |
| `#canvas`         | Canvas2D renderer across three threads: main, data worker, render worker                       |
| `#framework`      | The component runtime in a render worker. Stall the main thread, watch the heartbeat keep time |
| `#framework-sync` | The same app on the main thread, so the contrast is unmissable                                 |
| `#modifiers`      | Behaviour attached to an element without a wrapper component                                   |
| `#webgpu`         | The WebGPU renderer drawing the real framework tree                                            |
| `#compare`        | Canvas2D and WebGPU side by side with a live pixel diff                                        |
| `#benchmark`      | WebGPU throughput                                                                              |
| `#examples`       | Ten small complete apps, below                                                                 |

| Example                | What it demonstrates                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `#example-signin`      | A passcode sign-in, written in JSX                                                              |
| `#example-notes`       | Text editing and IME over a channel, persisted to OPFS from the app worker                      |
| `#example-theme`       | Theming through the environment                                                                 |
| `#example-live`        | A live feed bound straight to the canvas                                                        |
| `#example-router`      | Nested routes, typed params and a guard, walked by the browser's Back button                    |
| `#example-animation`   | A board that moves, and an idle app that does not                                               |
| `#example-input`       | Gestures and shortcuts                                                                          |
| `#example-layout`      | Layout an application can shape at runtime                                                      |
| `#example-paint`       | Painting                                                                                        |
| `#example-transitions` | Shared elements morphing between routes, with video decoded by WebCodecs and audio on the shell |

Each example is meant to be read as much as run. The card on the examples page names the source file.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  shell (main)     forwards input · owns the <canvas> · spawns both workers   │
└───────┬───────────────────────────────────────────────────┬──────────────────┘
        │ input, resize ↓        ↑ metrics, errors          │ platform events ↓
┌───────▼───────────────────────────────────────────┐  ┌────▼──────────────────┐
│  render worker                                    │  │  app worker           │
│                                                   │  │                       │
│   Components  ── body runs once ──┐               │  │   api                 │
│   Runtime services ── observables ┤               │  │    ↓                  │
│                                   ▼               │  │   storage (OPFS)      │
│   Retained UiGraph ◄── UiGraphBuilder reconciles  │  │    ↓                  │
│        │               keyed children, props,     │  │   domain              │
│        ▼               bindings, handlers         │  │    ↓                  │
│   LayoutEngine   measure → place → scroll,        │  │   view models         │
│        │         from relayout boundaries         │  │    ↓                  │
│        ▼                                          │  │   provide(token)      │
│   UiRenderer     Canvas2D │ WebGPU → Offscreen    │  │                       │
│   Input          hit-test · pointer · keyboard    │  │                       │
│                                                   │  │                       │
│   ctx.channel(token) ◄──────── patches ───────────┼──┼── MessageChannel      │
│           send.command() ─────────────────────────┼──┼─►  (never touches     │
│                                                   │  │     the main thread)  │
└───────────────────────────────────────────────────┘  └───────────────────────┘
```

A frame runs as guarded, timed phases:

```
ticks → patches → environment → virtualize → layout → semantics → render
```

Animations advance, channel patches land, theme and environment values propagate, lazy windows advance, dirty subtrees re-lay out from their boundaries, the semantics tree is diffed, and the renderer paints. Each phase is timed and each is guarded, so a throw is reported to the shell instead of vanishing inside a worker. `FrameMetrics` come out the other side, including `inputLatencyMs` measured from the event's own `timeStamp` to the end of the frame that answers it.

### Packages

| Package             | Directory                   | What it is                                                                                               |
| ------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `gesso-core`        | `packages/core`             | The retained graph, layout, text, the two renderers, input, theming. Knows nothing about components.     |
| `gesso-framework`   | `packages/framework`        | Components, cells, the frame runtime, channels, routing, the worker barrier.                             |
| `gesso-components`  | `packages/components`       | The component library: five tiers, one contract.                                                         |
| `gesso-testing`     | `packages/testing`          | `renderTest`: mount a component with no browser and query it as a screen reader would.                   |
| `gesso-devtools`    | `packages/devtools`         | The error overlay, node inspector, frame profiler and action log.                                        |
| `gesso-vite-plugin` | `packages/vite-plugin`      | Finds an application's worker entries and writes the constructions and hot-replacement wiring. Optional. |
| `gesso-electrobun`  | `packages/electrobun`       | Runs an application in an Electrobun window, with its stores in the main process.                        |
| `create-gesso-app`  | `packages/create-gesso-app` | The scaffold. Two templates: a browser project and a native window.                                      |

`gesso-core` and `gesso-framework` each carry a second entry, `./testing`, holding the doubles their own suites use; nothing an application builds against reaches through it. Cross-package imports go through a package's root entry, never a deep path, so the committed API reports review the whole surface.

### Applications

| App                        | Directory                 | What it is                                                                 |
| -------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| `gesso-playground`         | `apps/playground`         | The demo harness: the routes above, and one shell.                         |
| `gesso-docs`               | `apps/docs`               | The documentation site, VitePress, with live examples that are also specs. |
| `gesso-devtools-extension` | `apps/devtools-extension` | The Gesso panel in Chrome devtools.                                        |

## Scripts

```bash
pnpm dev               # Vite dev server with the playground
pnpm docs:dev          # the documentation site
pnpm build             # tsdown for the packages, then vite for the playground and the extension
pnpm test              # vitest, watch mode
pnpm test:run          # vitest, once
pnpm lint              # oxlint
pnpm format            # oxfmt
pnpm typecheck         # tsc --noEmit
pnpm check             # format, lint, types, tests, build, API reports and the docs gates, in CI's order
pnpm api:check         # each package's public surface against its committed report
pnpm api:update        # rewrite those reports after an intended change
pnpm fixtures:layout   # re-render layout conformance cases in headless Chrome
pnpm fixtures:text     # re-render text conformance paragraphs in real fonts
pnpm parity:webgpu     # Canvas2D vs WebGPU pixel diff in headless Chrome (needs a WebGPU adapter)
pnpm screenshots       # each covered route against its committed baseline
pnpm check:a11y        # Chrome's computed accessibility tree against the committed reports
pnpm check:install     # pack, install and run the packages in a fresh Vite project
pnpm check:scaffold    # run the scaffold and drive the result in Chrome
```

Every Chrome-driven script runs with no browser-automation dependency: `--dump-dom` for fixtures, the DevTools protocol over Node's built-in `WebSocket` for the rest. Set `CHROME_BIN` to choose the binary. The full list is in `package.json`.

## Status & license

Gesso is an active research project: a serious attempt at building a small, deterministic UI runtime from first principles. The runtime is functional and heavily tested, on the evidence in the table above rather than on assertion.

It is also published. All eight packages are on npm at **0.2.1**: `gesso-core`, `gesso-framework`, `gesso-components`, `gesso-testing`, `gesso-devtools`, `gesso-vite-plugin`, `gesso-electrobun` and `create-gesso-app`. `pnpm create gesso-app my-app` scaffolds a working project from them right now.

Pre-1.0 means the API still moves. What that buys you is that it moves in the open: every package's public surface is committed as an API report, so an addition or a removal shows up as a diff in review, and every release is a changeset that says in the package's `CHANGELOG.md` what changed and why.

The source is public at [github.com/kevinpbaker/gesso](https://github.com/kevinpbaker/gesso) and the documentation site is at [gesso-docs.vercel.app](https://gesso-docs.vercel.app).

Licensed [MIT](LICENSE), root and every package.
