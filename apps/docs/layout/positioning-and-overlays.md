---
description: Taking a box out of flow, the containing block it is placed against, anchored placement that flips and shifts at the viewport edge, and the layer overlays live in.
---

# Positioning and overlays

Most of a screen is laid out by rows, columns and grids. The parts that
float over it are not: a menu, a popover, a dialog and a toast all have
to escape the box that opened them and be placed against something
else. That is what `position` and the overlay layer are for.

The panel below is anchored to the button in the list. Move the button
towards the bottom edge and watch which side the panel takes; expand
the notice at the top of the list and watch the panel follow a button
that nothing scrolled:

<LiveExample id="position" height="360" />

<<< @/src/examples/PositionExample.tsx#anchored

## Four positions

`position` takes the same four values CSS does, and reads the same way:

| Value      | What it does                                                                                |
| ---------- | ------------------------------------------------------------------------------------------- |
| `static`   | The default. The node is laid out in flow and the edge props are ignored.                   |
| `relative` | In flow, then shifted by its edge offsets. Siblings do not move.                            |
| `absolute` | Out of flow. It contributes nothing to its parent's size and is placed against a block.     |
| `sticky`   | In flow until scrolling would carry it past an edge it named. See [sticky](/layout/sticky). |

`top`, `right`, `bottom` and `left` are the offsets, and `inset` sets
all four at once. Any of them can be a percentage or a number.

## What an absolute box is placed against

**Its containing block: the nearest ancestor whose `position` is
`relative`, `absolute` or `sticky`, and the layout root when there is
none.** The example's list is the containing block for nothing, because
nothing inside it is absolute; the panel's containing block is the
overlay layer, which covers the viewport, and that is why the panel
flips at the edge of the canvas rather than at the edge of the list.

Three rules decide the box itself, and they are CSS's:

- **Both edges on an axis, and no explicit size, is a tight box.** The
  node is stretched between them.
- **Otherwise the node is its own size and one edge places it.** With
  both edges set and a size given as well, `left` wins over `right` and
  `top` over `bottom`.
- **Margins apply.** They are subtracted from the space between the
  edges, as in CSS.

With no edge set at all, the node sits at the containing block's
origin. CSS would put it where it would have been in flow, its static
position; that is the one place this deliberately stops short.

Absolutes are placed after the flow, not measured with it, because a
containing block's own box is only final once its in-flow children have
been laid out. That is the same order the CSS specification gives, and
it is why a percentage offset resolves against a block whose size is
already known.

**A block that changes size places its absolutes again, wherever they
are below it.** An absolute is placed when its parent is, and its
parent can be some way under its containing block: a panel pinned to
the window's corner from inside a column of the app. When only the
block changes, as the window does on a resize, the column keeps its box
and is not placed again, so the engine keeps the block each absolute
was placed against and, after any pass in which a positioned node or the
root took a new box, places again the ones whose block is not that box
any more. Until it did, such a panel stayed at the corner of the window
it was first laid out in.

## Stacks align their children

A `<box>` (exported as `Stack` in the factory API, which says what the
children do) puts every child at the same origin. It takes the same `x`
and `y` alignment props a row or a column does, and a child can
override with `selfX` and `selfY`:

```tsx
<box width={200} height={120} x="center" y="end">
  <text text="Bottom centre" />
  <box selfX="end" selfY="start" width={12} height={12} borderRadius={6} backgroundColor="accent" />
</box>
```

`stretch` skips a child that has an explicit size on that axis, and a
stretched child is measured tight, so text inside one wraps at the
stack's width rather than at its own.

A box's children start at its top left. A `<button>` is a stack too,
and its children start in its middle, both ways, as an HTML button's
label does: a label in a 30 pixel high button sits halfway down it
without an alignment prop. `x` and `y` override that as they do on a
box, so a row that should span the button takes `x="stretch"`.

## zIndex is decided in layout

Within one `zIndex`, positioned children paint after their in-flow
siblings, which is what lets an overlay cover the content it opened
over. `zIndex` reorders siblings: higher paints later and is hit first,
and ties keep tree order.

The ordering is recorded during layout rather than sorted at paint
time. When any child of a node carries a non-zero `zIndex`, the paint
order is written onto the parent's layout record, and both renderers
and the hit tester read that one list, the hit tester in reverse. Paint
and hit testing therefore cannot disagree about who is on top.

## Anchored placement

An absolute node given an `anchor`, which is a `UiNode`, is placed
beside that node instead of by its edges. These props say how:

| Prop           | Type                      | What it does                                                      |
| -------------- | ------------------------- | ----------------------------------------------------------------- |
| `anchor`       | `UiNode`                  | The node to sit beside. Edge offsets are ignored while it is set. |
| `placement`    | see below                 | The side, and the alignment along it. Default `bottom`.           |
| `anchorOffset` | `number`                  | The gap between the two boxes. Default 0.                         |
| `anchorRect`   | `{ x, y, width, height }` | A part of the anchor to sit beside instead of all of it.          |

