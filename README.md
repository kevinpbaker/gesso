# Nodal

Nodal is an experimental, retained-mode UI framework written in TypeScript. It renders a reactive node tree with an incremental layout engine and a pluggable renderer backend (Canvas2D today, WebGPU in progress).

The project is a research playground for building a small, deterministic, and performant UI runtime from first principles: a retained graph, RxJS bindings, dirty-flagged incremental layout, a frame scheduler, and immediate-mode rendering without relying on the browser's DOM for layout or composition.

## Project status

This is an active experiment. The core runtime is functional and covered by tests; the Canvas2D renderer is the primary backend. A WebGPU backend exists but is not yet complete. See [`docs/decisions/`](docs/decisions/) for architectural notes.

## Tech stack

- **TypeScript** (ES2023, ES modules)
- **Vite** for dev server, build, and preview
- **Vitest** for unit tests
- **RxJS** for reactive bindings
- **oxlint** and **oxfmt** for linting and formatting
- **Canvas2D / WebGPU** for rendering

## Getting started

Install dependencies:

```bash
pnpm install
```

Start the dev server:

```bash
pnpm dev
```

Open the URL Vite prints (usually `http://localhost:5173`). The default view is the debug/layout playground. Use URL hashes to switch between demos:

| Route | Description |
|-------|-------------|
| `#debug` | Layout and rendering debug playground |
| `#canvas` | Canvas2D renderer playground |
| `#webgpu` | WebGPU renderer playground |
| `#compare` | Side-by-side renderer comparison |
| `#benchmark` | WebGPU benchmark |
| `#binding` | Reactive binding demo |
| `#theme` | Theme system playground |

## Build and test

```bash
# Type-check and build for production
pnpm build

# Preview the production build
pnpm preview

# Run tests in watch mode
pnpm test

# Run tests once
pnpm test:run

# Lint
pnpm lint

# Format code
pnpm format

# Check formatting
pnpm format:check
```

## Architecture overview

```text
┌─────────────────────────────────────────┐
│  Application state + RxJS bindings      │
├─────────────────────────────────────────┤
│  Retained UiNode tree                   │
├─────────────────────────────────────────┤
│  Incremental layout engine              │
│  (measure → place → scroll projection)  │
├─────────────────────────────────────────┤
│  Frame scheduler + dirty pipeline       │
├─────────────────────────────────────────┤
│  Pluggable renderer                     │
│  (Canvas2D / WebGPU)                    │
└─────────────────────────────────────────┘
```

### Core modules

| Module | Purpose |
|--------|---------|
| `src/ui/graph` | Retained `UiNode` graph and tree structure |
| `src/ui/composition` | Node composition helpers |
| `src/ui/bindings` | RxJS-based reactive bindings between state and nodes |
| `src/ui/layout` | Incremental box layout: measure, place, and scroll projection |
| `src/ui/scheduler` | Frame scheduler and dirty-flag dispatch |
| `src/ui/rendering` | Renderer interface, Canvas2D backend, and WebGPU backend |
| `src/ui/input` | Pointer, wheel, keyboard, focus, gesture, and hit-testing |
| `src/ui/properties` | Resolved visual properties (colors, radii, transforms, text styles, shadows) |
| `src/ui/environment` | Theme and environment values (typography, colors, shapes) |
| `src/playground` | Interactive demos and debug views |

### Key design decisions

- **No DOM layout.** The framework owns layout, scrolling, transforms, and rendering. The DOM is only used as a host element for the canvas.
- **Incremental layout.** Only dirty subtrees are re-measured and re-placed; scroll changes run in O(number of scroll containers).
- **Renderer-agnostic core.** The layout engine outputs `LayoutRecord`s consumed through a narrow `LayoutReader` interface. Both Canvas2D and WebGPU implement the same `UiRenderer` contract.
- **Full Canvas2D redraw.** The current renderer redraws the whole scene each frame; dirty regions are a future optimization. Bounds culling already skips off-screen subtrees.
- **Logical pixels everywhere.** The `CanvasSurface` handles device pixel ratio; layout and drawing operate in logical pixels.

See [`docs/decisions/0002-complexity.md`](docs/decisions/0002-complexity.md) and [`docs/decisions/0003-canvas2d-renderer.md`](docs/decisions/0003-canvas2d-renderer.md) for more detail.

## Scripts

| Script | Command |
|--------|---------|
| `dev` | `vite` |
| `build` | `tsc && vite build` |
| `preview` | `vite preview` |
| `test` | `vitest` |
| `test:run` | `vitest run` |
| `lint` | `oxlint` |
| `lint:fix` | `oxlint --fix` |
| `format` | `oxfmt` |
| `format:check` | `oxfmt --check` |

## License

This project is private and unlicensed.
