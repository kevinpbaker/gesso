# @gesso/core

The engine under a Gesso application: the retained UI graph, the layout engine, the two renderers, input, text and theming. Everything below a component.

You do not usually install this directly. [`@gesso/framework`](https://github.com/kevinpbaker/gesso/tree/main/packages/framework) depends on it and re-exports what an application author needs. Reach for `@gesso/core` when you are writing a modifier, a custom layout, or anything else that works against elements rather than components.

```bash
npm install @gesso/core rxjs
```

## What is in it

| Area          | What it owns                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Graph**     | The retained node tree, typed properties, and the dirty flags a change raises                                         |
| **Layout**    | Flexbox in full, CSS Grid with typed tracks, absolute, relative and sticky positioning, overflow                      |
| **Text**      | One paragraph algorithm shared by the engine and both renderers: wrapping, `maxLines`, ellipsis, real baselines, bidi |
| **Rendering** | `Canvas2DRenderer` and `WebGPURenderer` behind one `UiRenderer` interface                                             |
| **Input**     | Pointer, wheel, keyboard, focus, gestures and hit-testing against the painted boxes                                   |
| **Theming**   | `UiEnvironment`: typed, scoped, reactive values that dirty exactly the nodes reading them                             |

Layout borrows CSS's vocabulary, so it borrows CSS's answers. Every layout conformance case is rendered by headless Chrome and the engine is asserted against it within 0.1 px.

## Asking why

A box is never a mystery:

```ts
engine.explain(node);
// constraints received, sizes measured, and a per-axis `decidedBy`
// in sentences, in the order the rules applied
```

## Entry points

- `@gesso/core` -- the engine
- `@gesso/core/testing` -- the canvas doubles its own suite uses

## Documentation

[Layout](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/layout/flex.md) | [Text](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/guide/text.md) | [Canvas2D and WebGPU](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/rendering/canvas2d-and-webgpu.md) | [Asking the engine why](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/layout/explain.md)

MIT (c) Kevin Baker
