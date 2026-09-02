---
description: How a finger differs from a cursor, which gesture a press resolves to, why a drag is a long press first, and what makes a scroll container answer to a pan.
---

# Touch and gestures

A finger is not a small mouse. It arrives through the same Pointer
Events, so a touchscreen was never silent, but almost everything worth
doing with it follows from knowing which of the two it was: a tap moves
further than a click, a hover ends when the contact lifts, and nothing
at all scrolls a container, because a finger produces no wheel.

The device therefore reaches the application. Every pointer event
carries `pointer`, a `{ id, kind }` where `kind` is `'mouse'`, `'pen'`
or `'touch'` and `id` is the DOM's `pointerId`. A `pointerType` the
framework does not recognise reads as a mouse, on the grounds that a
device behaving like the default is better than one whose events are
dropped.

The recognizer copies the device onto the gestures it synthesizes too,
so a listener that has to size a drag handle for a finger learns it from
the `DragStart` rather than from a raw press it never saw.

## One press, one gesture

<LiveExample id="gestures" height="420" />

<<< @/src/examples/GesturesExample.tsx#pad

Every press resolves to at most one gesture, and the box above reports
which one it was. There is no separate gesture pipeline: a Pan, a
LongPress and a Drag are synthesized from the press sequence and
dispatched through the dispatcher that carries a `pointerdown`, so a
container intercepts a gesture exactly the way it intercepts a press.

| The press                                | What it becomes                              |
| ---------------------------------------- | -------------------------------------------- |
| Moves past the slop before the hold time | `PanStart`, `PanMove`, `PanEnd`              |
| Holds still for 500 ms                   | `LongPress`, once                            |
| Holds still, then moves                  | `DragStart`, `DragMove`, `DragEnd`           |
| Neither, and is released                 | No gesture at all, and a synthesized `Click` |

Click synthesis lives outside the recognizer, which is why a tap
produces no gesture events: a `Click` is dispatched on release when the
press did not travel beyond the click allowance, the `pointerdown` was
not `preventDefault()`ed, and no gesture claimed the press. A pan
therefore never ends in a click, and a row the finger scrolled off is
not activated.

Two thresholds are widened for a finger, in opposite directions:

| Threshold       | Mouse or pen | Finger |
| --------------- | ------------ | ------ |
| Click allowance | 4 px         | 10 px  |
| Gesture slop    | 8 px         | 12 px  |
| Long press hold | 500 ms       | 500 ms |

The click allowance is widened because a tap is not a click held still:
the contact point moves as the finger flattens and lifts, and four
pixels is routinely exceeded by a tap the person considers stationary.
At the narrow allowance roughly every other tap did nothing, silently,
because `PointerUp` fired and no `Click` followed it. The gesture slop
is widened for the opposite reason: at eight pixels a deliberate long
press wanders into a Pan before the hold time elapses, which put
`LongPress` out of a finger's reach entirely. The gesture slop is read
once at the press, so the threshold cannot change under a gesture
already being measured against it.

The two are measured differently, which is worth knowing when a
threshold looks off by a pixel: the click allowance is compared per
axis against the press point, and the gesture slop is a straight-line
distance from it.

## A drag is a long press first

<<< @/src/examples/GesturesExample.tsx#tiles

This is the one thing on this page most likely to cost an afternoon. In
this input model a **Drag is a long press followed by a move**, and a
plain press-and-move is a **Pan**. A divider, a slider thumb, a card the
pointer picks up immediately: all of those are Pans. Listening for
`onDragMove` on one of them produces a control that sits still for half
a second and then works.

`draggable()` defaults to the Pan for that reason, and
`draggable({ start: 'longPress' })` selects the other, which is what a
list that reorders on a hold wants. The option is fixed when the
modifier attaches, because that is when its listeners are registered;
changing it later warns rather than half applying.

The movement is written as a translation on `transform`, through the
[override cascade](/interaction/modifiers), so the node's layout does
not change: its box stays where it was, its neighbours do not shuffle,
and a tile dragged back to where it started has no transform at all
rather than an identity one.

A gesture a widget owns has to stop propagating. That is not
bookkeeping: it is the whole opt-out mechanism for the next section.

## A finger scrolls, and a mouse does not

<<< @/src/examples/GesturesExample.tsx#list

Nothing in that list asks to be panned. The runtime's touch scroller
listens for pans **at the root, in the bubble phase**, so a pan reaches
it only if nothing between the pressed node and the root claimed it. A
widget that owns its drag keeps it by calling `stopPropagation()`, with
no new API, no `preventDefault` convention and no list of exceptions
inside the scroller.

