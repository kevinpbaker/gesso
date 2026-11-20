---
description: 'The canvas editing kit: a canvas whose shapes the application owns and Gesso handles. Choosing, marquee, hover, an 8-handle box, snapping with guides, a readout, edits that are one undo step each, and every shape in the semantics tree.'
---

# Canvas editing

A drawing program, a diagram editor, a design tool and a CAD part
editor have the same canvas under different shapes. A click chooses a
shape and Shift-click adds one. A drag on empty space draws a marquee.
The shape under the pointer is outlined. A chosen shape has handles,
and a side handle moves one side. A drag snaps to what is near, with a
guide to show what lined up and a mark where it landed. A pill beside
the pointer says how long or how big. Escape calls a drag off, and
Undo takes a whole drag back.

The **canvas editing kit** in `gesso-components` is that canvas. The
application keeps its shapes, its model and its painting; the kit
handles the pointer, the keys, the overlay and the semantics tree.

<LiveExample id="canvasediting" height="420" />

Drag a shape, or a handle. Hold Shift to keep a corner's proportions
or a line's angle, and hold ⌘ or Ctrl to drag without snapping. Choose
the Rectangle tool and drag to draw. Focus the canvas: the arrows
nudge, Alt and an arrow resize, Tab walks the shapes, Delete deletes.

## How it is divided

The kit was designed against three applications built on Gesso. In
Calcwright, a worksheet's drawings are painted from formulas, and its
elements are known by their place in a list. In Flatwright, sheet-metal
parts are painted in world units with y up. In Mockz, the shapes are
live Gesso nodes from a design's source. The three have different
models and different ways to draw, so the kit holds neither.

- **The application describes its shapes**, as a list of
  `CanvasShape`: an id, a box in the canvas's pixels, a name, and
  optionally its own handles, its own hit test and the points others
  snap to. It rebuilds the list from its model whenever the model
  changes, as it would rebuild any view.
- **The kit reports edits**, as `CanvasEdit`s: a move, a resize, a
  handle dragged, a shape drawn. The application changes its model, and
  the list it hands back moves the shapes.
