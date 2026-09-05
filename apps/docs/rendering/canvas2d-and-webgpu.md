---
description: 'The two rendering backends: how an application picks one, what they share, where they differ, and what parity is checked against.'
---

# Canvas2D and WebGPU

Gesso paints through one of two backends. An app that says nothing gets
`'auto'`: WebGPU where the engine offers it, Canvas2D where it does not.
Canvas2D runs wherever a canvas does, which is everywhere, and is still
there to be asked for by name.

Which one drew is an implementation detail of a frame, not of your code.
Elements, layout, text, input, themes and components are the same either
way, and nothing in `@gesso/components` asks which backend it is on.

## Choosing one

The backend is a host option, set once where the app is created. In the
worker configuration it travels to the render worker in the `init`
message; `renderRoot` does not choose:

```ts
// main.ts
createApp({
  renderWorker: () => new Worker(new URL('./app.render.worker.ts', import.meta.url), { type: 'module' }),
  renderer: 'canvas2d'
}).mount('#app');
```

Single-thread, the builder carries the same choice:

```ts
createApp(AppRoot).renderer('canvas2d').mountSync('#app');
```

| Value        | What happens                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `'auto'`     | The default. WebGPU where the engine has it, Canvas2D where it does not, decided without a word from you. |
| `'canvas2d'` | Draws immediately, on the app's canvas, with no adapter to ask for.                                       |
| `'webgpu'`   | Asks for an adapter and a device. Falls back to Canvas2D when it cannot have them, and logs that it did.  |

`'webgpu'` and `'auto'` differ in two things. `'webgpu'` asks for an
adapter even on an engine with no WebGPU at all, so that it can tell
you it did not get one; `'auto'` looks first and does not ask. Name
`'webgpu'` while developing against the GPU path, when a missing
adapter is a surprise you want to hear about.

That first difference is what keeps the default cheap where it cannot
pay off. `'auto'` checks for the WebGPU entry point synchronously, as
the app is built, so an engine that never shipped it is on Canvas2D
from the first frame with nothing skipped and nothing to unwind. Only
an engine that has the entry point goes on to ask for a device.

Asking for a device is asynchronous, so on that path the first frames
have nothing to draw with and are skipped. When the device arrives, the
surface is resized to the size the canvas already had and a repaint is
requested, so the first painted frame is the right size. A device lost
later falls back to Canvas2D on the next frame, on the same canvas: the
WebGPU path never takes the 2D context, which is what leaves it free.

## Knowing which one drew

Silent fallback means a broken GPU path can look like a working
Canvas2D one, so the backend is reported rather than assumed.

Every frame carries it. `renderer` is `'pending'` until the device
resolves, then the backend that painted:

```ts
createApp({
  renderWorker: () => new Worker(new URL('./app.render.worker.ts', import.meta.url), { type: 'module' }),
  onFrame: metrics => console.log(metrics.renderer, metrics.gpu)
}).mount('#app');
```

`metrics.gpu` splits the render phase into building the render list,
uploading buffers, and encoding and submitting. It is `null` when
Canvas2D drew, which is a second way of reading the same fact. The
[frame profiler](/tooling/frames-and-phases) shows `render` as one band
and does not break the GPU stages out.

Two smaller signals: the single-thread `GessoApp` exposes a
`rendererReady` promise that resolves with the backend that won, and GPU
validation failures and device loss reach `onError` with a source of
`renderer`, which is what stops them vanishing inside the worker.

## Where each backend runs

- **Canvas2D runs everywhere**, in a worker on an `OffscreenCanvas` and
  on the main thread, in every browser and all three system webviews.
- **WebGPU is dependable on Chromium**: Chrome and its relatives,
  WebView2, and CEF. WKWebView does not enable it by default and
  WebKitGTK does not ship it, so a desktop app targeting macOS and Linux
  system webviews cannot count on it.
- **WebGPU in a worker, on a transferred `OffscreenCanvas`**, is solid on
  Chromium and WebView2 and absent elsewhere.

