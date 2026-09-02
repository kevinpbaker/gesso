---
description: What a pointer event carries, how hit testing chooses who gets it, how a key reaches a component, what is focusable and in what order, and what the shell still does for input.
---

# Pointer and keyboard

A canvas is one DOM element, so the browser can say that something was
pressed and where, and nothing more. Everything after that is the
framework's: which node was under the point, whether it wants the
press, what the press did to hover and focus, and where the next key
goes.

The conversion happens once, at the edge. Browser events become
framework events at the boundary and application code never sees a
`PointerEvent`, a `KeyboardEvent` or a `deltaMode` again.

## One event model

Every event an application can listen for, whether it came from the
platform or was synthesized by the framework, travels through the same
dispatcher. A handler is a prop named `on` followed by the event in
PascalCase:

| Group    | Events                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Pointer  | `onPointerDown`, `onPointerUp`, `onPointerMove`, `onPointerCancel`                                        |
| Boundary | `onPointerEnter`, `onPointerLeave`                                                                        |
| Wheel    | `onWheel`                                                                                                 |
| Keyboard | `onKeyDown`, `onKeyUp`                                                                                    |
| Focus    | `onFocus`, `onBlur`                                                                                       |
| Editing  | `onBeforeInput`, `onInput`                                                                                |
| Gestures | `onClick`, `onLongPress`, `onDragStart`, `onDragMove`, `onDragEnd`, `onPanStart`, `onPanMove`, `onPanEnd` |

There is no separate gesture pipeline. A click, a long press, a pan and
a drag are synthesized from the press sequence and dispatched exactly
as a `pointerdown` is, so one mental model covers all of them and a
container can intercept a gesture the same way it intercepts a press.

A prop whose name matches `on` plus a capital letter but is not on that
list is an error naming the prop, rather than a handler that silently
never fires.

## What a pointer event carries

- **`x` and `y`**, in canvas pixels, measured from the top left of the
  drawing surface. These are the same coordinates layout works in, so a
  point can be compared with a node's box without conversion.
- **`buttons`**, the pressed-button bitmask the DOM reports.
- **`modifiers`**, an object of four booleans: `ctrl`, `shift`, `alt`,
  `meta`. Every event that could plausibly be modified carries one,
  including wheel and keyboard events.
- **`pointer`**, the device: `{ id, kind }`, where `kind` is `'mouse'`,
  `'pen'` or `'touch'` and `id` is the DOM's `pointerId`, which is what
  separates two simultaneous contacts. A `pointerType` the framework
  does not recognise reads as a mouse, because a device behaving like
  the default is better than one whose events are dropped.

`target` is the node the hit test found; `currentTarget` is the node
whose listener is running. The difference between them is the whole of
bubbling, and the example below is built on it.

## Who gets the press

<LiveExample id="pointer" height="300" />

<<< @/src/examples/PointerExample.tsx#targets

Hit testing walks the retained tree in the inverse of paint order:
last child first, because it painted on top, and descendants before the
node itself, because children paint over their parent's background. The
first box the point falls inside wins. Along the way the walk carries
the things that make a box's screen position differ from its layout
record:

- A clipping container rejects a point outside its box before testing
  anything inside it, so a child cut off by
  [`overflow`](/layout/overflow-and-scrolling) is not clickable either.
- A scroll container shifts the point by its offset before testing
  descendants, because their records are in pre-scroll content
  coordinates.
- Every node applies the inverse of its own transform, so a rotated or
  scaled box is tested in its own space rather than by its bounding
  rectangle. A degenerate transform, one scaled to nothing, draws
  nothing and is hit by nothing.

Four props decide whether a node takes part at all:

| Prop                             | Effect                                                                 |
| -------------------------------- | ---------------------------------------------------------------------- |
| `disabled`                       | The node and its whole subtree are inert: no hit, no focus, no keys    |
| `pointerEvents="none"`           | The node and its whole subtree are skipped by hit testing, as in CSS   |
| `hitTestable={false}`            | The node itself cannot be a target; its children still can             |
| `visible={false}`, `opacity={0}` | The subtree is skipped, matching the renderer, which paints none of it |

