---
description: What clips, what scrolls, where a scroll offset lives, and what the main thread is left doing while a list scrolls in the render worker.
---

# Overflow and scrolling

[Layout basics](/guide/layout-basics) ends with every box at the size
its content and its constraints agreed on. This page is about the case
where they do not agree: content bigger than the box it was given.

Nothing is cut off by default. A child paints outside its parent, as
CSS's `overflow: visible` does, and one property changes that.

## `overflow`, on any container

| Value                   | What the container does                              |
| ----------------------- | ---------------------------------------------------- |
| `visible` (the default) | Children may paint outside the box                   |
| `hidden`                | Children are clipped to it, following `borderRadius` |
| `scroll`                | Clips, and becomes a scroll container                |
| `auto`                  | The same as `scroll`                                 |

One property covers both axes; there is no `overflowX` or `overflowY`.

Clipping is not only about paint. The hit tester rejects a point
outside a clipping node before it tests that node's children, so a
child cut off by the clip is not clickable either, which is the answer
you want and the one that is easy to get wrong by clipping in the
renderer alone.

`auto` and `scroll` behave alike here because scrollbars are overlays:
a bar appears on an axis whose content actually overflows, and takes no
layout space on any axis. CSS distinguishes the two by whether a gutter
is reserved, and there is no gutter to reserve.

## Two ways to have a scroll container

`<scrollview>` and `overflow="scroll"` both scroll, and the difference
between them is a flex difference worth knowing before you pick one.

- **`<scrollview>` is a window over content.** It measures its children
  with the scrolling axis unbounded, so each child keeps the size it
  asked for and the container scrolls to reach the rest.
- **`<column overflow="scroll">` is a flex column that clips and
  scrolls.** Its children are still flex items, so a child with a
  definite size and no content-derived minimum shrinks to fit the
  column instead of overflowing it.

`flexShrink={0}` is what stops that. Without it the boxes below are
squeezed into 180 pixels between them, and there is nothing to scroll:

```tsx
<column height={180} overflow="scroll">
  <box height={40} flexShrink={0} />
</column>
```

Either way the container needs a definite size on the scrolling axis.
A `<scrollview>` given a loose bound takes its content's height, and
content that fits its container has nothing to scroll. Its own
`maxHeight` is such a bound: a list in a popup with `maxHeight={300}` is
as tall as its rows until they reach 300, and scrolls after that. A `height`, or
`flex={1}` inside a parent that has one, is what gives it a viewport.

A scroll container scrolls its main axis, which is vertical unless
`direction` says otherwise. `direction="row"` makes a horizontal one,
and a `<row overflow="scroll">` is horizontal already.

## A list that scrolls

<LiveExample id="scrolling" height="340" />

<<< @/src/examples/ScrollingExample.tsx#list

Use the wheel over the list, and use it again once the list is at the
bottom: the second wheel scrolls this page, because the list does not
keep what it cannot use. That is `overscrollBehavior`, below.

## Where a container is scrolled to

`scrollX` and `scrollY` are ordinary properties, in logical pixels,
measured from the content's start. Ordinary means bindable, which is
the whole of programmatic scrolling: write the cell the property is
bound to, and the container is laid out at the new offset on the next
frame. A list rebuilt after a route change is laid out where it was
left, before it paints, for the same reason.

The engine clamps the offset to the container's **content extent**,
which it measures from the children it placed plus the container's own
padding. Two things follow:

- An offset written against content that has since shrunk comes back
  into range on its own, rather than leaving a list scrolled past its
  last row.
- The property and the truth can differ. A wheel writes the offset
  unclamped, so `scrollY` may name a place the list never went. What
  the container settled on is what layout keeps, and it is what
  `scrollPosition` reports.

## Being told that it scrolled

A wheel is not the only thing that moves a list. A scrollbar drag, a
finger, and the reveal that keeps a newly focused row on screen all
write the offset from inside the runtime, so an application that wants
to know where a list is asks for the offset rather than listening for
an event:

```tsx
<scrollview scrollY={at} modifiers={[scrollPosition({ onChange: offset => (at.value = offset.y) })]}>
```

`scrollPosition` takes `onChange`, called with the effective `{ x, y }`
whenever it changes, and `onSettled`, called once when it stops
changing. `onChange` fires on every frame of a smoothed scroll, because
that is what happened; a route persisting where its list was wants
`onSettled` instead of writing a value on every frame that nobody reads
until later.

There is no `onScroll` event, deliberately. Half the causes above are
not input at all, so an event from the input stack would stay silent
for them; and the runtime already has exactly one mechanism for "this
node's box changed on this frame", which is what the modifier is built
on.

An `<editabletext>` reports through it too. Its offset is how far it
has scrolled its own text, by the wheel, its scrollbar, the caret
following typing, or the clamp when text is deleted.