That is the shape `'auto'` is built around. An application must never
fail to paint because a webview lacks WebGPU, and under `'auto'` it
cannot: the engines in the second and third bullets take the Canvas2D
branch before a device is ever requested.

## What is identical by construction

The two backends are not two renderers so much as two traversals with
one input. Everything that decides where a thing goes and what colour it
is happens before either of them:

- **One tree and one layout pass.** Both read the same `LayoutRecord`s.
  A box is computed once, whatever draws it.
- **One `PaintState`.** Colours, radii, borders, opacity, images and
  gradients are resolved from the node's props and theme in shared code,
  not per backend.
- **One measurer, and one paragraph layout.** Line breaking, `maxLines`,
  ellipsis and baselines come from the same `layoutParagraph` for layout,
  for both renderers and for the editing caret. WebGPU measures on a
  separate 1x1 `OffscreenCanvas`, because a canvas holds one context, but
  it is the same measurer, which is what keeps line breaks identical.
- **One gradient placement.** `gradientPaint` maps a gradient's line or
  circle into the box and clamps its stops; Canvas2D adds the box origin
  and hands the result to `createLinearGradient`, WebGPU puts the same
  numbers in a storage buffer. Neither backend decides where the ramp
  runs.
- **One geometry for the parts an application does not draw itself**:
  scrollbar thumbs, `objectFit` rectangles, the focus and decoration
  shapes modifiers produce, and the inspector overlay.
- **One paint order**: background, image, border, decorations, children,
  the node's own text, then the decorations marked to come after
  children, then its scrollbars.
- **One clipping rule.** A node's own background, image, border and
  scrollbars are painted outside its clip; its children and its own text
  are clipped by it. Rounded clipping applies on both, including a
  rounded box inside another. Borders sit inside the box, as CSS draws
  them. Images clip to their box under `cover` and `none`.

The consequence is where parity bugs live: the only place the two
diverge is the traversal that turns records into draws, so a difference
between them is a bug in that traversal rather than a difference of
capability.

## Where they differ

| What               | Canvas2D                                                  | WebGPU                                                                                                                                                |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Glyphs             | `fillText` per line, through the browser's own text stack | Clusters rasterised into a shared atlas, one instanced quad each, consecutive glyphs sharing a page drawn in one call                                 |
| Ligatures          | Formed by the font                                        | Not formed: clusters are drawn one at a time at prefix widths, so `fi` is an f and an i at the positions the ligature would have taken                |
| Sub-pixel text     | Whatever the platform does                                | Three phases per glyph baked into the atlas, and a run's origin snapped to a physical pixel, so spacing error stays under a third of a physical pixel |
| Text anti-aliasing | Drawn straight into the target                            | Sampled from a texture, so glyph edges never match at the sub-pixel level                                                                             |
| Start-up           | Immediate                                                 | Asynchronous: an adapter and a device, with frames before them skipped                                                                                |
| Failure            | Nothing to lose                                           | A device can be lost, and the runtime falls back on the next frame                                                                                    |
| Stage timings      | None: `render` is one number                              | `FrameMetrics.gpu` splits prepare, upload and encode                                                                                                  |

Two things are the same on both and are worth stating because a reader
looking for a difference will otherwise assume one:

- **Neither paints `boxShadows`.** The prop resolves into `PaintState`
  and nothing draws it. Use a border, a background, or a decoration.
- **Neither redraws partially.** Both clear and redraw the whole scene
  every frame, and both cull subtrees outside the visible region first,
  so cost follows what is on screen rather than what exists.

## What parity means, and how it is checked

Parity here is a specific claim: the same tree, laid out once, produces
the same draws in the same order on both backends, with the same boxes,
colours, opacities, radii, border widths and clips. Text positions are
compared to within half a pixel, because the WebGPU path snaps a run's
origin to a physical pixel and Canvas2D does not. Everything else has to
match exactly.

Two checks stand behind it, because the two failure modes are different.

