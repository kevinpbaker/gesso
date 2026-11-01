---
description: 'ScrollArea: a scrolling region that fades the edge its content runs past and offers a way back to the top, with its props, how it moves, and what it draws on a still board.'
---

# ScrollArea

A scrolling region that says where it is. While there is more below,
the bottom edge fades; once it has moved off the top, the top edge
does; and far enough down, a button eases in that takes it back to the
start. Reach for it for any list or page taller than the box it lives
in, where a plain `scrollview` would leave a person guessing whether
the last row they see is the last row there is.

<LiveExample id="scrollarea" height="340" />

<<< @/src/examples/ScrollAreaExample.tsx#scrollarea

## Props

| Prop             | Default         | What it does                                                           |
| ---------------- | --------------- | ---------------------------------------------------------------------- |
| `padding`        | `0`             | Space around the content, inside the scroll bar, in pixels             |
| `paddingX`       | `padding`       | Space at the content's left and right                                  |
| `paddingY`       | `padding`       | Space at the content's top and bottom                                  |
| `fade`           | `24`            | How tall each fade is, in pixels; `0` for none                         |
| `fadeColor`      | `'background'`  | The colour the fades blend into: what the area sits on                 |
| `backToTopAfter` | none            | Shows the back-to-top button once scrolled this far, in pixels         |
| `backToTopLabel` | `'Back to top'` | What the button is called, and what the default one says               |
| `backToTop`      | Gesso's button  | The design's own drawing of the button, which the area makes pressable |

Layout props place the area itself, as on every control; its content
goes in as children and scrolls inside it.

## Padding goes inside

`padding` pads the content, not the area, as padding on a scroller does
on the web. Let the area run to the edges of what holds it and give it
the padding the page would have had: the scroll bar is then at the
page's edge and the rows keep their distance from the sides. A page
that pads itself around the area puts the bar that far in from the
edge, floating beside the content.

## The fades

Each fade is a band of `fadeColor` at its edge that thins to the same
colour at no opacity (a gradient stop's `opacity`), so it softens what
passes under it and draws nothing over the space between rows. A ramp
to `transparent` would pass through grey on the way, because a canvas
blends a gradient's stops without premultiplying. The fades ease in
and out with a `transition` timed `fast`, so they follow whatever the
motion vocabulary says `fast` is.

## Back to the top

The button is a small tonal [Button](/components/button) unless
`backToTop` gives an element of the design's own, which the area wraps
in a box that takes the press, the focus and the name. Pressed, the
area scrolls back over the vocabulary's `slow` on the clock where it is
drawn ([A clock for one part of the tree](/appearance/motion)): on a
settled clock it is back at once, which is what a design tool's board
shows, and on a slowed one it takes as long as the clock says.

## What this page was checked against

`ScrollArea.spec.ts` mounts it with `gesso-testing` and asserts that
the bottom fades at first and the top once scrolled, that both fade into
their own colour at no opacity, that the button appears past
`backToTopAfter` and scrolls back part way on one frame and all the way
in the end, and that a settled clock puts it at the top at once. The
spec beside the example checks the example as written.