## Scrolling two things together

What `onChange` reports arrives after the frame is laid out, so a
second container whose `scrollY` is bound to it is painted a frame
behind. For something that has to line up row for row, such as a line
number gutter beside a field or a row header beside a grid, name the
leader with `scrollWith` instead:

```tsx
<row>
  <box overflow="hidden" width={40} height={420} scrollWith={field} scrollWithAxis="y">
    {/* one row per line, in the field's font and line height */}
  </box>
  <editabletext ref={node => field.next(node)} multiline height={420} textWrap="none" />
</row>
```

The follower takes the leader's offset in the same layout pass that
settles it, so the two are painted in step whatever moved the leader.
`scrollWithAxis` is `both` by default. The follower's own `scrollX` and
`scrollY` are ignored on a followed axis, it shows no scrollbar, and a
wheel over it scrolls the leader. An `overflow="hidden"` box that
follows is scrolled all the same, the way script scrolls one in CSS.
The offset is clamped to the follower's own range, so give it content
as tall as the leader's.

## The wheel

A wheel is dispatched to the node under the pointer first, so a handler
can take it; `preventDefault()` on that event opts the whole subtree out
of automatic scrolling. Otherwise the runtime walks up from that node
and gives the delta to the first scroll container with room for it in
the direction of travel. Room means room to move, not room for the
whole delta, so a fast flick clamps at the end of a list rather than
jumping out to the page.

Two properties steer what happens at the ends of that walk:

| Prop                 | Values                          | What it decides                                                         |
| -------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| `scrollBehavior`     | `'instant'`, `'smooth'`         | Whether a notched wheel animates this container or jumps it             |
| `overscrollBehavior` | `'auto'` (default), `'contain'` | Whether a delta this container cannot use chains outwards or stops here |

`'contain'` is what an application filling the viewport wants on its
root, so that nothing outside it moves. The default is what a canvas
embedded in a document wants, and it is why the list above hands this
page its scrolling back.

An application that is the whole page also wants the page itself to
keep still. A scroll handed back to a page that can't scroll is still a
gesture to the browser, and on a Mac it stretches the whole page,
showing white behind it, or takes a sideways swipe as Back. One line of
CSS on the page says not to, and it covers the moment before the first
frame, too:

```css
html,
body {
  overscroll-behavior: none;
}
```

The `create-gesso-app` templates have it.

Smoothing is applied only where it helps: a wheel with detents, which
delivers one large jump per notch and nothing in between. A trackpad
already sends a fine-grained inertial stream, and animating that would
lay one inertia curve over another, so a device that looks precise is
left alone. The evidence read is the delta's unit and the legacy
`wheelDeltaY` field, and only a positive answer smooths.

One event can't always tell. Chrome on a Mac reports a trackpad's
`wheelDeltaY` as three times its pixel delta, so a step of 40 pixels
reads as a whole detent, and a flick passing through that speed had
single steps smoothed among instant ones, which reads as stutter. A
mouse wheel never sends an event that doesn't look notched, so once one
arrives the wheel is taken to be precise for as long as events keep
coming (400 ms after each), which covers a gesture and its momentum.

A trackpad also sends on its own clock rather than the display's, so at
a steady speed a frame gets two of its steps, now and then one or three,
and on a 120 Hz display sometimes none. Applied as they come, a steady
flick moves the page unevenly, which reads as judder; evening it out by
waiting for steps puts the page a frame behind the hand. The runtime
does what a browser does for a native page instead: each frame puts the
page where the input will have reached when the frame is shown, the
steps so far plus their velocity times the time since the last one,
read from the last few steps only and never more than a frame and a
half ahead. The steps come out even and the page keeps up. A gesture's
first step goes as it is. A frame never moves against the way the
latest step went, so a prediction that ran ahead as a flick slowed
holds until the steps catch up, and one left ahead when they stop stays
there, a frame's travel on, rather than pulling back, which the eye
reads as a spring. Against an edge the steps are judged from where they
have really taken the container, so the list stops at the edge and
stays. Every step counts: several arriving between two frames add up.

A trackpad's steps can be a fraction of a pixel, and the offset keeps
them exactly, so they add up. What's drawn lands on a whole device pixel,
as a browser draws scrolled content: text drawn between pixels
rasterises differently each frame and shimmers as a flick slows.

`scrollBehavior="instant"` opts a container out; under a reduced-motion
preference the animation snaps, which lands the same offset in one
frame.

That classifier was checked in a browser against a real mouse, which is
the only place it could be, and the first version of it turned out to
be wrong on a second monitor whose scaled deltas were a pixel short of
a whole detent. The trackpad half was found by reading what Chrome
reports and is covered by specs; it has yet to be watched on a Mac
trackpad.

