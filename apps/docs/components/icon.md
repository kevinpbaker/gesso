---
description: 'Icon: a glyph rasterised from a path, why its colour is baked into its pixels, and what it announces.'
---

# Icon

A glyph, drawn from an SVG path. Reach for it for the small symbols an
interface is made of: a tick, a chevron, a bell, the thing on the left
of a menu row. For a photograph or a thumbnail use an
[image](/components/image), which decodes a file rather than drawing a
path.

An `Icon` takes path data, not a file. There is no SVG parser in the
framework and nothing to load: the path is rasterised into a small
bitmap, and the bitmap is drawn into a box exactly as a picture is.
Icon sets ship their paths as strings, so pasting one in is the whole
of adopting a set.

<LiveExample id="icon" height="230" />

<<< @/src/examples/IconExample.tsx#icons

Switch this site between light and dark, and watch the accent of the
stroked four follow it. That is not a repaint: each icon is drawn
again.

The paths themselves are ordinary strings, kept beside the component
that uses them:

<<< @/src/examples/IconExample.tsx#paths

## Props

| Prop          | Type                  | Default             | What it does                                                                     |
| ------------- | --------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `path`        | `string`              | required            | SVG path data, in the coordinates of `viewBox`.                                  |
| `viewBox`     | `number`              | `24`                | The side of the square the path was authored in. 24 is the usual icon grid.      |
| `size`        | `number`              | `16`                | The side of the box the icon occupies, in logical pixels.                        |
| `color`       | `UiColorValue`        | `controlForeground` | A palette name or a colour outright.                                             |
| `style`       | `'fill' \| 'stroke'`  | `'fill'`            | A solid glyph, or a line one.                                                    |
| `strokeWidth` | `number`              | `2`                 | Line width for a stroked icon, in `viewBox` units rather than pixels.            |
| `fillRule`    | `'nonzero' \| 'evenodd'` | `'nonzero'`      | Which points a filled path encloses.                                             |
| `label`       | `string`              | none                | What a screen reader reads. Omitting it makes the icon decorative.               |
| `ref`         | `UiNodeRef`           | none                | Receives the node the glyph is drawn on.                                         |

`size` sets the box as well as the raster, and `flexShrink` is fixed at
zero, so an icon in a tight row keeps its size and something else gives
way. The layout props on [the library page](/components/) apply, and
`rootModifiers` reaches the node the glyph is drawn on.

`fillRule` matters for any glyph with a hole in it: a clock face, a
circle with a slash, an arrow inside a cloud. A subpath wound the same
way as the shape containing it does not punch a hole under `nonzero`
and does under `evenodd`. Icon sets say which they authored for in the
SVG's `fill-rule`, and a path authored `evenodd` given to a `nonzero`
icon renders as a filled blob.

One path, one colour. A two-colour mark is two `Icon`s stacked, not one
with a cleverer path.

## Colour is baked in, and that is why it is a prop

Everything else in the library names a palette entry and lets it
resolve at paint, against whatever theme the node inherits. An icon
cannot: a raster's colour is its pixels. So the modifier behind an
`Icon` reads the theme the node inherits, resolves the palette name
against it, rasterises, and rasterises again when a provider above
swaps that theme. An icon inside a card that turns dark turns with it,
one frame later.

This is why `Icon` takes a `color` at all, where a checkbox takes none.
The name still goes through the palette, so `color="controlAccent"` is
as themed here as anywhere else; what differs is when it resolves.

**What it costs, today:** one canvas and one raster per distinct
combination of path, size, colour and style. Ten icons in one colour
are ten small textures, the same icon in a hover colour is an eleventh,
and a theme change redraws the icons on screen and nothing else.
Nothing re-rasterises while the specification is unchanged, and
released rasters are cached rather than dropped. An atlas would put all
of them in one texture; it is not what is in the package, and it would
not change any prop above, because what an atlas changes is where the
pixels live rather than what an icon is.

## Keyboard

None. An icon is not a tab stop, and it is not hit-testable either: the
pointer goes straight through it to whatever it sits on. That is what
makes an icon inside a button harmless, since the button keeps the
hover and the press.

## Semantics

| What   | Value                                                             |
| ------ | ------------------------------------------------------------------- |
| Role   | `image`, when `label` was given, on the box the glyph is drawn on  |
| Name   | `label`                                                           |
| States | None. A glyph has nothing to be                                   |
| Value  | None                                                              |

Most icons should have no label. An icon beside the word it illustrates
is decoration, and a screen reader that reads both says everything
twice; an icon that is the whole of a button belongs to the button,
which is where the name goes. Reach for `label` when the icon is the
only thing carrying the meaning and nothing around it can hold the
name.

Given no label the icon has no role and no name, so it is not in the
semantics tree at all. As with a picture, that is a decision rather
than an oversight: there is no way to get a nameless `image` record.

## Next

[Icons](/media/icons) is the longer version of the rasterising above,
[Image](/components/image) is the one for a decoded file, and
[Toolbar](/components/toolbar) is the row these usually end up in.
