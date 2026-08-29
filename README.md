<div align="center">

# Nodal

**A retained-mode UI framework that draws your app on a canvas, lays it out like Chrome, and never lets the main thread touch it.**

TypeScript · RxJS · Canvas2D & WebGPU · zero DOM layout · zero runtime dependencies beyond `rxjs`

[Why](#why-nodal) · [Sixty seconds](#sixty-seconds) · [What's inside](#whats-inside) · [Proof](#proof-not-promises) · [Playground](#the-playground) · [Architecture](#architecture) · [Roadmap](#where-its-going)

</div>

---

## Why Nodal

Every web UI framework is, in the end, a clever way to ask the DOM to do layout. The DOM is a fine document renderer and a mediocre application runtime: layout is opaque, styling is a global namespace, and every millisecond of your business logic competes with paint for the one thread that matters.

Nodal starts from the other end. It owns the whole stack — component model, retained scene graph, layout, input, rasterization — and treats the browser as a place to put a canvas and a source of raw pointer events. The consequences are the point:

- **The UI thread does nothing but UI.** Components, layout, hit-testing and painting run in a render worker. Application state runs in data workers. The main thread forwards events and owns nothing. A 1.5 s CPU burn in a store does not cost the animation next to it a single frame — that's a demo route, not a slide.
- **Layout you can trust, because Chrome checked it.** Nodal borrows CSS's vocabulary (`flexGrow`, `gap`, `padding`, `position: 'absolute'`, `fr(1)`), so it must borrow CSS's answers. 239 layout cases are rendered by headless Chrome, and the engine is asserted to match every box within 0.1 px.
- **Layout you can interrogate.** `engine.explain(node)` tells you _why_ a box is the size it is — `flex`, `stretch`, `content`, `min`, `aspect-ratio` — in sentences, in the order the rules applied. A hover inspector paints margin/padding/content boxes and a heatmap of what the last frame actually re-measured. Misspell a prop and the graph builder throws instead of silently ignoring it.
- **Cost follows the change, not the tree.** A text edit deep in a 10k-node page re-measures fewer than 20 nodes. A scroll frame re-measures zero. These are CI budgets, not aspirations.
- **Two renderers, one truth.** Canvas2D and WebGPU consume the same `LayoutRecord`s through the same `UiRenderer` contract, are checked draw-for-draw in tests, and pixel-diffed against each other in headless Chrome.

Nodal is an experiment, and an honest one: every design decision is written down in [`docs/decisions/`](docs/decisions/) with the problem it solved and the trade it made.

## Sixty seconds

```ts
// app.worker.ts — everything the user sees is built here, off the main thread
import { map } from 'rxjs';
import { Column, Row, Text, Button } from './ui/composition';
import { Component, Define, Inject, State, Action, Projection, Store, state, renderRoot } from './framework';

export class CounterStore extends Store {
  @State() clicks = state(0);

  @Projection()
  get summary() {
    return { clicks: this.clicks.value, parity: this.clicks.value % 2 ? 'odd' : 'even' };
  }

  @Action()
  increment(): void {
    this.clicks.value++;
  }
}

@Define('app-root')
export class AppRoot extends Component {
  @Inject(CounterStore) counter!: CounterStore;

  render() {
    return Column(
      { gap: 12, padding: 24 },
      Text({
        text: this.counter.projection.summary.pipe(map(s => `${s.clicks} clicks (${s.parity})`)),
        fontSize: 18
      }),
      Row(
        { gap: 8 },
        Button(
          {
            onClick: () => this.counter.dispatch('increment'),
            padding: 8,
            borderRadius: 6,
            backgroundColor: '#1f6feb'
          },
          Text({ text: 'Add one', color: '#fff' })
        )
      )
    );
  }
}

renderRoot(AppRoot).useStore(CounterStore);
```

```ts
// main.ts — the main thread's entire job
import { createApp } from './framework';

createApp({ worker: () => new Worker(new URL('./app.worker.ts', import.meta.url), { type: 'module' }) }).mount('#app');
```

Notice what isn't there. No re-render pass: `render()` runs **once**, and the `Observable` in `text:` is bound straight into the retained graph. No virtual DOM diff: component identity _is_ node identity, so there is no second reconciler. No `useEffect`. No CSS. And nothing above runs on the thread that handles your clicks.

Need the store on yet another thread? One line:

```ts
renderRoot(AppRoot).useStore(CounterStore, {
  worker: () => new Worker(new URL('./counter.worker.ts', import.meta.url), { type: 'module' })
});
// counter.worker.ts:  exposeStore(CounterStore);
```

Projections become the wire format — diffed structurally, shipped as patches — and components inject a replica with the same API and none of the work.

## What's inside

### A layout engine that finished the job

Most canvas UI kits ship flexbox-ish. Nodal shipped the CSS you actually reach for, and had Chrome grade the homework.

| Capability                   | The short version                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flexbox, complete**        | `stretch` by default, automatic minimum size, CSS §9.7 freeze-and-redistribute, `flexWrap` + `alignContent`, reverse directions, RTL, `margin: auto`, `flex: n`, `aspectRatio`, `percent(50)`.                                                                                                                                      |
| **Text as a layout citizen** | One paragraph algorithm shared by the engine and both renderers. `textWrap: 'word' \| 'char' \| 'none'`, `maxLines`, `textOverflow: 'ellipsis'`, hanging spaces, fit-content width, real baselines (`y: 'baseline'`). Flex measures items twice — max-content, then final — like the spec says.                                     |
| **Grid**                     | `Grid({ columns: [auto, fr(1)] })`. Tracks are typed: `px`, `percent()`, `auto`, `fr()`, `minmax()`, `repeat()`. Explicit lines and spans, sparse auto-flow, per-cell alignment, `justifyContent`/`alignContent` track distribution. CSS Grid §8.5 and §11, implemented apart from any node so it can be tested as pure arithmetic. |
| **Positioning & overlays**   | `position: 'absolute' \| 'relative' \| 'sticky'`, `inset`, `zIndex` paint order, aligned `Stack`s. Anchored placement (`anchor`, `placement: 'bottom-start'`) that flips and shifts to stay on screen. Every runtime mounts an `OverlayLayer`; menus, popovers and dialogs go through the `OverlayStore`.                           |
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
  const count = state(0);
  const store = ctx.inject(CounterStore);
  return Row(
    { gap: 8, y: 'center' },
    Text({ text: combineLatest([label, count]).pipe(map(([l, c]) => `${l}: ${c}`)) }),
    Button({ onClick: () => count.value++ }, Text({ text: '+1' }))
  );
}