`anchorRect` is in the anchor's own coordinates, from the top left of
its border box. The node is placed against that rectangle exactly as
it would be against the whole anchor, flip and shift included, and it
follows the anchor in the same way. It is what puts a list under the
word being typed in a paragraph as wide as the page: see
[putting something at the caret](/components/text-input#putting-something-at-the-caret).

`placement` is a side, optionally followed by an alignment:
`'top'`, `'bottom'`, `'left'`, `'right'`, each also available as
`-start` and `-end`. A bare side centres the node on the anchor;
`-start` lines up their leading edges and `-end` their trailing ones.

Two adjustments then run, and they are Floating UI's defaults without
the DOM:

- **Flip.** Two things have to be true: the node does not fit on the
  side it asked for, and the opposite side has more room than that
  side. A node that fits stays put, and a node that fits on neither
  side goes to whichever has more room.
- **Shift.** Along the other axis the node is clamped to the containing
  block, so it slides along the anchor rather than hanging off the
  edge. The example's panel is always shifted, because its button sits
  against the right of a list that reaches the canvas edge.

Both are decided in the layout engine rather than in a pass afterwards,
which is what makes them frame-exact. There is never a frame in which
the panel is beside where the button used to be.

**An anchor that moves takes its overlays with it, whatever moved it.**
The engine keeps an index of which anchored nodes each anchor carries.
A box that comes out somewhere new names its overlays, and they are
placed again at the end of the frame, once every box in the pass is
final: it does not matter whether the anchor moved because the list
scrolled, because its own offsets changed, or because something above
it in the flow grew. A [sticky](/layout/sticky) anchor moves without
its box moving at all, so the shift is watched the same way: a header
that takes the top edge of its list takes its overlays with it, and
hands them back when it lets go. A frame in which no box moved and no
sticky node shifted asks the index nothing, so an idle overlay costs
nothing to keep open. A full layout is the one pass that settles every
anchored node rather than only the ones the index named: it places the
whole tree anyway, and the offsets a scrolled list ends up with are
known only once it is over.

**The anchor and the overlay may be under different scroll
containers.** Layout boxes are pre-scroll and unshifted, so before
comparing the two the engine sums the scroll offsets and the sticky
shifts above each of them and brings both into the same visible space.
Placement therefore reads where a node is seen, and so does the flip:
an overlay whose anchor is held at the edge of a list takes the side
that has room beside the held position, not beside the flow position
the list scrolled away from. Scrolling and sticking are the two changes
that move an anchor without changing any box, so a scroll frame hands
the anchored nodes their fresh placement directly, and a pass in which
a sticky node's shift changed hands it to the overlays that node
carries. Neither measures anything.

If the anchored panel in your own screen stops following its anchor,
the usual cause is that the anchor never reached the prop. A `ref`
fires after the component's body has run, so a `UiNode` written into a
plain field and passed straight to a child was `null` at the moment the
child read it. Read the anchor inside the handler that opens the
overlay, as the example does, or hold it in a cell so the prop follows
it.

## The overlay layer

Every runtime registers an `OverlayService` and mounts an
`OverlayLayer` above the application root. The layer is one absolutely
positioned box covering the viewport at `zIndex` 1000, and it is
`hitTestable: false`, so with nothing open it is invisible to input.

The service is injected and called; components do not build overlay
nodes themselves. `useOverlay` from `gesso-components` is the
per-instance handle around it: an id of its own, an `open` Observable
to bind to, and a close on unmount, so an overlay cannot outlive the
component that opened it.

```tsx
const panel = useOverlay(ctx, 'details');
panel.show(content, { anchor, placement: 'bottom-start', offset: 8, environment: anchor });
panel.hide();
```

An entry takes either an anchor or its own placement in the viewport:

| Option                  | What it does                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `anchor`                | The node to be placed beside, with `placement` and `offset`.                                   |
| `anchorRect`            | A part of the anchor to be placed beside; a plain value or an Observable, which moves it open. |
| `top`, `right`, …       | Edge offsets against the viewport, for an entry with no anchor.                                |
| `center`                | `'x'`, `'y'` or `'both'`: keep an unanchored entry in the middle of the viewport on that axis. |
| `dismissOnOutsidePress` | Put a backdrop underneath that closes the entry.                                               |
| `modal`                 | Put the backdrop underneath even when it doesn't close the entry, so the page takes no press.  |
| `scrim`                 | Dim the page under the backdrop with the theme's `scrim`. On by default for a modal entry.     |
| `environment`           | A node whose theme, text style and content colour the content should keep.                     |
| `zIndex`                | Order among open entries. Later entries paint on top by default.                               |

Three of those are worth spelling out.

**A backdrop closes on the wheel as well as on a press.** A backdrop
necessarily swallows the wheel, and a menu that swallowed scrolling
would feel stuck, so scrolling away closes it, which is what native
menus do. An entry without a backdrop, a popover or a tooltip, stays
open instead and follows its anchor through the scroll.

**A modal entry covers the whole page.** The layer is above the
application root, so an entry and its backdrop are drawn over
everything in the app, whatever `zIndex` a panel in it has: a `zIndex`
orders a node among its siblings, and the app root is the layer's
sibling. Hit testing follows the same order, so a press beside a modal
lands on its backdrop and never on a panel drawn under it. `modal`
gives an entry that doesn't close on an outside press that backdrop
anyway; `Dialog` sets it, so a dialog that can't be dismissed still
keeps the page from presses, as a browser's modal `<dialog>` does.
A modal entry's backdrop is also dimmed with the theme's `scrim`, which
fades in as it opens; `scrim: false` keeps it clear. A backdrop that is
only there to close a menu is never dimmed.

**An entry inherits nothing from the tree that opened it.** The layer
is mounted above the application root, so the content is nowhere near
the component that asked for it and none of the scoped values reach it:
a menu opened inside a dark panel comes out light. `environment` is the
fix, and the node to pass is usually the trigger. This was not found by
a test; it was found by opening the screen.

The entry keeps following that node while it is open. A dialog open
when the system turns dark, or when a theme the person picked arrives a
moment after they opened it, turns dark with the page behind it rather
than staying light until it closes.

## When to position, and when not to

Reach for `position` and the overlay layer when you are building
something the library does not have. Everything the library does have
is already built on them, and it carries the parts that placement does
not: focus discipline, dismissal, and a keyboard.

| You want                  | Use                                                      |
| ------------------------- | -------------------------------------------------------- |
| A badge on a corner       | `position: 'absolute'` inside a relative box             |
| A menu from a button      | `Menu` from `gesso-components`                           |
| A context menu            | `Menu` with `at={{ x, y }}` instead of an anchor         |
| A choice from a long list | `Select`                                                 |
| A modal                   | `Dialog`, which traps focus and returns it to the opener |
| A hint on hover or focus  | `Tooltip`, which wraps the element it describes          |
| A notification            | `Toast`                                                  |
| Anything else that floats | `useOverlay` directly                                    |

A `Dialog` traps the keyboard inside itself and hands it back to
whatever opened it on close. Escape closes the topmost overlay and
nothing underneath, and it needs no registry to do it: every overlay
that takes the keyboard traps focus, so the key cannot reach a dialog
below. `Tooltip` and `Toast` never take focus at all, since a tooltip
that could be tabbed into is a trap with no way out.

## What was checked

Twelve positioning cases and eleven stack cases in the layout
conformance suite are compared box for box against headless Chrome,
with the case root made `position: relative` so the containing block is
the same on both sides, and they agree to within a tenth of a pixel.
Between them they cover the tight inset, a single edge, both edges on
one axis, margins, the containing block skipping static ancestors, an
absolute inside a flex child, stack alignment, `selfX` and `selfY`, and
one case that wraps real text between two edges.

Anchored placement has no CSS equivalent that Chrome ships unflagged,
so it is covered by engine specs instead: the side, the alignment, the
offset, a flip on each axis, a shift, following a scroll, following an
anchor pushed down by a sibling that grew, and following an anchor
whose own offsets changed, and one places a node beside a part of its
anchor and follows it through a scroll. Four cover sticky anchors: an overlay that
follows a header to the scrollport edge and back when it lets go, one
anchored to a button inside such a header, one whose anchor is held in
a new place by a layout frame that moved no box at all, and one that
flips above its anchor because the held position leaves no room below.
One more lays out a list that is already scrolled and asserts that the
overlay starts beside where its anchor is seen rather than beside the
flow position. Five specs count the placements the frame made: following an anchor
costs the overlay's own placement and nothing else, a layout frame that
leaves every box where it was places no overlay, and neither does a
scroll frame that changes no sticky shift. The spec beside the example above asserts
what this page claims about it, that the panel starts under its button,
is shifted back inside the canvas, flips above the button when the
scroll leaves no room below, returns underneath when the button moves
back, and stays against the button when the notice above it grows.

Layout does not change with the renderer: boxes are computed once and
both Canvas2D and WebGPU read the result. Chrome is the only browser
any of these numbers were taken from.

## Next

[Virtualization](/layout/virtualization) is the other way a screen
stops paying for what it is not showing: a list of any length that
mounts only the rows in view.