`hitTestable` is the one worth remembering: a decorative wrapper that
must not swallow presses meant for what is drawn inside it sets that,
not `pointerEvents`.

## Capture, click and cancel

A press is owned by the node it started on. From `pointerdown` until
the release, every move and the up are routed to that node even when
the pointer has left its box, so a widget keeps its own drag.

A `Click` is synthesized on release when three things hold: the press
travelled no more than four pixels (ten for a finger, which never holds
as still as a mouse), the `pointerdown` was not `preventDefault()`ed,
and no gesture claimed the press. A `pointercancel` ends the press and
never produces a click.

The recognizer resolves each press into at most one gesture. Moving
more than eight pixels (twelve for a finger) before the hold time makes
it a **Pan**; holding still for 500 ms makes it a **LongPress**, and
moving after that makes it a **Drag**. A tap produces no gesture events
at all, which is why click synthesis lives outside the recognizer.

A press is also owned by one contact. While a press is in flight, a
second finger's moves and releases are ignored, so a second contact
cannot drag what the first one is holding.

## Propagation

Dispatch mirrors the DOM: capture from the root down to the target's
parent, then the target's own listeners, then bubble back up to the
root.

| Call                         | What it does                                                 |
| ---------------------------- | ------------------------------------------------------------ |
| `stopPropagation()`          | Ends the current phase and skips every remaining phase       |
| `stopImmediatePropagation()` | Also skips the rest of the listeners on the current node     |
| `preventDefault()`           | Cancels the framework's own default behaviour for that event |

`preventDefault` is advisory, and what it cancels depends on the event:
on a `pointerdown` it suppresses click synthesis and focus on press; on
a `pointermove` it stops the move being read as a gesture; on a wheel it
stops the automatic scroll; on a `keydown` for Tab it stops focus
moving. This is documented per consumer rather than inherited from a
browser, because there is no browser default here to mirror.

`Focus`, `Blur`, `PointerEnter` and `PointerLeave` do not bubble. They
are delivered to the target only, exactly as the DOM's `focus` and
`mouseenter` are.

A listener that throws is reported and the dispatch continues. One
broken `onClick` must not stop an event reaching the rest of the tree.

## Hover and press state

While nothing is pressed, each move hit-tests and, when the hovered
node changes, `PointerLeave` and `PointerEnter` fire on the boundary
between the two ancestor chains. The lowest common ancestor is in both
chains and never fires, which is why moving between two chips inside
one panel does not leave the panel.

Hover is state, not paint. A `<button>` publishes `hovered` and
`pressed` as `visualState`, and nothing draws a colour from that on its
own, because what a hovered control looks like belongs to the
application. The examples on this site share two `interactive`
modifiers that say what a hovered and a pressed control look like here,
and both are declared once at module scope rather than per call site, so
the two colours are settled in one file. Writing the same options inline
would work too: a modifier's arguments are compared by value, so an
`interactive({ ... })` in the render is the same modifier on the render
after it and keeps the pointer state it is holding.

The cursor is resolved the way CSS inherits it: the node's own
`cursor`, else the nearest ancestor's, so a button sets
`cursor="pointer"` once and its label inherits it. An editable shows
the I-beam without being asked.

A finger's hover is dropped when it lifts, since the finger is no
longer anywhere. A mouse keeps its hover, which is what a mouse user
expects. Without that rule a tap leaves the tapped node lit for good.

## Keys

<<< @/src/examples/PointerExample.tsx#stops

A key is dispatched to the focused node and bubbles from there. With
nothing focused it goes to the application's root element, the one
`renderRoot` or `createApp` was given, so a listener there answers
Escape or Space whether or not anything has focus, and a listener
partway down the tree hears nothing.

After the application's listeners, and only if none of them called
`preventDefault()`, the runtime applies its own defaults in this order:

1. The focused editable's editing keys. See
   [text editing and IME](/interaction/text-editing-and-ime).
2. Find: the platform's find shortcut opens a session and Escape closes
   one.
3. The canvas text selection: copy, select all, or clear.
4. Tab moves focus to the next focusable node, Shift+Tab to the
   previous.

A key one of those handles is marked default-prevented, which is how
the shell learns to cancel the browser's own default for it.

## Focus