createComponent(Counter, { label: 'Clicks' }); // { lable: … } is a compile error
```

The body runs once, like a class `render()`; the host keeps the cells fed when the parent's props change. JSX is optional and costs nothing — `<row gap={8}><Counter label="Clicks" /></row>` compiles to the same `createElement` / `createComponent` calls, with the same types.

### A frame that runs as guarded, timed phases

```
patches  →  environment  →  virtualize  →  layout  →  render
```

Store patches land, theme/environment values propagate, lazy windows advance, dirty subtrees re-lay out from their boundaries, and the renderer paints — each phase timed, each guarded so a throw is reported to the shell instead of vanishing inside a worker. `FrameMetrics` come out the other side for the playground's status bar.

### Two renderers, one contract

`Canvas2DRenderer` and `WebGPURenderer` implement the same `UiRenderer` interface over the same `LayoutRecord`s, `PaintState`, `layoutTextLines`, `scrollbarThumbs` and `paintOrder`. The WebGPU backend builds a single ordered command list — background, image, border, children, text, scrollbars, exactly Canvas2D's sequence — batching primitives until the scissor changes, with an SDF rounded-rect for clips and a texture cache for text. The framework picks the renderer at runtime; nothing above the renderer knows which one it got.

### Input that lives where the pixels are

Pointer, wheel, keyboard, focus, gestures and hit-testing all run in the render worker against the same retained graph and layout records, so a click resolves against the box that was actually painted. Event props are declarative (`onClick`, `onPointerDown`, …) and are reconciled with the node — a handler can never outlive its element.

### Themes without a stylesheet

`UiEnvironment` carries typed, scoped, reactive values (typography, colors, shapes, shadows) down the tree — the CompositionLocal model — and a theme change dirties exactly the nodes that read it.

## Proof, not promises

| Claim                    | Evidence                                                                                                                                                                                                                      | Run it                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Layout matches Chrome    | **239** conformance cases rendered by headless Chrome 152, every box within 0.1 px, **one** pinned divergence with a note that must be deleted when it's fixed                                                                | `pnpm test:run` · regenerate with `pnpm fixtures:layout` |
| Cost follows the change  | Budgets: full layout once; deep text edit **< 20** nodes measured, one relayout root; scroll frame **0** measured; row gaining a child re-lays out the row, not the root                                                      | `LayoutEngine.budget.spec.ts`                            |
| Renderers agree          | Draw-for-draw parity spec (cards, fragments, rounded clips, images under every `objectFit`, sticky headers, nested scrollers, transforms, grids) plus a headless-Chrome pixel diff of the compare route, failing above 0.03 % | `pnpm parity:webgpu`                                     |
| The thread model is real | A 2000 ms main-thread stall costs the worker route nothing; a 1500 ms store action in a data worker costs the render worker nothing — both visible as a heartbeat that keeps beating                                          | `#framework` vs `#framework-sync`                        |
| It's tested              | **1,245 tests** across **85 spec files**, ~3.5 s                                                                                                                                                                              | `pnpm test:run`                                          |

