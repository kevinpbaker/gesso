---
description: 'Viewport: a surface that pans and zooms through a camera, with wheel, pinch, drag and keyboard, fitting, a minimap and zoom controls, and the camera helpers.'
---

# Viewport

A surface that pans and zooms: a diagram, a board, a circuit, a sheet of
parts to cut. The content is laid out once at its own size and drawn
through a camera, so everything in it stays what it was. Buttons press,
text selects and a [canvas editor](/interaction/canvas-editing) edits, at
any zoom.

<LiveExample id="viewport" height="460" />

<<< @/src/examples/ViewportExample.tsx#viewport

Mod or Ctrl with the wheel, or a pinch, zooms about the pointer, and the
wheel alone pans. Drag the background to pan; a note is a button, so a
press on one opens it rather than panning. Click the minimap to jump,
and use the controls to zoom, go back to 100% or fit.

## Props

| Prop              | Type                                             | Default    | What it does                                                         |
| ----------------- | ------------------------------------------------ | ---------- | -------------------------------------------------------------------- |
| `content`         | `UiChild`                                        | required   | What is looked at, laid out at the content's size.                   |
| `contentWidth`    | `number`                                         | required   | The content's width, in its own units.                               |
| `contentHeight`   | `number`                                         | required   | The content's height, in its own units.                              |
| `camera`          | `ViewportCamera`                                 | none       | Where it looks, when the application owns that.                      |
| `defaultCamera`   | `ViewportCamera`                                 | fitted     | Where it starts, when the viewport owns the camera.                  |
| `onCameraChange`  | `(camera: ViewportCamera) => void`               | none       | Called with the camera as the person pans and zooms.                 |
| `minZoom`         | `number`                                         | `0.1`      | The farthest out it zooms.                                           |
| `maxZoom`         | `number`                                         | `4`        | The farthest in.                                                     |
| `panOnBackground` | `boolean`                                        | `true`     | Whether a drag on the background pans. Read once.                    |
| `minimap`         | `boolean`                                        | `false`    | Draws the whole content small in the bottom-right corner. Read once. |
| `minimapPaint`    | `(surface: PaintSurface, scale: number) => void` | a block    | Draws the content in the minimap, in content units times `scale`.    |
| `controls`        | `boolean`                                        | `false`    | Draws −, the zoom, + and Fit in the bottom-left corner. Read once.   |
| `label`           | `string`                                         | `'Canvas'` | The viewport's name.                                                 |

A `ViewportCamera` is `{ x, y, zoom }`: the point of the content at the
viewport's top-left corner, in the content's units, and the zoom, 1 for
100%.

## Moving around

| How                              | What it does                                   |
| -------------------------------- | ---------------------------------------------- |
| Mod or Ctrl and the wheel, pinch | Zooms about the pointer                        |
| The wheel, two fingers           | Pans; Shift with a mouse's one wheel, sideways |
| Drag on the background           | Pans                                           |
| Middle-button drag               | Pans, wherever it starts                       |
| Space and drag                   | Pans, wherever it starts, while focused        |

A drag that starts on something of the content's own (a button, a field,
an editor: anything between the press and the viewport that takes focus)
is left to it, so an editor's shapes still move when they are dragged.
The middle button and Space pan from anywhere, for content that takes
every press.

The camera keeps at least a little of the content in view however far it
is panned, and a zoom stays between `minZoom` and `maxZoom`.

## Fitting

With no camera given, the viewport starts with the whole content in
view, centred with a little room around it, and never enlarged past
100%: a small diagram is shown at its size rather than blown up to fill
the window. While the view is that fit, it fits again as the viewport or
the content changes size, so it follows the window; once the person
pans or zooms, it stays where they put it. `1` and the Fit button go
back to the fit.

## Keyboard

The viewport takes focus. Its keys are its own only while it has focus
itself, so what is inside it (a field, an editor) keeps its arrows.

| Key             | What it does                   |
| --------------- | ------------------------------ |
| Arrows          | Pans 40 pixels, 200 with Shift |
| `+` or `=`, `-` | Zooms a step in or out         |
| `0`             | Zooms to 100% about the middle |
| `1`             | Fits the whole content         |
| `Space`, held   | Lets a drag pan from anywhere  |

The steps are a browser's: 25%, 33%, 50%, 67% and so on up to 800%,
within the limits.

## Minimap and controls

`minimap` draws the whole content small in the bottom-right corner, at
most 160 pixels on its longer side, with the part in view outlined; a
press or a drag on it moves the view there. What it shows of the content
is `minimapPaint`'s to draw, in content units times the scale it is
given, as the example draws its notes. Without it the content is a plain
block.

`controls` draws −, the zoom as a percentage, + and Fit in the
bottom-left corner. The percentage goes back to 100%.

## The camera helpers

`fitCamera(frame)`, `zoomCameraAt(camera, at, factor, frame)` and
`clampCamera(camera, frame)` are the viewport's own arithmetic, for an
application that owns the camera and gives commands of its own ("Zoom to
selection", a menu's Fit). A `ViewportFrame` is the content's size, the
viewport's size on screen and the zoom limits.

## Semantics

The viewport is a `group` named by `label`, described by its zoom ("Zoom
125%"), and what is inside it says what it is. The zoom controls are a
`group` named "Zoom" of `button`s, the percentage named for the zoom and
what it does. The minimap is for the pointer: the keyboard has the
arrows and `1`.
