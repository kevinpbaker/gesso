---
description: 'SplitPane: two panes and a divider the user can drag or arrow, reported as a fraction of the container.'
---

# SplitPane

Two panes and a divider the user can move. Reach for it when both
halves of a screen matter and how much room each gets is the reader's
call: a list beside the record it selects, a source pane beside a
preview, a tree beside an editor.

When the split is yours to decide rather than theirs, this is the wrong
control: a `row` with a `flex` on each child says the same thing with
no divider and no keyboard surface. When one of the two panes is only
sometimes wanted, an [accordion](/components/accordion) or a
[tab strip](/components/tabs) hides it outright instead of squeezing
it.

<LiveExample id="splitpane" height="280" />

<<< @/src/examples/SplitPaneExample.tsx#splitpane

Drag the divider, or tab onto it and use the arrows. It stops at 20%
and 80%, and the line underneath is the same cell the panes are sized
from.

## Props

| Prop            | Type                      | Default          | What it does                                                        |
| --------------- | ------------------------- | ---------------- | ------------------------------------------------------------------- |
| `split`         | `number`                  | none             | Where the divider sits, 0 to 1. Supplying this makes it controlled. |
| `defaultSplit`  | `number`                  | none             | The starting position, when the component owns it.                  |
| `onSplitChange` | `(split: number) => void` | none             | Called with the clamped fraction, on a drag and on a key.           |
| `first`         | `UiChild`                 | an empty row     | The left pane, or the top one.                                      |
| `second`        | `UiChild`                 | an empty row     | The right pane, or the bottom one.                                  |
| `direction`     | `'row' \| 'column'`       | `'row'`          | Whether the panes sit side by side or stacked.                      |
| `min`           | `number`                  | `0.1`            | The smallest the first pane goes.                                   |
| `max`           | `number`                  | `0.9`            | The largest it goes.                                                |
| `label`         | `string`                  | `'Resize panes'` | The divider's accessible name. It is not drawn.                     |

Supplying neither `split` nor `defaultSplit` leaves the divider at
`0.5` and self-managing. Supplying both throws, naming the component
and both props.

`direction`, `first` and `second` are read once, when the component is
built, because the body runs once: they choose which elements exist
rather than being bound to them. Everything else may be a plain value
or an Observable, and the shared layout props on
[the library page](/components/) apply here too.

## Controlled and uncontrolled

```tsx
// Controlled: the application owns the fraction.
<SplitPane split={ratio} onSplitChange={next => (ratio.value = next)} first={list} second={detail} />

// Uncontrolled: the component owns it, and reports changes if asked.
<SplitPane defaultSplit={0.3} first={list} second={detail} />
```

The controlled form is what to reach for when the split is worth
keeping: it is one number, so a screen that restores where the user
left the divider is a cell you save and hand back. As everywhere else
in the library, a controlled component that is handed no `onSplitChange`
never moves.

## Sizing it

The component's own root is 100% wide and 100% tall, so it takes the
size of whatever holds it and needs to be given one. The example puts
it in a `box` with a `height`. A parent that does not give it a
definite size along the split axis leaves the fraction with nothing to
be a fraction of.

Both panes clip, and both opt out of flex's automatic minimum. That is
deliberate: a flex item's automatic minimum is its content's
min-content size, so a pane holding a line wider than its share would
otherwise refuse to shrink and stop the divider partway across, while
the reported position carried on as if nothing were wrong. The fraction
is the size; the content is not an opinion about it.

## Dragging

The divider follows the pointer from the first pixel, because it
listens for a **Pan**. In this input model a Drag is a long press
followed by a move, which is what a reorder is; a divider that sat
still for half a second before catching up would read as broken. The
pan also stops propagating, so a scroll container above the panes does
not scroll while the divider is being moved.

Turning a pointer position into a fraction needs the track's geometry,
which the component gets by measuring its own container rather than by
reaching into the engine. That is why the divider works inside a
scrolling page: the box it measures is where the track is seen, not
where it would be with nothing scrolled.

The divider shows `col-resize` in a row and `row-resize` in a column,
and carries the library's shared hover, press and focus ring.

## Keyboard

The divider is a tab stop of its own, which is the point: a split a
mouse can move and a keyboard cannot is a split half the people using
the screen cannot move.

| Key                        | What it does                                       |
| -------------------------- | -------------------------------------------------- |
| `ArrowLeft` / `ArrowRight` | In a row, moves the divider by 2% of the container |
| `ArrowUp` / `ArrowDown`    | In a column, moves it by 2%                        |
| `Home`                     | Jumps to `min`                                     |
| `End`                      | Jumps to `max`                                     |

All four arrows are bound in both directions. The two across the split
ask for the position the divider already has, so they move nothing and
are still consumed, which keeps them from reaching a scroll container
above. Every step is clamped to `min` and `max` before it is reported,
so a key at the end of the range reports the end of the range rather
than something out of bounds.

## Semantics

| What   | Value                                                                |
| ------ | -------------------------------------------------------------------- |
| Role   | `separator`, on the divider, which is the only part that takes focus |
| Name   | `label`, defaulting to `Resize panes`                                |
| Value  | `valueNow`, `valueMin` and `valueMax`, as whole percentages          |
| States | None. A divider has nothing to be                                    |

The percentages are rounded from the fractions, so a `split` of `0.4`
with the default bounds announces 40 in a range of 10 to 90. They are
bound rather than read once: dragging the divider updates what an
assistive technology sees without anything re-rendering.

The panes themselves carry no roles. They are boxes holding whatever
you put in them, and what is inside announces itself as it always
would.

## What has been checked

The role and its three values, the arrow and Home and End steps, the
clamping, a plain press and move with no long press before it, and a
pointer position turning into the right fraction of a measured track
are asserted in the spec beside the example. The pan was verified
against the real pointer controller and hit tester rather than by
dispatching a pan event at the handler, because a component that asks
for the wrong gesture passes that second test and fails in a browser,
which is exactly what happened to this divider once.

## Next

[Tabs](/components/tabs) is the other way to divide a screen, and
[Card](/components/card) is the surface a pair of panes usually sits
on.