Every "done" in the roadmap has an exit criterion observable in a browser, not just a test runner — because WebGPU cannot run in vitest at all, and a passing suite is not evidence a route renders.

## The playground

```bash
pnpm install
pnpm dev          # then open the URL Vite prints
```

One shell, eight routes, switched by hash:

| Route             | What you'll see                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `#debug`          | Layout inspector over DOM boxes — hover a node, read why it's that size                         |
| `#canvas`         | Canvas2D renderer across **three threads**: main, data worker, render worker                    |
| `#framework`      | The component runtime in a render worker — stall the main thread, watch the heartbeat keep time |
| `#framework-sync` | Same app on the main thread, so the contrast is unmissable                                      |
| `#webgpu`         | The WebGPU renderer drawing the real framework tree                                             |
| `#compare`        | Canvas2D and WebGPU side by side with a live pixel diff                                         |
| `#benchmark`      | WebGPU throughput                                                                               |
| `#examples`       | Small complete apps: a passcode sign-in, a notes app, a theming pane, a live feed               |

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  main thread            forwards input · owns the <canvas> · nothing else    │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ input events ↓                        ↑ frame metrics, errors
┌───────────────▼──────────────────────────────────────────────────────────────┐
│  render worker                                                               │
│                                                                              │
│   Components (@Define / @Input / @Inject / @State)  ── render() once ──┐     │
│   Stores (@State / @Action / @Projection)  ── observables ──┐          │     │
│                                                             ▼          ▼     │
│   Retained UiGraph  ◄── UiGraphBuilder reconciles keyed children, props,     │
│        │                bindings, event handlers, component hosts            │
│        ▼                                                                     │
│   LayoutEngine   measure → place → scroll projection, from relayout          │
│        │         boundaries; explain(); budgets                              │
│        ▼                                                                     │
│   UiRenderer     Canvas2DRenderer │ WebGPURenderer  → OffscreenCanvas        │
│   Input          hit-test · pointer · wheel · keyboard · focus · gestures    │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ actions ↓                                   ↑ projection patches
┌───────────────▼──────────────────────────────────────────────────────────────┐
│  data workers           exposeStore(HeavyStore) — business logic lives here  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Single-thread mode exists too — `createApp(AppRoot).useStore(X).mountSync('#app')` — for tests, headless rendering, and environments without `OffscreenCanvas`. Same code, same components.

### Where things live

