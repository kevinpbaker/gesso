---
description: 'Painting your own content: the paint prop, the surface a painter draws on, when a picture is made again, and measuring text from a painter, a worker or code that paints nothing.'
---

# Painting your own content

Most of a Gesso screen is elements: boxes, rows, text, laid out by the
engine and drawn by it. Some things are not elements. A chart's axes,
a drawing's shapes, a waveform, the guides an editor draws over a
selection: content whose geometry is the application's, not the
layout's. That content is **painted**. A node takes a `paint` prop,
and the engine calls its `draw` with a surface and the node's box.

```tsx
<paint
  width={240}
  height={120}
  paint={{
    inputs: [values],
    draw(surface, box) {
      surface.strokeColor('primary');
      surface.lineWidth(2);
      surface.beginPath();
      values.forEach((v, i) => {
        const x = (i / (values.length - 1)) * box.width;
        const y = box.height - v * box.height;
        if (i === 0) surface.moveTo(x, y);
        else surface.lineTo(x, y);
      });
      surface.stroke();
    }
  }}
/>
```

## The surface

A `PaintSurface` is a canvas-like API, small on purpose: `save` and
`restore`, `translate`, `scale`, `rotate` and `transform`; paths
(`moveTo`, `lineTo`, curves, `arc`, `rect`, `roundRect`, and SVG path
data through `path(d)`); `fill`, `stroke` and `clip`; `fillColor`,
`strokeColor`, `lineWidth`, `lineDash` and `alpha`; one line of `text`;
and `image`. Colours are palette names (`'text'`, `'primary'`,
`'border'`) or literal colours, so a painted node follows the theme as
an element does.

What a painter draws is recorded, not drawn there and then. The
recording is replayed onto whichever backend is drawing (Canvas2D or
WebGPU, see [Canvas2D and WebGPU](/rendering/canvas2d-and-webgpu)), on
whichever thread it runs, so the same painter works on both and in a
render worker.

## When the picture is made again

`inputs` is the whole of the cost story. The picture is made when an
item of `inputs` changes (compared one by one, by identity) and at no
other time, so a painted node in a list that scrolls is not drawn again
on every frame. Put in `inputs` everything `draw` reads that can
change: the data, the selection, the pointer's place for a readout.
Leave `inputs` out and the picture never changes on its own, which is
right for a static shape and wrong for a chart.

`draw` is handed a `PaintBox`: the node's width and height, its
padding, and the pixel ratio the picture is being made at.

## Measuring text

`surface.text(value, x, y, style)` draws one line at a baseline.
Labels need their size before they are drawn: the plate behind a
readout, a label kept off the line it labels, a pill kept inside the
canvas. There are two ways to measure, and they agree, because both
measure in the font `text` draws with:

- **In a painter**: `surface.measureText(value, style)`, the width.
- **Anywhere**: `paintTextMetrics(value, style)` from `gesso-core`, the
  width and the font's `ascent` and `descent`. It runs in a painter, in
  a render worker and in code that paints nothing (laying labels out,
  hit-testing them, sizing a node before it is drawn).
  `measurePaintText(value, style)` is the width alone.

```ts
import { paintTextMetrics, type PaintSurface } from 'gesso-core';

/** A readout pill beside the pointer, kept inside the canvas. */
function readout(surface: PaintSurface, text: string, at: { x: number; y: number }, width: number) {
  const style = { fontSize: 11 };
  const { width: textWidth, ascent, descent } = paintTextMetrics(text, style);
  const w = textWidth + 12;
  const h = ascent + descent + 6;
  const x = Math.min(at.x + 14, width - w - 2);
  const y = at.y + 14;
  surface.fillColor('text');
  surface.alpha(0.85);
  surface.beginPath();
  surface.roundRect(x, y, w, h, 4);
  surface.fill();
  surface.alpha(1);
  surface.fillColor('background');
  // Centred on the plate: the baseline sits below the middle by half of
  // what the font reaches above it, less half of what it reaches below.
  surface.text(text, x + 6, y + h / 2 + (ascent - descent) / 2, style);
}
```

`ascent` and `descent` are the font's, not the glyphs': `"x"` and
`"Ág"` give the same in one font and size, so plates that say
different things are one height, and a line of labels shares a
baseline.

Where there is no canvas at all (a test in node with no DOM), the width
is estimated at 0.55 em a character and the font at 0.8 em up and
0.2 em down, so code laid out in a test still gets sizes that grow with
the text and its size. A spec that needs real widths runs in a browser.

Painted text is one line. Wrapping, bidi, selection and find belong to
the text element, which does them properly; a painter that needs them
should put a text element over the canvas instead.

## Painted content and the mirror

Painted shapes are pixels. They are not in the semantics tree, so a
screen reader and an agent cannot reach them unless something says
they are there. The node itself can carry a role and a label (`role:
'image'` with a sentence that says what the picture shows). A canvas
people edit shape by shape needs more: each shape as a node a screen reader can choose and an
agent can operate.
