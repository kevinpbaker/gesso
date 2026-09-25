---
'gesso-framework': minor
'gesso-core': minor
'gesso-components': minor
---

**`fanOut`, for when every node wants its own slice.** One source, N things on
screen, each reading one part of it: a grid, a timeline, a log viewer all arrive
at this shape, and the natural spelling does not scale. A pipe per slice runs N
pipelines on every emission whatever changed, and RxJS removes an observer from a
Subject by scanning its list, so tearing down a window of N is quadratic.

`fanOut(source, read, { initial })` holds one subscription for the whole registry
and hands out a stable cell per key. Its `changed` hint is where a frame is won: a
source that knows which keys a patch touched reads only those. Ten thousand live
keys, measured against a pipe per key: mount 29.8 ms to 10.7 ms, teardown 9.7 ms
to 3.7 ms, and one key changing 2.2 ms to 0.1 ms.

Reach for it when N is large _and each emission touches few of them_. A source
that republishes its whole window on every scroll gets the cheaper mount and
teardown and nothing from `changed`, because every key really did change.

It compares by reference where `select` and `derive` compare by content, which is
the opposite default for the opposite reason: those run once per emission and this
runs once per live key per emission. And a registry that has grown past a couple
of thousand keys having released none of them says so once, because `release` is
the caller's and forgetting it is the one thing here that goes wrong silently.

**`tabStop`, which is `tabindex="-1"`.** Focusable, reachable by a press and by
`focus()`, skipped by the Tab cycle. `focusable` only ever answered "may this node
hold focus", which is the wrong question for a container: `UiFocusManager.settleScope`
blurred when a scope held nothing focusable, so a `Dialog` whose content is a
sentence handed the keyboard to nothing and could not be dismissed with Escape.
`settleScope` now falls back to the scope root before blurring, and `Dialog` sets
`focusable: true, tabStop: false` on its body. Both halves are needed and neither
is enough alone.

**`borders()`, a border per edge, as paint.** `borderWidth` is one number and
`borderColor` one colour, so a node could not have a heavy bottom edge and a
hairline top. A border here is paint-only and a decoration is already a coloured
rectangle in the node's own paint pass, so four edges are four draw instances and
no extra nodes. `DecorationBox` gains `right` and `bottom` to put them: any two of
near edge, size and far edge fix an axis, which is CSS's rule for an absolutely
positioned box, and the only one that can express a side edge spanning between two
horizontal ones.

**`menuBarStep`, a menu bar's keyboard, as a peer of `Menu`.** `Menu` traps focus,
which is right for a popup opened by a button and wrong for a bar: with focus in
the panel, ArrowLeft cannot reach the bar to move to the menu next door, and that
is most of what makes a bar a bar. A pure function, generic in the command type,
that returns null for a key it does not claim, so a bar can still be tabbed out of.