| Path                 | What it is                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/ui/graph`       | Retained `UiNode` graph, dirty flags, dirty-node sets                                                                                                        |
| `src/ui/composition` | `Row`, `Column`, `Stack`, `Grid`, `Text`, `Button`, `ScrollView`, `LazyColumn`/`LazyRow`; the `UiGraphBuilder` that turns element trees into graph mutations |
| `src/ui/bindings`    | RxJS → graph: property, children and event bindings                                                                                                          |
| `src/ui/layout`      | `LayoutEngine`, `ParagraphLayout`, `GridLayout`, `LayoutExplanation`, typed lengths, `conformance/` fixtures                                                 |
| `src/ui/scheduler`   | Frame clock, frame phases, scheduler                                                                                                                         |
| `src/ui/rendering`   | `UiRenderer` contract, `PaintState`, `TextRenderer`, `LayoutInspector`, `canvas2d/`, `webgpu/`                                                               |
| `src/ui/input`       | Hit tester, pointer/wheel/keyboard controllers, focus manager, gesture recognizer, platform adapter                                                          |
| `src/ui/properties`  | The property registry — every layout/paint/input property with its dirty flags; unknown props throw                                                          |
| `src/ui/environment` | Theme, typography, colors, shapes, shadows; scoped reactive environment keys                                                                                 |
| `src/framework`      | `Component`, decorators, `Store`, replication (`exposeStore`/`attachStore`/patches), `OverlayStore`, `createApp`/`renderRoot`/`NodalRuntime`                 |
| `src/playground`     | The demo harness — eight routes and one shell. Not the framework.                                                                                            |
| `scripts/`           | `gen-layout-fixtures.ts` (Chrome → `expected.json`), `check-webgpu-parity.ts` (Chrome pixel diff over DevTools protocol)                                     |
| `docs/`              | Design doc, roadmaps, and thirteen decision records                                                                                                          |

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

|                                                     |                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| [0002](docs/decisions/0002-complexity.md)           | Complexity analysis — why the passes stay O(N) and incremental stays O(D · depth) |
| [0003](docs/decisions/0003-canvas2d-renderer.md)    | Canvas2D renderer — traverse `UiNode` directly, no intermediate render tree       |
| [0004](docs/decisions/0004-layout-conformance.md)   | Conformance against Chrome — cases once, translated two ways                      |
| [0005](docs/decisions/0005-text-layout.md)          | Text as a layout citizen — one paragraph algorithm, two-pass flex                 |
| [0006](docs/decisions/0006-positioning-overlays.md) | Positioning and overlays — containing blocks, aligned stacks, anchored placement  |
| [0007](docs/decisions/0007-flex-completeness.md)    | Flex completeness — the defaults we'd skipped, and CSS §9.7                       |
| [0008](docs/decisions/0008-overflow-scrolling.md)   | Overflow, clipping and scrolling — on any container                               |
| [0009](docs/decisions/0009-virtualization.md)       | Virtualization — a window that emits children                                     |
| [0010](docs/decisions/0010-grid.md)                 | Grid — typed tracks, the algorithm apart from the nodes                           |
| [0011](docs/decisions/0011-relayout-boundaries.md)  | Relayout boundaries and budgets — parents decide                                  |
| [0012](docs/decisions/0012-explainability.md)       | Explainability — `explain()` reads, it does not recompute                         |
| [0013](docs/decisions/0013-webgpu-parity.md)        | WebGPU parity — one ordered command list, a pluggable renderer                    |
| [0014](docs/decisions/0014-typed-authoring.md)      | Typed authoring — types derived from the registry, functional components, JSX     |
| [0015](docs/decisions/0015-font-resolution.md)      | Font resolution — layout and paint resolve the font the same way                  |
| [0016](docs/decisions/0016-cursor.md)               | Cursor — the runtime decides, the shell shows                                     |
| [0017](docs/decisions/0017-text-editing.md)         | Text editing — worker-owned buffer, main-thread editing proxy                     |

Then [`FRAMEWORK_DESIGN.md`](docs/FRAMEWORK_DESIGN.md) for the component model and thread architecture, and the roadmaps below.

## Where it's going

Layout (L0–L8) and WebGPU parity are done. What's honestly missing, in the order [`ROADMAP.md`](docs/ROADMAP.md) intends to tackle it:

- ~~**F1 Typed authoring**~~ — done: element props are derived from the property registry, functional components and optional JSX ([0014](docs/decisions/0014-typed-authoring.md)).
- ~~**F2 Editing**~~ — done in Chrome: `EditableText` with caret, selection, undo, IME composition and clipboard, edited in the render worker through a hidden textarea on the main thread ([0017](docs/decisions/0017-text-editing.md)). WKWebView and WebView2 wait on E2.
- **F3 Component library**, **F4 Animation**, **F5 Routing**, **F6 Accessibility** (a no-DOM canvas needs a semantics tree).
- **F9 Rendering maturity** — glyph atlas, dirty regions, gradients, `boxShadow` (resolved into `PaintState`, painted by nobody yet).
- **[Modifiers](docs/MODIFIERS_ROADMAP.md)** — Compose-style element behaviour (`hoverable`, `focusRing`, `tooltip`, `draggable`) without wrapper components.
- **E1–E4** — an Electrobun adapter and a reference desktop application as the forcing function.

## Status & license

Nodal is an active research project — a serious attempt at building a small, deterministic UI runtime from first principles and writing down every trade along the way. The runtime is functional and heavily tested; the API will move.

Private and unlicensed.