- **The content follows the finger.** Each move scrolls by the travel,
  inverted, so dragging upwards moves the content up and the offset
  down.
- **The container is resolved on every move**, not at the start, so a
  list that has reached its end hands the rest of the gesture to the
  page it sits in without the finger being lifted.
- **A flick coasts.** The distance is projected from the release speed
  and handed to the same smooth path a programmatic scroll uses, so one
  animator owns the offset. Speed is measured over the last 100 ms,
  because a long slow drag ending in a flick averages out to nothing
  across the whole gesture.
- **Scrolling reveals the scrollbars.** The usual reveal is driven by
  hovering near the bar, and a finger never hovers, so without this a
  touchscreen would never see where it is in the content.

Touch only, deliberately. A mouse drag inside a scroll container is how
text is selected and a pen is used for exactly that precision, so
reading either as a scroll would take something away. The spec beside
the example drives the identical drag twice, once from a `touch`
pointer and once from a mouse, and only one of them moves the list.

Overscroll does not rubber-band. The layout engine clamps the offset to
the content on every pass, so an overscrolled offset cannot survive a
frame.

## Hover, and who owns a press

A finger's hover is dropped when it lifts, because the finger is no
longer anywhere. Without that rule a tap leaves the tapped node lit for
good, and the next tap moves the stuck highlight rather than clearing
it. A mouse keeps its hover, which is what a mouse user expects.

A press belongs to the contact that started it. While one is in flight
a second finger's moves and releases are ignored, so a second contact
cannot drag what the first one is holding. That bookkeeping is also what
a pinch recognizer would need, and there is no pinch recognizer.

## What the shell prepares

The canvas starts life with a document's defaults, and an application
wants none of them. One call sets all of it before any event arrives:

| Setting                       | What it stops                                               |
| ----------------------------- | ----------------------------------------------------------- |
| `touch-action: none`          | The browser panning or zooming the page under the app       |
| `user-select: none`           | The document's own selection fighting the canvas selection  |
| `-webkit-touch-callout: none` | A long press raising the iOS callout menu over a LongPress  |
| `-webkit-tap-highlight-color` | A tap flashing a grey box over whatever the browser guessed |

The shell also calls `setPointerCapture` on the press. A finger captures
implicitly and a mouse does not, so capturing both is what makes a drag
that leaves the canvas behave the same either way. A contact that ended
between the event and the call is not a reason to lose the press, so
the failure is swallowed.

One more thing is the shell's, and only in the worker configuration: a
phone raises its soft keyboard for a focus a person's gesture caused and
for no other. The runtime's answer to a press arrives a frame later,
inside a message handler rather than a gesture, so the shell re-takes
focus from the `pointerup` of the press that started editing. It does
that only for a press that started editing, because asking again while
the keyboard is up makes it blink. The single-threaded configuration
needs none of this and does not do it, since there the answer runs
inside the `pointerdown`'s own call stack.

## Limits

**None of this was verified on a physical touchscreen.** No phone or
tablet was available. The behaviours above are covered by unit specs for
the scroller, the pointer controller, the recognizer and the editing
proxy, by the spec beside the example on this page, and by a session in
Chrome on Linux driving synthetic `pointerType: 'touch'` events at a
real render-worker shell: a touch drag scrolled a container and coasted
past the drag distance, the same drag from a mouse scrolled nothing, and
hover cleared on release. Chrome implements neither `-webkit-` property,
so the two iOS settings are inert where they were tested, and the soft
keyboard behaviour is an iOS one that cannot be observed off iOS.

**No pinch, no rotate, no two-finger gesture of any kind.** Nothing
synthesizes them. An application that needs one listens for raw pointer
events and tracks the contacts by `pointer.id`, which is the same
bookkeeping a recognizer would sit on.

**Hit targets are exact rectangles.** A tap two pixels outside a small
control does nothing, where a browser would apply touch adjustment. Size
controls for a finger rather than relying on slop.

**Scrollbars are mouse-sized**, 6 px thick with a 16 px reveal zone,
which is less pressing than it sounds now that dragging the content is
the gesture a finger reaches for anyway.

**Nothing reads `visualViewport`.** When a soft keyboard covers the
bottom of the window the runtime does not know, and a caret can sit
behind it.

## Next

[Pointer and keyboard](/interaction/pointer-and-keyboard) is the event
model underneath all of this, and
[overflow and scrolling](/layout/overflow-and-scrolling) is what the
touch scroller is driving.