**Draw-set parity, in vitest.** `RendererParity.spec` runs fourteen
trees through both paths, decodes the Canvas2D call log and the WebGPU
render list into the same ordered list of draws in screen space, and
asserts the lists are equal. The trees are the ones the differences were
found in: children under fragments, plain and `zIndex`-ordered; a rounded
`overflow: hidden` card clipping a spilling child and an image; every
`objectFit`; linear and radial gradients; a scrolled list with a sticky
header and an overlay above it; nested scrollers; translated, scaled,
rotated and nested-opacity subtrees; a text selection and find matches
across two paragraphs; a grid.

**Pixel parity, in a browser.** No shader, scissor or texture bug is
visible to vitest, which reaches the render-list builder and stops. The
playground's compare route feeds one graph and one layout pass to both
backends side by side, reads both frames back, and counts pixels whose
channels differ. `pnpm parity:webgpu` drives that route in headless
Chrome with WebGPU on software rasterisation and fails on the counts. A
machine whose headless Chrome has no adapter fails saying so rather than
passing vacuously.

The gate has two thresholds, and the second is the one that matters. A
pixel differing by more than 48 per channel is anti-aliasing, and those
are allowed up to a small fraction of the frame; a pixel differing by
more than 160 is covered on one backend and empty on the other, which
anti-aliasing never produces. Recorded evidence for the sensitivity: a
one-pixel change to the rounded-rect distance function fails, and a
one-pixel edge shift fails with thousands of gross pixels.

**What the pixel gate does not cover.** Text boxes are masked out of the
comparison, deliberately, because `fillText` into a canvas and a sampled
texture cannot agree at the sub-pixel level. So the pixel numbers are
evidence about fills, borders, clips, gradients and images, and not about
glyphs; the glyphs have been judged by screenshot on the compare route,
which is a weaker instrument. Only Latin text at one device pixel ratio
has been looked at, and every reading was taken on Chromium.

## Choosing, honestly

**Take the default unless you have a reason.** `'auto'` gives a
Chromium engine the GPU path and everything else the portable one, and
no application code can tell which it got.

**Ask for `'canvas2d'` when the first frame is what matters.** It paints
immediately and cannot lose a device. On Chromium on Linux, in the
render worker, the Segue demo's first painted frame landed at 598 and
689 ms under `'auto'` against 428 and 508 ms pinned to Canvas2D, so the
adapter and the pipelines cost something like 130 to 180 ms of cold
start. Until that frame the canvas is empty rather than wrong. A screen
behind a splash or a network round trip will not notice; a screen that
is meant to be there instantly might.

**WebGPU is not currently a speed win on these screens.** Measured in the
render worker in Chromium, on the framework playground: scrolling a
100,000-row list, WebGPU rendered a frame in 0.62 ms (prepare 0.44,
upload 0.00, encode 0.18) against Canvas2D's 0.58 ms; with the glyph
atlas in place, 0.50 ms against 0.43 to 0.46. That is parity within
sampling noise. The cost on both is walking the tree, and the GPU work is
a fifth of it, so a screen whose expense is the traversal will not get
cheaper by changing backend. The default is not a claim about frame
cost. It is that the GPU path is the one with room left in it, and that
an application should be on it wherever it runs at all.

**Do not condition application behaviour on the backend.** The fallback
is silent by design, and code that assumed the GPU would win is code that
breaks on the machine that matters.

## Why this page has no live example

The site's embed mounts an app with no `renderer` option, so every
canvas on this site is drawn by whichever backend `'auto'` picked in
your browser: WebGPU on Chrome, Canvas2D on Safari and Firefox. The
option belongs to the host rather than to the worker, so a page cannot
offer a backend switch without changing the site's own shell. A toggle that flipped a label while the same backend kept drawing
would be worse than none, and on a reader's Safari or Firefox even a
working switch would fall back and show Canvas2D twice.

The checks live in this repository instead: `RendererParity.spec` under
`pnpm test:run`, and `pnpm parity:webgpu` against the playground's
compare route, which is also viewable by hand at `#compare` with the
playground running.

## Next

[Frames and phases](/tooling/frames-and-phases) is where the render
phase these backends share shows up, and where `FrameMetrics.gpu` is read.
