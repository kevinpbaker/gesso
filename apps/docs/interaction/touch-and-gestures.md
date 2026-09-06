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

## Two contacts: pinch and rotate

A second finger landing takes the gesture over. Whatever the first was
doing is **ended where it stands** rather than abandoned, so a
`draggable` in mid-drag gets a real `PanEnd` and puts the card down, and
the press stops synthesizing a `Click`, because a person who has put a
second finger down is no longer doing the thing they started.

From then until a contact lifts, the pair produces `PinchStart`,
`PinchMove` and `PinchEnd`, dispatched through the same dispatcher as
everything else. Each one carries:

| Field                         | What it is                                                  |
| ----------------------------- | ----------------------------------------------------------- |
| `scale`, `rotation`           | Cumulative from the moment the second contact landed        |
| `scaleDelta`, `rotationDelta` | The change since the previous event                         |
| `x`, `y`                      | The midpoint between the contacts, which a zoom holds still |
| `translateX`, `translateY`    | How far that midpoint moved since the previous event        |

Rotation is in degrees, which is what the `transform` property takes, so
neither end of the handoff converts. The gesture is claimed only once
the contacts have moved five per cent apart or four degrees round: two
fingers land a few milliseconds apart and never perfectly still, and a
gesture claimed on the first move reports a scale of 1.02 for what was
going to be a two-finger pan.

A third contact is ignored until the hand comes off. It is not a second
pinch, which is what every platform does with it.

The framework itself does nothing with a pinch. There is no
framework-owned zoom and nothing listening at the root, so a pinch that
nothing listens for costs one dispatch that returns immediately. The
zoom lives in [`pinchable`](/interaction/modifiers), a modifier an
element opts into, on the same terms as every other behaviour:

```ts
<Image src={photo} rootModifiers={[pinchable({ maxScale: 6 })]} />
```

It holds the point under the fingers still, which is the difference
between a photo viewer that feels like one and a viewer that scales
about its own centre and slides what you were looking at off the edge.
Ctrl with the wheel zooms it too, because that is what a trackpad pinch
reaches a browser as and it is the only way a mouse can zoom at all.

## Asking for a menu

A finger has no second button, so a held finger is how a touchscreen
asks for the commands that apply to something. A `ContextMenu` event
follows the `LongPress` at the same point, unless a listener called
`preventDefault()` on the LongPress, which is how a node that means to
be picked up rather than interrogated says so. A mouse raises nothing on
a hold: it has a secondary button, and a press of that button alone
dispatches `ContextMenu` directly and establishes no press at all, so
nothing is dragged, nothing is focused and no `Click` follows the
release.

The browser's own menu is suppressed on the canvas for the reason the
iOS callout is: it would land directly on top of the event the
application is about to receive.

```ts
<row modifiers={[contextMenu({ onOpen: at => (menuAt.value = at) })]}>
```

`Menu` has taken an `at` point and left the trigger to the caller since
it was written. This is the trigger.

## The end of a gesture carries its speed

`PanEnd` and `DragEnd` are `UiGestureEvent`s, and their `velocityX` and
`velocityY` are the speed the contact left at, in **pixels per second**,
which is the unit `UiSpringOptions.velocity` takes. That is the whole reason
they are there: a spring handed a velocity of zero starts from rest, so
a card thrown across the screen used to stop dead the instant the finger
left it. `draggable` passes the same pair to `onEnd`.

The speed is measured over the last 100 ms rather than over the whole
gesture, because a long slow drag that ends in a flick averages out to
nothing across the whole of it, and the flick is the part the person
meant. The samples live in a fixed ring, so a pointer move allocates
nothing.

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
cannot drag what the first one is holding. Being refused the press is
not the same as being unheard, though: every contact is reported to the
recognizer, which is what the pinch below is assembled from.

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

**The pinch was verified in Chrome and not on a hand.** Two synthetic
`pointerType: 'touch'` contacts spread apart over a real render-worker
shell reported a scale of exactly 2.00, and Ctrl with the wheel zoomed
about the point under the cursor. Neither is evidence about how a pinch
feels between two fingers on glass.

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