- **The application paints its shapes** (a `paint` node, or nodes, as
  Mockz's are) as the editor's children. The kit paints its overlay over
  them and puts one node per shape in the semantics tree.

### Edits are totals, and each is one undo step

Every edit goes `start`, then any number of `live`, then `end` or
`cancel`. Every value in it is the total since `start`, not a step:
a move of `dx: 30` is thirty pixels from where the shapes were when
the drag began. Apply it to what the model was at `start`:

```ts
let before = shapes.value;
function onEdit(edit: CanvasEdit) {
  if (edit.phase === 'start') before = shapes.value; // open a transaction
  if (edit.phase === 'cancel') return void (shapes.value = before); // roll it back
  if (edit.kind === 'move') {
    shapes.value = before.map(s => (edit.ids.includes(s.id) ? { ...s, x: s.x + edit.dx, y: s.y + edit.dy } : s));
  }
  if (edit.phase === 'end') undo.push(/* before → shapes.value, one step */);
}
```

That is what makes a drag one undo step however many frames it took,
and it is what all three applications already did: Calcwright keeps the
elements as they were at the press and joins every frame of a drag into
one history step, Flatwright applies `live` changes and commits once,
and Mockz previews and writes on release. It also means an application
can change more than the shapes it was told about: Calcwright's
dimensions that follow the shapes they measure are moved in the same
edit, computed from the same `before`.

A key is an edit too, a `start` and an `end` together, so the arrows and
Alt+arrows go through the same `onEdit`.

### A component, and a controller under it

`CanvasEditor` is a focusable box with the kit wired into it. Under it is
`canvasEditing(ctx, options)`, which returns the handlers, the overlay
and the shape nodes for a node the application already has. An
application with pointer handling of its own (Calcwright's drawing
tools: polylines a click at a time, trim and fillet, connectors) calls
the kit's handlers from its own and keeps the rest, so it can move onto
the kit a piece at a time. Its own tools can still use the kit's guides,
snap mark and readout through `show`, and the pure functions under both
(`resizeRect`, `snapPoint`, `snapMove`, `holdAngle`, `readoutText`,
`paintReadout`) work with no canvas at all.

## CanvasEditor

<<< @/src/examples/CanvasEditingExample.tsx#editor

| Prop                | Type                                    | Default    | What it does                                                                |
| ------------------- | --------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| `shapes`            | `CanvasShape[]`                         | required   | The shapes, in drawing order: the last is on top and is hit first.          |
| `selection`         | `string[]`                              | none       | The chosen shapes' ids. Omit to let the editor keep its own.                |
| `defaultSelection`  | `string[]`                              | `[]`       | Chosen at first, when the editor keeps its own.                             |
| `onSelectionChange` | `(ids) => void`                         | none       | The selection changed.                                                      |
| `onHoverChange`     | `(id \| null) => void`                  | none       | The shape under the pointer changed: a layers list highlights its row.      |
| `tool`              | `string \| null`                        | `null`     | A drawing tool. While set, a drag reports `draw` edits instead of choosing. |
| `onEdit`            | `(edit: CanvasEdit) => void`            | none       | A move, a resize, a handle, a drawing. See above.                           |
| `onDelete`          | `(ids) => void`                         | none       | Delete or Backspace with shapes chosen.                                     |
| `onPress`           | `(point, event) => boolean`             | none       | A press, first. True keeps the editor from choosing: a tool placing points. |
| `snap`              | `CanvasSnapOptions \| false`            | `{}`       | Snapping. See below.                                                        |
| `readout`           | `(edit) => string \| null \| undefined` | none       | The readout's words; undefined for the editor's own, null for none.         |
| `units`             | `{ scale, unit, yUp? }`                 | pixels     | Pixels per unit, the unit's name and whether y runs up, for the readout.    |
| `marquee`           | `'touch' \| 'contain'`                  | `'touch'`  | Whether a marquee chooses what it touches or what it holds whole.           |
| `nudge`             | `number`                                | `1`        | Canvas pixels an arrow moves; Shift ten times.                              |
| `tabSelects`        | `boolean`                               | `true`     | With shapes chosen, Tab and Shift+Tab choose the next and the previous.     |
| `groupHandles`      | `boolean`                               | `true`     | Whether several chosen shapes share eight handles on the box round them.    |
| `colors`            | `CanvasOverlayColors`                   | theme      | The selection, hover, guide and handle colours.                             |
| `focusRing`         | `boolean \| FocusRingOptions`           | `false`    | A ring while the canvas has the keyboard, after a click too. See below.     |
| `clickToDraw`       | `boolean \| (tool) => boolean`          | `false`    | A click begins a shape and the next press ends it. See below.               |
| `typedValue`        | `(text, edit) => CanvasEdit \| null`    | none       | A typed size for the edit in progress, made exact. See below.               |
| `label`             | `string`                                | `'Canvas'` | The canvas's name to a screen reader.                                       |
| `children`          | `UiChild`                               | none       | What the application draws, under the overlay.                              |

### CanvasShape

<<< @/src/examples/CanvasEditingExample.tsx#model

| Field         | Type                                | What it does                                                                                                                  |
| ------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`          | `string`                            | Stable across rebuilds. What selections and edits name it by.                                                                 |
| `bounds`      | `CanvasRect`                        | Its box in the canvas's own pixels (y down).                                                                                  |
| `label`       | `string`                            | Its name to a screen reader and an agent. Say what it is and its size.                                                        |
| `description` | `string`                            | More, said after the name.                                                                                                    |
| `handles`     | `'box' \| 'none' \| CanvasHandle[]` | Eight on its box (the default), none, or its own: a line's two ends.                                                          |
| `locked`      | `boolean`                           | Not chosen by a click or a marquee. Still in the semantics tree, disabled.                                                    |
| `hit`         | `(point, slack) => boolean`         | Whether a point is on it. Its box when left out; a line wants its own.                                                        |
| `snapPoints`  | `SnapTarget[]`                      | What others snap to. Its corners, side middles and centre when left out.                                                      |
| `anchor`      | `CanvasPoint`                       | The point a move of it snaps to the grid by: a corner or an end, so its numbers stay round. Its box's top left when left out. |
| `movesWith`   | `string[]`                          | The shapes it follows (a dimension glued to a corner). While any is moved or reshaped, it is not snapped to.                  |

A `CanvasHandle` is an `id`, a point `at`, and optionally an `anchor`,
the point Shift holds the drag at 45° round (a line end's other end),
and a `cursor`. `look: 'none'` leaves it for the application to draw (a
turning handle's circle), and `snaps: false` drags it freely, unsnapped
and with no angle held, for a handle that steps by a rule of its own:
a turning handle in 15° steps.

### CanvasEdit

| Kind     | Fields                                       | Made by                                     |
| -------- | -------------------------------------------- | ------------------------------------------- |
| `move`   | `ids`, `dx`, `dy`                            | A drag on a chosen shape; an arrow key.     |
| `resize` | `ids`, `handle` (`'nw'`…`'w'`), `from`, `to` | One of the eight handles; Alt and an arrow. |
| `handle` | `id`, `handle`, `from`, `to`                 | A handle of a shape's own.                  |
| `draw`   | `tool`, `from`, `to`                         | A drag with a tool.                         |

Each also has `phase`, `snap`, what it snapped to (`null` for
nothing), and `modifiers`, whether Shift and Alt were held, for an
application whose own rules take them (Shift to square a box, or to
turn freely). Several shapes resized together get one `resize` with the box
round all of them as `from` and `to`; scale each shape by the change,
as the example does.

## Snapping

| Option       | Default | What it does                                                                              |
| ------------ | ------- | ----------------------------------------------------------------------------------------- |
| `reach`      | `8`     | Screen pixels a point has to come within to snap, whatever the zoom.                      |
| `grid`       | none    | A grid, in canvas pixels, for what snaps to nothing else.                                 |
| `gridOrigin` | `0, 0`  | Where the grid's lines cross, in canvas pixels: the application's own origin.             |
| `angle`      | `45`    | Shift holds a line or a handle to multiples of this many degrees.                         |
| `toPoint`    | none    | The application's own snaps, tried first: a tangent, a perpendicular, a point on a curve. |
| `candidates` | none    | Every snap of the application's in reach, best first. Tab steps through them.             |

What snaps to what:

- **A move** drops a point on a point first (any snap point of the
  moving shapes on any of the others), then lines the moving box's
  left, centre and right up with the others', and its top, middle and
  bottom, each axis on its own with a guide, then the grid.
- **A handle, a corner or a drawn point** snaps to the nearest point
  in reach (a mark shows where), else lines up with points on either
  axis (a guide each), else the grid.
- ⌘ or Ctrl held turns snapping off for the drag, and `snap={false}`
  turns it off.
- What a drag snaps to is taken when it begins. A dimension glued to a
  corner moves with the corner, and a shape that moves with what is
  dragged is not something to snap to.
- A move snaps to the grid by the pressed shape's `anchor`, a real point
  of it, so the numbers it writes stay round.

### Tab through what is in reach

Two snaps can be within reach of one place: a hole's centre and a
tangent to it, an end and the middle of a short line. While a point is
dragged or drawn, Tab moves it to the next snap in reach and Shift+Tab
to the one before, as in AutoCAD. The choice holds while the pointer
moves, as long as that snap stays in reach.

The application gives what is in reach with `candidates(point, context)`,
best first; the first is what the point snaps to. `context.reach` is
how near counts, in canvas pixels at the zoom now, and `context.from`
is the point a line is drawn from, for a tangent or a perpendicular.
With no `candidates`, Tab steps through the shapes' `snapPoints` in
reach, nearest first. A move snaps a whole shape and has no list to
step through.

```ts
snap: {
  candidates: (p, { from, reach }) => mySnapsNear(p, from, reach); // [{ point, kind, label: 'center', guides: [] }, …]
}
```

### Snap labels

A `SnapHit` from `toPoint` can carry a `label`, and so can a
`SnapTarget` in a shape's `snapPoints`. The overlay writes it in small
type beside the snap mark (`end`, `center`, `tangent`, `on the line`,
`grid`), so the person knows what the drag will land on before they
let go. It goes at the place nearest the mark that is inside the canvas
and clear of the readout. The words are the application's, in its own
language; with no `label`, nothing is written.

```ts
toPoint: p => {
  const centre = holeCentreNear(p);
  return centre === null ? null : { point: centre, kind: 'centre', label: 'center', guides: [] };
};
```

## Drawing by clicks, and typed sizes

With `clickToDraw`, a click with a tool begins a shape, the shape
follows the pointer, and the next press ends it where it lands: line,
dimension, rectangle and circle tools in a CAD program work this way. A
drag still draws as before. Escape, or putting the tool down, calls the
shape off. Pass a test of the tool's name to have only some tools do
it.

Engineers draw to size. While a shape is drawn or anything is dragged,
a digit, `.`, `-`, `<` or `Ø` opens the readout as a field, and the
keys after it go there; Backspace edits it, Escape clears it, and Enter
ends the edit at that value. The kit does not read the text: what `480`
or `300,200` means depends on the tool and the units, so
`typedValue(text, edit)` does. It is given the edit as the pointer makes
it and returns it made exact, or null for text it cannot read. The
shape follows the typed value as it is typed, and the pointer still
sets the direction. While a value is typed, the pointer's snap mark,
its label and its guides are not shown: the value places the point.

```ts
typedValue: (text, edit) => {
  if (edit.kind !== 'draw') return null;
  const length = parseLength(text); // `480`, `0.48m`, `1ft 6in`, in canvas pixels
  if (length === null) return null;
  const run = Math.hypot(edit.to.x - edit.from.x, edit.to.y - edit.from.y);
  if (run === 0) return null;
  const k = length / run; // along the pointer's direction
  return {
    ...edit,
    to: { x: edit.from.x + (edit.to.x - edit.from.x) * k, y: edit.from.y + (edit.to.y - edit.from.y) * k }
  };
};
```

With shapes chosen and nothing in progress, a typed value is a move:
an arrow moves them by it in the arrow's direction (the edit
`typedValue` is given points that way), and Enter with a pair such as
`50,20` moves them by the pair, as the application reads it.
`commitTyped(text)` on `canvasEditing` commits a value from elsewhere,
an agent or a field of the application's own, and `typed` is the text
being typed.

## Keyboard

The canvas is one tab stop. With it focused:

| Key                        | What it does                                                      |
| -------------------------- | ----------------------------------------------------------------- |
| Arrows                     | Move the chosen shapes by `nudge`; Shift ten times                |
| Alt+Right, Alt+Left        | Widen or narrow the chosen box from its right side                |
| Alt+Down, Alt+Up           | Make it taller or shorter from its bottom                         |
| Tab, Shift+Tab             | With shapes chosen, choose the next or the previous shape         |
| ⌘A or Ctrl+A               | Choose every shape that is not locked                             |
| Delete, Backspace          | `onDelete` with the chosen shapes                                 |
| Escape                     | Calls off a drag; else clears the selection; else passes on       |
| Tab while dragging         | The next snap in reach; Shift+Tab the one before                  |
| A digit, with `typedValue` | Opens the readout as a field for an exact value; Enter commits it |

### Where the keys go

A control's focus ring shows only for the keyboard: a click focuses a
button but draws no ring. A canvas is different. It is clicked far more
than it is tabbed to, and its keys (tool letters, arrows, Delete) do
something, so a person must see whether the canvas or a field beside
it will take the next key. `focusRing` draws a ring round the canvas
whenever it has the keyboard, after a click as well as after Tab, and
none while a field has it. Pass `true` for the theme's ring, or the
options `focusRing` takes (`color`, `width`, `offset`, `radius`).

Tab walks the shapes only while something is chosen, so Escape and
then Tab leaves the canvas. Every other key passes on, so an
application's own (tool letters, ⌘D, ⌘C) go on the canvas's parent or
`onKeyDown` as usual.

## Semantics

Painted shapes are pixels, and pixels are not in the semantics tree.
The kit puts a node over each shape that is: an `option`, named by the
shape's `label`, `selected` while chosen, disabled while `locked`. The
canvas is a `listbox` named by `label`, and the first chosen shape is
its `activeDescendant`, so a screen reader that arrives on the canvas
hears what is chosen.

The shape nodes take no pointer: the canvas answers the pointer. A
press from the semantics mirror (a screen reader's activate, an agent's
`ui_press`) reaches the node and chooses the shape. From there the keys
above move and resize it, and the inspector beside it can change
everything else, so the whole canvas is operable without a pointer.

| What       | Value                                                                       |
| ---------- | --------------------------------------------------------------------------- |
| Canvas     | `listbox`, named by `label`, focusable, `activeDescendant` the chosen shape |
| Each shape | `option`, named by its `label`, `selected` while chosen                     |

## canvasEditing, for a canvas you already have

```tsx
const editing = canvasEditing(ctx, { shapes, selection, onEdit, snap: { grid: 5 } });

<box
  focusable={true}
  role="listbox"
  label="Drawing"
  activeDescendant={editing.activeDescendant}
  cursor={editing.cursor}
  modifiers={editing.modifiers}
  onPointerDown={e => (myTool.value === null ? editing.handlers.onPointerDown(e) : myPress(e))}
  onPanStart={e => editing.handle.panStart(e) || myPanStart(e)}
  /* …and the rest the same way */
>
  <paint paint={myShapes} />
  {editing.overlay}
  {editing.shapeNodes}
</box>;
```

`handlers` are ready to spread; `handle` has the same, each returning
whether it did anything. With `clickToDraw`, the canvas also passes on
`onPointerUp`, which begins a clicked shape, and `onPointerMove` while
a tool is picked, which moves it. With `focusRing`, the ring is drawn on the
node that carries `modifiers`, which need not be the node that takes
focus: call `handlers.onFocus` and `handlers.onBlur` from the focusable
node's own, and `focused` says whether it has the keyboard. `toLocal(event)` is a pointer's place in the
canvas's pixels and `scale()` the zoom above it, both from the canvas
node's measured boxes, so a canvas inside a zoomed page needs nothing
more. `show({ guides, snap, snapLabel, readout })` draws the kit's
feedback from a drag the application runs itself.

## Painting the overlay yourself

`paintCanvasOverlay(surface, state, size, scale)` draws hover,
selection, handles, marquee, guides, snap mark, snap label and readout
from a `CanvasOverlayState`, and `paintReadout(surface, text, at, size, scale, look)`
draws the readout alone. The readout's plate is measured with
`paintTextMetrics` (see [Painting your own content](/rendering/painting)),
so it fits what it says, and it flips to the other side of the pointer
at the canvas's edge. Every size is divided by `scale`, so handles and
text are the same size on screen at any zoom. `colors` (and `look` for
`paintReadout` alone) sets the selection, guide and handle colours and
the readout's plate, ink and font, so an application's own palette and
type carry over: Calcwright's readout is `ink` on its paper, in its text
face.

## Next

The [property inspector](/components/inspector) is the panel that
usually sits beside the canvas, and [Toolbar](/components/toolbar) the
row of tools above it.
