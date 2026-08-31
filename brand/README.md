# Gesso mark

_Gesso_ is the chalk ground brushed onto raw linen so it will take paint. The mark is one
broad coat of it pulled diagonally across a raw canvas, drawn as its own rasterisation — a
brush stroke that has been through a renderer.

## Files

| File                  | Use                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `gesso-mark.svg`      | Full colour. Chalk stroke on raw linen.                                                                                  |
| `gesso-mark-mono.svg` | One colour. The square takes `currentColor`; the stroke is knocked out, so whatever is behind the mark shows through it. |

`apps/playground/public/favicon.svg` is a copy of `gesso-mark.svg` and is the only place the
mark is wired into the build, from `apps/playground/index.html`.

## Geometry

The `64 × 64` viewBox is a `16 × 16` grid scaled by four, and every coordinate is a multiple
of four. The mark therefore lands on whole device pixels at 16, 32, 48 and 64 px, and needs
no separate small-size drawing.

- Square: full bleed, corner radius 12 (18.75%).
- Stroke: four steps, each 16 wide, rising 12; band 20 thick; 4 of linen left at each end,
  so the stroke sits centred corner to corner.

Two shapes and one clip path. No gradients, no filters, no embedded raster.

## Colour

| Name          | Hex       | Role                                                                                          |
| ------------- | --------- | --------------------------------------------------------------------------------------------- |
| Raw linen     | `#BE9A6E` | The canvas — the square.                                                                      |
| Chalk ground  | `#F7F3EA` | The primer — the stroke.                                                                      |
| Linen, shaded | `#8A6A45` | Reserved for depth if the mark is ever built up.                                              |
| Ultramarine   | `#2A3E8C` | The first paint after the primer dries. Links, focus rings, emphasis — never the mark itself. |
| Ink           | `#16181D` | Text, and the usual `currentColor` for the mono mark.                                         |

## Rules

- Do not recolour the stroke. Use `gesso-mark-mono.svg` where the palette will not work.
- Do not rotate the mark; the stroke reads bottom-left to top-right or not at all.
- Do not add a drop shadow, gradient or blur. The point of the drawing is that it has none.
