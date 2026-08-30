<div align="center">

# Gesso

**A retained-mode UI framework that draws your app on a canvas, lays it out like Chrome, and never lets the main thread touch it.**

_gesso_ (**JESS**-oh) — the primer coat that makes a raw canvas take paint.

TypeScript · RxJS · Canvas2D & WebGPU · zero DOM layout · zero runtime dependencies beyond `rxjs`

[Why](#why-gesso) · [Sixty seconds](#sixty-seconds) · [Three threads](#three-threads-and-a-declared-barrier) · [What's inside](#whats-inside) · [Proof](#proof-not-promises) · [Playground](#the-playground) · [Architecture](#architecture)

</div>

---

## Why Gesso

Every web UI framework is, in the end, a clever way to ask the DOM to do layout. The DOM is a fine document renderer and a mediocre application runtime: layout is opaque, styling is a global namespace, and every millisecond of your business logic competes with paint for the one thread that matters.

Gesso starts from the other end. It owns the whole stack — component model, retained scene graph, layout, input, rasterization — and treats the browser as a place to put a canvas and a source of raw pointer events. The consequences are the point:

- **Three threads, and the one you can see does the least.** The shell owns the `<canvas>` and forwards input. The render worker owns components, layout, hit-testing and painting. The application worker owns your data — api, storage, domain, view models — and reaches the render worker directly, over a channel that never touches the main thread.
- **Layout you can trust, because Chrome checked it.** Gesso borrows CSS's vocabulary (`flexGrow`, `gap`, `padding`, `position: 'absolute'`, `fr(1)`), so it must borrow CSS's answers. 239 layout cases are rendered by headless Chrome, and the engine is asserted to match every box within 0.1 px.
- **Layout you can interrogate.** `engine.explain(node)` tells you _why_ a box is the size it is — `flex`, `stretch`, `content`, `min`, `aspect-ratio` — in sentences, in the order the rules applied. A hover inspector paints margin/padding/content boxes and a heatmap of what the last frame actually re-measured. Misspell a prop and the graph builder throws instead of silently ignoring it.
- **Cost follows the change, not the tree.** A text edit deep in a 10k-node page re-measures fewer than 20 nodes. A scroll frame re-measures zero. These are CI budgets, not aspirations.
- **Two renderers, one truth.** Canvas2D and WebGPU consume the same `LayoutRecord`s through the same `UiRenderer` contract, are checked draw-for-draw in tests, and pixel-diffed against each other in headless Chrome.

Gesso is an experiment, and an honest one: every design decision is written down in [`docs/decisions/`](docs/decisions/) with the problem it solved and the trade it made.

## Sixty seconds

An application is three files across three threads, joined by one shared module that holds names and shapes and no implementation.

```ts
// notes.contract.ts — the only module both workers import
import { channel } from './framework';

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
// notes.app.worker.ts — your application. Plain classes, plain RxJS.
import { serveChannels } from './framework';

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

Above `serveChannels` there is no framework import in that file's dependency graph — no decorator, no base class, no runtime — so every layer beneath it is testable with bare vitest, in node, with no browser and no graph.

```tsx
// notes.render.worker.ts — everything the user sees
import { renderRoot, internalState } from './framework';

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
// main.ts — the main thread's entire job
createApp({
  renderWorker: () => new Worker(new URL('./notes.render.worker.ts', import.meta.url), { type: 'module' }),
  appLogicWorker: () => new Worker(new URL('./notes.app.worker.ts', import.meta.url), { type: 'module' })
}).mount('#app');
```

The shell spawns both workers, creates one `MessageChannel` between them, hands each an end, and then holds neither — so it cannot be in a patch's way even by accident.

Notice what isn't there. No re-render pass: the component body runs **once**, and the `Observable` is bound straight into the retained graph. No virtual DOM diff: component identity _is_ node identity, so there is no second reconciler. No `useEffect`. No CSS. No base class to extend for your state, and no framework type anywhere in your domain layer.

Single-thread mode exists too — `createApp(NotesApp).useChannel(Notes, { source }).mountSync('#app')` — for tests, headless rendering, and environments without `OffscreenCanvas`. Channels resolve in-process there, so the same contract runs with no ports.

## Three threads and a declared barrier

| Thread            | Owns                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shell** (main)  | the `<canvas>`, input forwarding, the editing proxy for IME, `ResizeObserver`, and the APIs that exist only here — History, `localStorage`, clipboard, IPC |
| **App worker**    | api → storage → domain → view models. Plain RxJS. The fast OPFS path lives here because `FileSystemSyncAccessHandle` exists only in a dedicated worker     |
| **Render worker** | components, the retained graph, layout, input dispatch, hit-testing, rasterization, and the runtime services                                               |

Application work has to cost something somewhere, and the arrangement decides what. State in the render worker costs dropped frames. State on the shell costs input latency. State in the app worker costs neither — which is what its thread buys.

Only plain data crosses. `provide()` checks each key's first emission in development and throws naming the path when it finds a `Date`, a `Map`, a `Set` or a class instance, because the structural differ excludes class instances by prototype check and would otherwise report "changed" forever. The view model is the flattening point, and the barrier makes that a startup error rather than a silent performance bug.

Two words for cells, split on the barrier axis rather than on what they hold:

|                     | Thread     | Crosses | Written by                                  |
| ------------------- | ---------- | ------- | ------------------------------------------- |
| `internalState()`   | render     | never   | its owner                                   |
| `input()`           | render     | inward  | the host — a parent prop or a channel patch |
| a `pipe`            | render     | —       | nothing; derived values need no cell        |
| channel `view` keys | barrier    | inward  | the app worker's view models                |
| channel `commands`  | barrier    | outward | components, typed                           |
| plain RxJS          | app worker | —       | api → storage → domain → view models        |

Granularity is the tuning knob. Declare keys finely — `rows` and `open` separately, not one `state` object — because a key holding a large array re-diffs that array on any change. In the notes example a keystroke in the body moves `open` wholesale while changing one row's preview; kept in one object, the differ would walk the whole list on every keystroke.

The reasoning is in [`0030-thread-model.md`](docs/decisions/0030-thread-model.md).

## What's inside

### A layout engine that finished the job

Most canvas UI kits ship flexbox-ish. Gesso shipped the CSS you actually reach for, and had Chrome grade the homework.

| Capability                   | The short version                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flexbox, complete**        | `stretch` by default, automatic minimum size, CSS §9.7 freeze-and-redistribute, `flexWrap` + `alignContent`, reverse directions, RTL, `margin: auto`, `flex: n`, `aspectRatio`, `percent(50)`.                                                                                                                                      |
| **Text as a layout citizen** | One paragraph algorithm shared by the engine and both renderers. `textWrap: 'word' \| 'char' \| 'none'`, `maxLines`, `textOverflow: 'ellipsis'`, hanging spaces, fit-content width, real baselines (`y: 'baseline'`). Flex measures items twice — max-content, then final — like the spec says.                                     |
| **Grid**                     | `Grid({ columns: [auto, fr(1)] })`. Tracks are typed: `px`, `percent()`, `auto`, `fr()`, `minmax()`, `repeat()`. Explicit lines and spans, sparse auto-flow, per-cell alignment, `justifyContent`/`alignContent` track distribution. CSS Grid §8.5 and §11, implemented apart from any node so it can be tested as pure arithmetic. |
| **Positioning & overlays**   | `position: 'absolute' \| 'relative' \| 'sticky'`, `inset`, `zIndex` paint order, aligned `Stack`s. Anchored placement (`anchor`, `placement: 'bottom-start'`) that flips and shifts to stay on screen. Every runtime mounts an `OverlayLayer`; menus, popovers and dialogs go through the `OverlayService`.                         |
| **Overflow & scrolling**     | `overflow` on _any_ container, rounded clipping, content extents, draggable overlay scrollbars that fade, `scrollIntoView` wired to keyboard focus, nested scrollers with independent offsets.                                                                                                                                      |
| **Virtualization**           | `LazyColumn({ count: 100_000, estimatedExtent: 28 }, i => Row(...))` mounts the visible rows plus an overscan band. Offsets are an estimate plus sparse corrections; the first visible row is a binary search. Anchoring keeps the row under your eye still when estimates get corrected above it.                                  |
| **Relayout boundaries**      | Parents decide, as they measure, which children can never affect them. A change is laid out from the nearest boundary, not the root. A two-slot measure memo survives flex's loose/tight alternation.                                                                                                                               |
| **Explainability**           | `engine.explain(node)` → constraints received, effective constraints, content/measured/final sizes, and per-axis `decidedBy` with human sentences. The inspector overlay draws it on both renderers, in the worker or on the main thread.                                                                                           |

Lengths are tagged values, never strings. `columns: '1fr 1fr'` throws at layout and names the property. So does `widht: 200`.

### Authoring that the compiler checks

Every factory is typed from the property registry, so a prop's type is by construction the type layout and paint read. `Row({ y: 'middle' })`, `Box({ width: '100%' })` and `Button({ onClick: (e: UiKeyboardEvent) => … })` are compile errors; `backgroundColor: 'primary'` completes and paints the inherited theme's primary. Components can be classes or functions, and `createComponent` is typed from either:

```ts
function Counter(props: Inputs<{ label?: string }>, ctx: ComponentContext) {
  const label = input(props.label, 'Count'); // props are cells; this one has a default
  const count = internalState(0);
  return Row(
    { gap: 8, y: 'center' },
    Text({ text: combineLatest([label, count]).pipe(map(([l, c]) => `${l}: ${c}`)) }),
    Button({ onClick: () => count.value++ }, Text({ text: '+1' }))
  );
}

createComponent(Counter, { label: 'Clicks' }); // { lable: … } is a compile error
```

The body runs once, like a class `render()`; the host keeps the cells fed when the parent's props change. JSX is optional and costs nothing — `<row gap={8}><Counter label="Clicks" /></row>` compiles to the same `createElement` / `createComponent` calls, with the same types.

### A component library

`src/components` is a library built on the runtime, in five tiers. Every control follows one contract: controlled by default with an optional `defaultX` that makes it self-managing, themed through `UiTheme`'s control tokens with no colour props of its own, keyboard operable from a keymap that is data, and emitting `role`, `label`, `value` and `states` from the day it was written.

| Tier          | Components                                                                           |
| ------------- | ------------------------------------------------------------------------------------ |
| **Inputs**    | `TextInput`, `TextArea`, `Checkbox`, `Switch`, `RadioGroup`, `Slider`, `NumberInput` |
| **Overlays**  | `Tooltip`, `Menu`, `Select`, `Dialog`, `Toast`, `FindBar`                            |
| **Structure** | `Tabs`, `Toolbar`, `SplitPane`, `Accordion`, `Card`, `Divider`                       |
| **Data**      | `LazyList`, `DataTable`, `Tree`                                                      |
| **Media**     | `Image`, `Icon`, `Spinner`, `ProgressBar`                                            |

### Semantics, without a DOM

Nodes carry `role`, `label`, `value` and `states`, or inherit them from the component that built them. The runtime diffs a semantics tree per frame and emits patches to the shell. An unknown `role` fails the build the way an unknown prop already does.

### Modifiers, animation, editing and find

- **Modifiers** extend what an element _does_ — hover and press state, focus rings, tooltips, drag, measurement — without wrapping it in a component. The analogue is Compose's `Modifier.Node` or Svelte's `use:action`.
- **Animation** is a `ticks` phase ahead of the frame that advances active cells: `animate(cell, to, { duration, easing })` and `spring(cell, to, { stiffness, damping })`, plus a declarative `transition: { opacity: 200 }` on an element. Layout animations FLIP between boxes on reorder. An idle app reports `ticks 0.00`, so the profiler stays honest. Reduced motion arrives from the shell, and everything but spinners snaps to its target under it.
- **Editing** gives `EditableText` a caret, selection, undo, IME composition and clipboard — the buffer owned by the render worker, keys and composition arriving through a hidden textarea on the main thread.
- **Find** is a controller over the retained graph, with its own bar component.

### A frame that runs as guarded, timed phases

```
ticks → patches → environment → virtualize → layout → semantics → render
```

Animations advance, channel patches land, theme and environment values propagate, lazy windows advance, dirty subtrees re-lay out from their boundaries, the semantics tree is diffed, and the renderer paints — each phase timed, each guarded so a throw is reported to the shell instead of vanishing inside a worker. `FrameMetrics` come out the other side, including `inputLatencyMs`, measured from the event's own `timeStamp` to the end of the frame that answers it.

### Two renderers, one contract

`Canvas2DRenderer` and `WebGPURenderer` implement the same `UiRenderer` interface over the same `LayoutRecord`s, `PaintState`, `layoutTextLines`, `scrollbarThumbs` and `paintOrder`. The WebGPU backend builds a single ordered command list — background, image, border, children, text, scrollbars, exactly Canvas2D's sequence — batching primitives until the scissor changes, with an SDF rounded-rect for clips and a texture cache for text. The framework picks the renderer at runtime; nothing above the renderer knows which one it got.

### Input that lives where the pixels are

Pointer, wheel, keyboard, focus, gestures and hit-testing all run in the render worker against the same retained graph and layout records, so a click resolves against the box that was actually painted. Event props are declarative (`onClick`, `onPointerDown`, …) and are reconciled with the node — a handler can never outlive its element.

### Themes without a stylesheet

`UiEnvironment` carries typed, scoped, reactive values (typography, colors, shapes, shadows) down the tree — the CompositionLocal model — and a theme change dirties exactly the nodes that read it. A motion vocabulary, `UiMotion`, sits beside `UiTheme` rather than inside it, because a theme value resolves per node and an animated cell has no node.

### Runtime services

Media, focus, animation, overlay, shell and find are plain classes with public methods and public cells, injected with `@Inject` or `ctx.inject` and registered with `useService`. They never cross a thread, and they hold non-transferable render-thread objects — an `ImageResolver`, decoded bitmaps, the focus manager, the animation driver — which is exactly why they are services and not channels.

## Proof, not promises

| Claim                                   | Evidence                                                                                                                                                                                                                      | Run it                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Layout matches Chrome                   | **239** conformance cases rendered by headless Chrome 152, every box within 0.1 px, known divergences pinned as `it.fails` so a fix reports itself instead of passing silently                                                | `pnpm test:run` · regenerate with `pnpm fixtures:layout` |
| Cost follows the change                 | Budgets: full layout once; deep text edit **< 20** nodes measured, one relayout root; scroll frame **0** measured; a row gaining a child re-lays out the row, not the root                                                    | `LayoutEngine.budget.spec.ts`                            |
| Renderers agree                         | Draw-for-draw parity spec (cards, fragments, rounded clips, images under every `objectFit`, sticky headers, nested scrollers, transforms, grids) plus a headless-Chrome pixel diff of the compare route, failing above 0.03 % | `pnpm parity:webgpu`                                     |
| A blocked shell costs frames nothing    | Measured in Chrome: the main thread busy-looped for 5000 ms with a click delivered during it reported **`Input 2818ms worst`** — the person waits — while the **worst frame gap stayed at 105 ms**, against 106 ms before     | `#framework`                                             |
| The patch stream bypasses main          | Measured in Chrome: with the shell busy-looped for 5000 ms, a channel fed from the app worker kept delivering patches throughout, and the render worker's frame gap was unchanged at 110 ms                                   | `#framework`                                             |
| Application state outlives the renderer | Switching renderer replaces the render worker — the frame count restarts — while a channel keeps counting across the swap                                                                                                     | `#framework`, renderer toggle                            |
| Data survives a reload                  | The notes example persists through `FileSystemSyncAccessHandle` in the app worker: typing a marker and reloading brings it back, and a first run with no file writes the seed                                                 | `#example-notes`                                         |
| It's tested                             | **1,715 tests** across **130 spec files**, ~5 s                                                                                                                                                                               | `pnpm test:run`                                          |

Two things are deliberately **not** claimed. The notes example holds three notes, so nothing here stresses a long list while the app worker writes; and the cost of per-key diffing on the app thread at `DataTable` scale has not been measured. Both are recorded as unmeasured in [`0030-thread-model.md`](docs/decisions/0030-thread-model.md) §9 rather than papered over.

Every claim of doneness in this project has an exit criterion observable in a browser, not just a test runner — because WebGPU cannot run in vitest at all, and a passing suite is not evidence a route renders. The input-latency measurement is the cautionary tale: the first cut stamped the event where the shell forwards it, which reads ~0 ms however blocked the shell is, because the listener only runs once the thread is free. The vitest suite was perfectly happy with it. The browser check is what found it.

## The playground

```bash
pnpm install
pnpm dev          # then open the URL Vite prints
```

One shell, switched by hash:

| Route             | What you'll see                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `#debug`          | Layout inspector over DOM boxes — hover a node, read why it's that size                         |
| `#canvas`         | Canvas2D renderer across three threads: main, data worker, render worker                        |
| `#framework`      | The component runtime in a render worker — stall the main thread, watch the heartbeat keep time |
| `#framework-sync` | The same app on the main thread, so the contrast is unmissable                                  |
| `#webgpu`         | The WebGPU renderer drawing the real framework tree                                             |
| `#compare`        | Canvas2D and WebGPU side by side with a live pixel diff                                         |
| `#benchmark`      | WebGPU throughput                                                                               |
| `#examples`       | Five small complete apps, below                                                                 |

| Example              | What it demonstrates                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `#example-signin`    | A passcode sign-in, written in JSX                                         |
| `#example-notes`     | Text editing and IME over a channel, persisted to OPFS from the app worker |
| `#example-theme`     | Theming through the environment                                            |
| `#example-live`      | A live feed bound straight to the canvas                                   |
| `#example-animation` | A board that moves, and an idle app that does not                          |

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

### Where things live

| Path                    | What it is                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/graph`          | Retained `UiNode` graph, dirty flags, dirty-node sets                                                                                             |
| `src/ui/composition`    | `Row`, `Column`, `Stack`, `Grid`, `Text`, `Button`, `ScrollView`, `LazyColumn`/`LazyRow`; the `UiGraphBuilder` that turns elements into mutations |
| `src/ui/bindings`       | RxJS → graph: property, children and event bindings                                                                                               |
| `src/ui/layout`         | `LayoutEngine`, `ParagraphLayout`, `GridLayout`, `LayoutExplanation`, typed lengths, `conformance/` fixtures                                      |
| `src/ui/scheduler`      | Frame clock, frame phases, scheduler                                                                                                              |
| `src/ui/rendering`      | `UiRenderer` contract, `PaintState`, `TextRenderer`, `LayoutInspector`, `canvas2d/`, `webgpu/`                                                    |
| `src/ui/input`          | Hit tester, pointer/wheel/keyboard controllers, focus manager, gesture recognizer, platform adapter                                               |
| `src/ui/editing`        | The editable text buffer, caret and undo                                                                                                          |
| `src/ui/selection`      | Selection across text runs                                                                                                                        |
| `src/ui/animation`      | Tween and spring drivers, the tick phase, `UiMotion`                                                                                              |
| `src/ui/modifiers`      | The modifier mechanism and the core modifiers                                                                                                     |
| `src/ui/semantics`      | The semantics tree and its per-frame diff                                                                                                         |
| `src/ui/find`           | Find controller over the retained graph                                                                                                           |
| `src/ui/properties`     | The property registry — every layout/paint/input property with its dirty flags; unknown props throw                                               |
| `src/ui/environment`    | Theme, typography, colors, shapes, shadows; scoped reactive environment keys                                                                      |
| `src/framework`         | `Component`, decorators, `internalState`/`input`, `createApp`/`renderRoot`/`GessoRuntime`                                                         |
| `src/framework/channel` | `channel()` tokens, `provide`, `serveChannels`, `ChannelReplica`, the structural differ and the patch protocol                                    |
| `src/framework/service` | The service registry behind `useService` and `@Inject`                                                                                            |
| `src/framework/worker`  | The port handshake and transport; one worker can host many channels                                                                               |
| `src/components`        | The component library — five tiers, one contract                                                                                                  |
| `src/playground`        | The demo harness — the routes and one shell. Not the framework.                                                                                   |
| `scripts/`              | `gen-layout-fixtures.ts` (Chrome → `expected.json`), `check-webgpu-parity.ts` (Chrome pixel diff over the DevTools protocol)                      |
| `docs/`                 | The design doc, the roadmaps, and the decision records                                                                                            |

## Scripts

```bash
pnpm dev               # Vite dev server with the playground
pnpm build             # tsc + vite build
pnpm preview           # serve the production build
pnpm test              # vitest, watch mode
pnpm test:run          # vitest, once
pnpm lint              # oxlint
pnpm format            # oxfmt
pnpm fixtures:layout   # re-render conformance cases in headless Chrome → expected.json
pnpm parity:webgpu     # Canvas2D vs WebGPU pixel diff in headless Chrome (needs a WebGPU adapter)
```

Both Chrome-driven scripts run under plain Node ≥ 22 with no browser-automation dependency: `--dump-dom` for fixtures, the DevTools protocol over Node's built-in `WebSocket` for parity. Set `CHROME_BIN` to choose the binary.

## Reading list

The decision records are the real documentation. Each one states the problem, the decision, and what it cost.

|                                                            |                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [0002](docs/decisions/0002-complexity.md)                  | Complexity analysis — why the passes stay O(N) and incremental stays O(D · depth) |
| [0003](docs/decisions/0003-canvas2d-renderer.md)           | Canvas2D renderer — traverse `UiNode` directly, no intermediate render tree       |
| [0004](docs/decisions/0004-layout-conformance.md)          | Conformance against Chrome — cases once, translated two ways                      |
| [0005](docs/decisions/0005-text-layout.md)                 | Text as a layout citizen — one paragraph algorithm, two-pass flex                 |
| [0006](docs/decisions/0006-positioning-overlays.md)        | Positioning and overlays — containing blocks, aligned stacks, anchored placement  |
| [0007](docs/decisions/0007-flex-completeness.md)           | Flex completeness — the defaults we'd skipped, and CSS §9.7                       |
| [0008](docs/decisions/0008-overflow-scrolling.md)          | Overflow, clipping and scrolling — on any container                               |
| [0009](docs/decisions/0009-virtualization.md)              | Virtualization — a window that emits children                                     |
| [0010](docs/decisions/0010-grid.md)                        | Grid — typed tracks, the algorithm apart from the nodes                           |
| [0011](docs/decisions/0011-relayout-boundaries.md)         | Relayout boundaries and budgets — parents decide                                  |
| [0012](docs/decisions/0012-explainability.md)              | Explainability — `explain()` reads, it does not recompute                         |
| [0013](docs/decisions/0013-webgpu-parity.md)               | WebGPU parity — one ordered command list, a pluggable renderer                    |
| [0014](docs/decisions/0014-typed-authoring.md)             | Typed authoring — types derived from the registry, functional components, JSX     |
| [0015](docs/decisions/0015-font-resolution.md)             | Font resolution — layout and paint resolve the font the same way                  |
| [0016](docs/decisions/0016-cursor.md)                      | Cursor — the runtime decides, the shell shows                                     |
| [0017](docs/decisions/0017-text-editing.md)                | Text editing — worker-owned buffer, main-thread editing proxy                     |
| [0018](docs/decisions/0018-text-selection.md)              | Text selection across runs                                                        |
| [0019](docs/decisions/0019-find.md)                        | Find — a controller over the retained graph                                       |
| [0020](docs/decisions/0020-focus-scopes.md)                | Focus scopes and traps                                                            |
| [0021](docs/decisions/0021-semantics.md)                   | Semantics — roles and states on nodes, diffed per frame                           |
| [0022](docs/decisions/0022-modifiers.md)                   | Modifiers — element behaviour without wrapper components                          |
| [0023](docs/decisions/0023-inputs-tier.md)                 | The Inputs tier — the control contract                                            |
| [0024](docs/decisions/0024-overlays-tier.md)               | The Overlays tier — dialogs, menus, anchored placement                            |
| [0025](docs/decisions/0025-structure-tier.md)              | The Structure tier, and the layout notifier                                       |
| [0026](docs/decisions/0026-data-tier.md)                   | The Data tier, and the two engine deferrals it was holding                        |
| [0027](docs/decisions/0027-decorations-and-focus-rings.md) | Decoration shapes, and the focus ring                                             |
| [0028](docs/decisions/0028-media-tier.md)                  | The Media tier — an image resolver that cannot leave the render thread            |
| [0029](docs/decisions/0029-animation.md)                   | Animation, and how an idle app stays idle                                         |
| [0030](docs/decisions/0030-thread-model.md)                | Three threads and a declared barrier                                              |

Then [`FRAMEWORK_DESIGN.md`](docs/FRAMEWORK_DESIGN.md) for the component model and the thread architecture.

## Status & license

Gesso is an active research project — a serious attempt at building a small, deterministic UI runtime from first principles and writing down every trade along the way. The runtime is functional and heavily tested; the API will move.

Private and unlicensed.