A node is focusable when it is a `<button>` or an `<editabletext>`, or
when it says `focusable` explicitly. `focusable={false}` opts a button
out; nothing inert is ever focusable; the graph root never is.

Tab order is document order, parents before children, and it wraps at
both ends. There is no `tabIndex`, so the way to change the order is to
change the tree.

Pressing focuses **the nearest focusable node at or above the press**.
The press usually lands on a label or a box inside a control, and
walking up is what makes clicking a tab select it and leave the arrow
keys working. A press with nothing focusable above it leaves focus
where it was: pressing the background is not a request to blur.

Moving focus by keyboard scrolls the focused node into view; moving it
by pointer does not. A person who clicked something can already see it,
and scrolling would pull it out from under the pointer still resting on
it.

Components reach focus through `FocusService`, injected like any other
service. It offers `focus`, `blur`, `focusNext`, `focusPrevious`,
`trap` and `releaseTrap`, and publishes `focused` and `trapped` as
state a control can bind to.

`trap(node)` confines focus to a subtree until `releaseTrap()`: the
traversal collects only that subtree, and focusing anything outside it
is refused, so both halves of a modal dialog come from one rule. Traps
nest, each release restores the control that opened it, and a trapped
subtree that simply unmounts hands the keyboard back without having to
sequence its own teardown.

## What the shell still does

In the worker configuration the tree, the layout, the hit tester and
every controller above are in the render worker. The main thread keeps
the canvas and the plumbing, and its input job is small but not empty:

- **Listen and forward.** Pointer, wheel and key events are converted
  to plain messages and posted. Each carries the DOM event's own
  timestamp, so input latency is measured from when the person acted
  rather than from when the worker got round to it.
- **Capture the contact.** `setPointerCapture` on the press, so a drag
  that leaves the canvas is still delivered. A finger captures
  implicitly and a mouse does not; capturing both makes them behave
  alike.
- **Cancel the two defaults that are always wrong.** Tab must not move
  focus out of the canvas, and the select-all shortcut must not select
  the page around an app selecting its own text. Both have to be
  cancelled synchronously, and the worker's answer cannot arrive in
  time, so the shell cancels them itself. The find shortcut is the same
  problem and is a flag, off by default: taking it from an app with no
  find of its own would leave the person with neither.
- **Answer for the wheel from a cache**, which
  [overflow and scrolling](/layout/overflow-and-scrolling) covers in
  full.
- **Mirror the cursor** onto the canvas element, since the runtime
  knows which node is hovered and only the DOM can show a cursor.
- **Prepare the surface**: `touch-action`, `user-select` and two
  `-webkit-` properties that stop a long press raising the iOS callout
  menu and a tap flashing a grey box.
- **Carry an assistive technology's input in.** An off-screen DOM tree
  mirrors the semantics, and a press or a focus move made there arrives
  as an action for the runtime to apply, rather than as a pointer event
  at a coordinate.

Single-thread configuration differs in one place: with the runtime on
the main thread, the platform adapter asks the controllers directly and
cancels the browser's default from the real answer, with nothing
cached. Everything else on this page behaves the same either way.

## Limits

**Touch was not verified on a physical device.** Every behaviour on
this page that depends on `pointerType` is covered by unit tests, and
was exercised in Chrome on Linux with synthetic touch pointers against
a real render-worker shell: a drag scrolled a container and coasted,
the same drag from a mouse pointer did not, and hover cleared on
release. No phone or tablet was available, so the iOS-specific surface
settings above are inert where they were tested, and how a flick feels
in a hand is unmeasured.

**Two-finger gestures are not here.** The controller knows which
contact owns a press, which is the bookkeeping a pinch recognizer would
need, and stops there. Nothing synthesizes Pinch or Rotate.

**Hit targets are exact rectangles.** A tap two pixels outside a small
control does nothing, where a browser would apply touch adjustment.
Size controls for a finger rather than relying on slop.

**Nothing reads `visualViewport`.** When a soft keyboard covers the
bottom of the window, the runtime does not know, and a caret can sit
behind it.

## Next

[Text editing and IME](/interaction/text-editing-and-ime) is what
happens after a key reaches a field, and
[TextInput](/components/text-input) is the component built on it.