A wheel's delta is only a distance when the browser reports it in
pixels. Chrome does; Firefox reports lines, three to a notch, and page
mode means a screenful. The runtime converts both, so a notch moves a
container about as far on either. The conversion is covered by specs;
the browser it has been watched in is Chrome.

## Scrollbars

A container whose content overflows draws a thin overlay thumb along
the end edge of each overflowing axis, sized by the ratio of viewport
to content and placed by the offset. It shows while the container is
scrolling and fades out afterwards.

The bars are interactive, and their geometry lives in one place, so what
is drawn is exactly what the hit tester grabs: a press on the thumb
drags it, a press on the track beside a visible thumb pages one
viewport towards the pointer, and coming near a bar while the list is
idle reveals it so there is something to grab. A hidden bar takes no
press: clicks go through to the content under it.

Both renderers draw them from the same geometry, and a parity spec runs
the same trees through Canvas2D and WebGPU and compares the resulting
draws, including a scrolled list with a sticky header. WebGPU is used
only where the browser has it and falls back to Canvas2D otherwise, so
Canvas2D is the one every reader of this page is looking at unless they
asked for the other.

## Fingers

A finger produces no wheel events, so touch scrolling is its own path:
a pan on the root that no one else claimed scrolls the container under
it, the content following the finger, and a release above a threshold
coasts a projected distance through the same smooth path a wheel uses.
When the innermost container reaches its end the next one out takes
over, as chaining does for the wheel.

A widget that owns its own drag keeps it by calling `stopPropagation()`
on the pan, which is how a slider or a split pane avoids scrolling the
list it sits in. Touch scrolling is touch only: a mouse drag inside a
scroll container is how text is selected, and a pen is used for exactly
that precision.

**This was not verified on a real touchscreen.** The behaviour is
covered by specs and was exercised through Chrome's touch emulation,
which reports the right pointer type but cannot say how a flick feels
in a hand.

## Keys

A bare scroll container does not answer the arrow keys. What scrolls
from the keyboard is focus: moving focus to a node that is off screen
scrolls every scroll container above it just enough to bring the node
inside, eight pixels from the nearest edge, and does nothing when it is
already visible. A node bigger than its container can't be shown whole,
so it's brought in by its start, unless it already fills the view, as
a browser's `focus()` does: a page that opens with its first section
focused stays at its top. A section that starts below some padding is
still brought in eight pixels from the edge, so a page that focuses it
only to have it read out says `autoFocus({ preventScroll: true })` or
`focus(node, { preventScroll: true })` and stays where it is. Clicking a
control does not reveal it, because a
person can already see what they pressed and moving it would pull it
out from under the pointer resting on it.

A component that owns a list of rows maps the keys itself.
`LazyList` and `DataTable` in `gesso-components` answer to the arrows,
`PageUp` and `PageDown`, `Home` and `End` by moving the selection,
which then reveals itself through the same mechanism. See
[using components](/guide/using-components).

A highlight that moves without focus has to ask. A combobox's arrows
walk its list while the caret stays in the field, so nothing is
focused to reveal; it calls `ScrollService.scrollIntoView(node)`, which
scrolls the containers above the node the same way, by the same
amount, and leaves a visible node where it is:

```tsx
const scroll = ctx.inject(ScrollService);
ctx.effect(active, index => {
  const row = rows.get(index);
  if (row !== undefined) {
    scroll.scrollIntoView(row);
  }
});
```

## What the main thread is left doing

In a browser, scrolling a page is the compositor's job and the main
thread mostly hears about it afterwards. Here, layout, the scroll
chain, the offsets, the sticky shifts and the scrollbars are all in the
render worker, and the shell around it is left with one genuinely hard
decision: whether to call `preventDefault()` on the DOM wheel event.

It has to answer synchronously, inside the handler, and the runtime is
a `postMessage` away. Preventing every wheel makes the canvas a scroll
trap in the page around it; preventing none makes one wheel scroll two
things. So the worker pushes the answer ahead of the event: after any
frame that changed it, it reports which way the pointer's scroll chain
can still move, and the shell reads that from a cache when a wheel
arrives. The same report says whether anything in the tree scrolls at
all, which is what the canvas's `touch-action` is set from, since that
is latched when a finger lands and there is no position to ask about
yet.

The cost is that the answer can be one frame old: just after a
container reaches its end, one notch may be swallowed; just after it
leaves its end, one may reach the page. That is the same bet a browser
makes when it scrolls on the compositor thread.

**Single-thread configuration differs here, and only here.** With the
runtime on the main thread the wheel handler asks the controller
directly and prevents the default from the real answer, with nothing
cached and nothing stale. Everything else on this page behaves the
same in both configurations.

## Next

[Sticky positioning](/layout/sticky) is the other half of a scroll
container: a header that holds at its edge while its rows travel under
it.
