---
description: 'Icons are paths, not files: how one is rasterised, what that costs, and why an icon is the one thing here that cannot resolve a palette colour at paint.'
---

# Icons

An icon is a path, a size and a colour. Nothing fetches a file and
nothing parses an SVG document: you hand `Icon` the `d` attribute out of
one, and it draws that path into a bitmap.

Press the button to change the theme the card provides, and watch the
icons follow it:

<LiveExample id="mediaicons" height="320" />

<<< @/src/examples/MediaIconsExample.tsx#icons

## What an icon is

| Field         | What it says                                                          |
| ------------- | --------------------------------------------------------------------- |
| `path`        | SVG path data, in the coordinates of the viewBox                      |
| `viewBox`     | The side of the square the path was authored in. 24 is the usual grid |
| `size`        | The side of the box the icon occupies, in logical pixels              |
| `color`       | A palette name or a literal colour                                    |
| `style`       | `fill` for a solid glyph, `stroke` for a line one                     |
| `strokeWidth` | Line width for a stroked icon, in viewBox units rather than pixels    |
| `fillRule`    | Which points a filled path encloses: `nonzero` or `evenodd`           |

Those seven are `IconSpec`, which is the rasteriser's whole vocabulary,
and they are also the identity of a raster: two icons agreeing on all
seven are one bitmap. The `Icon` component's own props are on
[its page](/components/icon).

## How one becomes pixels

1. An `OffscreenCanvas` is made at `size` times the rasteriser's scale,
   which is 2 unless something says otherwise.
2. One transform takes the path from viewBox units into the bitmap's
   physical pixels, so nothing else has to scale. A stroke width of 2 in
   a 24 viewBox is 2 units wherever the icon is drawn.
3. The path is filled with the resolved colour, or stroked with it using
   round caps and joins.
4. `createImageBitmap` turns the canvas into an `ImageBitmap`, and the
   `iconSource` modifier writes it onto the node's `image`.

That last step is the point: an icon reaches the screen down the same
path a photograph does. `OffscreenCanvas` exists on the main thread and
in a worker, which is what lets the drawing happen wherever the runtime
lives, and the node is sized to the icon with `objectFit: fill`, so
there is no fitting decision to make.

## What that costs today

One `OffscreenCanvas` and one `createImageBitmap` per distinct icon:

- A toolbar of ten icons in one colour is ten small textures.
- The same icon in a hover colour is a second entry.
- The same icon on twenty nodes is one entry, reference counted, and a
  released one stays cached until the capacity (64) pushes it out.
- A theme change re-rasterises the icons on screen, and nothing else.

The example above puts the check mark on two nodes and the ring path
under two fill rules, so five icons on screen are four rasters. Its spec
counts them.

The WebGPU backend does keep an atlas, and it is text's: glyph cells,
rasterised per font, size and colour, so a page of prose costs the
number of distinct glyphs rather than the number of lines. Icons do not
go through it. Each one is an ordinary texture in the same cache a
picture uses, keyed on the bitmap.

## Why the colour is baked in

Everything else in the library names a palette entry and lets it resolve
at paint against whatever theme the node inherits. An icon cannot: by
the time it is drawn it is pixels, and pixels have a colour.

So `iconSource` reads the theme out of the environment with
`host.environment(theme)`, resolves the palette name against the node,
and subscribes to `host.onEnvironment` so that a provider swapping the
theme above it draws the icon again in the new value. That is what the
button in the example does. Nothing is rebuilt: the same node keeps its
place in the tree and gets a new bitmap, and the old raster is released
as the new one is taken.

Because the colour is part of a raster's identity, an icon that changes
colour on hover is two entries in the cache, not one entry drawn twice.

## `nonzero` and `evenodd`

The two squares in the example are one path: an outer square and an
inner one, wound the same way. Under `nonzero`, the canvas default,
the inner square does not punch a hole and the icon is a solid block.
Under `evenodd` it does, and the icon is a frame.

Icon sets author for one or the other and say which in the SVG's
`fill-rule` attribute. Heroicons' solid set says `evenodd`, and a path
from it given to `Icon` without `fillRule="evenodd"` renders as a filled
blob. That is the single most likely reason an icon you have pasted in
looks wrong.

## Limits

- **One path, one colour.** A two-colour mark is two `Icon`s stacked, or
  two paths in separate nodes; the framework playground draws its own
  logo that way.
- **Path data, not documents.** There is no SVG parser here: no groups,
  no transforms, no gradients, no `<use>`. Take the `d` attribute out of
  the file. A whole SVG cannot be loaded as an
  [image](/media/images-and-the-resolver) either, because
  `createImageBitmap` refuses an SVG blob.
- **Rasterised at 2, not at the display.** The scale is fixed at twice
  the logical size unless the application declares a rasteriser of its
  own with `useMedia({ rasterizer: new IconRasterizer({ scale: 3 }) })`,
  and the runtime does not pass the device pixel ratio in. On a 3x
  screen an icon is upsampled from a 2x bitmap.
- **An icon is decorative unless you name it.** No `label` means no role
  and no record in the semantics tree, which is right for a glyph inside
  a labelled button and wrong for one that is the whole control.
- **An icon is not hit-testable.** The node sets `hitTestable: false`, so
  the pointer target is whatever the icon sits inside.

## What this page was checked against

`MediaIconsExample.spec.ts` mounts the example with a rasteriser whose
canvas records what it was asked to draw instead of drawing it, and
asserts three things: that five icons on screen produce four rasters,
that clicking the button draws every icon a second time in a different
colour, and that only the icon given a label reaches the semantics tree.

The recording canvas is not a canvas, so what the spec proves is which
rasters were asked for and in what colour, not what the glyphs look
like. The shape of a rasterised path was checked elsewhere, by the
WebGPU parity run, which puts a stroked icon through `IconRasterizer`
and compares the two backends pixel by pixel.

## Next

[Video](/media/video) is the same idea moving: a surface the renderers
draw the way they draw a picture, with frames arriving from a decoder in
the render worker.
