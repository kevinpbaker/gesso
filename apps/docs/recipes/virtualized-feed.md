---
description: 'A feed that grows at both ends: a count and a revision as the whole data source, entries that size themselves, a jump to the newest, and what a prepend does to where the reader was.'
---

# A virtualized feed

An activity feed of entries of no fixed height, growing at the end as
things happen and at the start as older history is loaded. The screen
holds three cells and no list of rows.

This recipe assumes you have read
[virtualization](/layout/virtualization), which is the mechanism under
everything here. It is deliberately not built on the
[LazyList](/components/lazy-list) component: that owns its own scroll
offset, and this screen has to drive one, for the jump and for the
anchoring below. `LazyList` is the better choice for a feed nothing ever
scrolls from outside, and it brings the roles, the keyboard and the
selection with it, which this page then puts on the rows by hand.

<LiveExample id="recipefeed" height="380" />

Scroll into the middle of the feed and try the buttons. Newer entries
arrive at the end and nothing under the reader moves. Older entries
arrive at the start, which moves everything: press the naive button to
watch it happen, and the anchored one to watch it not.

## The source

<<< @/src/examples/RecipeFeedExample.tsx#source

There is no array of entries anywhere in this screen. The source is two
cells, declared in the component below: `count`, and the number of the
entry at index 0. Between them they say what index _i_ means, and
everything else is a function of the entry number: who did it, and what
they did.

That is what the window wants. It renders an index, so a data source
that can answer "what is at index _i_" costs nothing per entry that
nobody is looking at. A real feed answers it out of a page of records it
has fetched, and the shape is the same.

The estimate is the one number worth thinking about. The entries wrap,
so no single height is right for all of them, and the window uses it for
every entry it has not measured. Here 46 puts the scroll range within
3 px of the truth on the first frame: 5,517 px for 120 entries, of which
eight have been measured, and 5,482 after a jump to the end has measured
two windows more.

## The feed

<<< @/src/examples/RecipeFeedExample.tsx#feed

The rows carry their own semantics. `LazyColumn` is a scroll container,
not a control, so `role`, `posInSet` and `setSize` are the screen's to
set, and what they say is the whole feed: entry 41 of 130, not entry 3
of the 8 that happen to be mounted. See
[semantics](/access/semantics) for what those become.

`setSize` is bound to the count cell rather than read from it, so an
entry that is mounted when the feed grows says the new length without
being rendered again.

Nothing sets a height on an entry. The body wraps to the width of the
list and the window measures whatever it got, which is the case the
estimate exists for.

### Newer entries change only the count

`count` grows, no index means anything different, and the list follows.
The mounted rows are re-used, the scroll offset is untouched, and the
reader does not move: the spec checks that the entry under the eye is
still in exactly the same place, to the pixel.

### Older entries change what every index means

Loading ten older entries shifts every index by ten. That is not
something a count can express, so the number of the first entry is
handed to the list as its `revision` as well, and the mounted rows are
rendered again in place against the new data.

What `revision` does not do is move the scroll offset, and the offset is
now pointing ten entries too far up the feed. Left alone, the feed jumps
under the reader: 462 px, in the spec beside this page.

The fix is arithmetic, and the window is the thing that can do it. It
was handed over once through `windowRef`, and it is read, never driven:

- `range.first` is the index at the top of the mounted window,
- `offsetOf(index)` is where an index sits in the content, mounted or
  not,
- so the offset the reader should be at afterwards is where that same
  entry has moved to, plus how far past it they already were.

This gets close rather than exact: 28 px in the spec, against the 462 of
leaving it alone. It cannot be exact, because the ten entries that
arrived have never been mounted and nothing knows how tall they are.
The offset moves by what the window assumes them to be, and the
remainder settles as they are measured. Entries of a fixed height have
no such gap.

### The jump asks for more than there is

`totalExtent()` is how tall the window currently believes the feed to
be, so writing it into the offset asks to scroll past the end. The
engine clamps a scroll offset to the content on the next layout, and
`scrollPosition` reports the offset the list actually ended up at, which
goes straight back into the same cell. The screen therefore never has to
work out where the bottom is: it asks for too much and reads back what
it got. In the spec that settles on 5,282 px, which is the content less
the 200 of the viewport, with the newest entry mounted.

That pair, a bound `scrollY` and `scrollPosition` writing back into it,
is the general shape for owning a scroll offset, and it is how a
container is put back where it was after a route change too. A modifier
cannot do it: a modifier writes through the override cascade, and an
override would shadow every wheel for the life of the node.

## What this page has checked

The spec beside the example drives the real runtime with a fake canvas
and asserts what is claimed above: that 120 entries mount eight rows and
claim 5,517 px of scroll range with only those eight measured; that
three more entries change what the mounted rows announce without adding
any; that appending leaves the entry under the eye at exactly the same
pixel; that a naive prepend moves it 462 px and an anchored one 28 px;
and that the jump settles on the content height less the viewport, with
the newest entry mounted.

Those pixel figures come from the test text measurer rather than from a
browser, so the exact drift and the exact window size differ in a real
one. The direction and the order of magnitude do not: the anchored load
is out by a fraction of an entry and the naive one by the ten entries
that arrived.

The live example above is Canvas2D unless you asked this site for the
other renderer, and Chrome is the extent of what any of it has been
opened in.

A feed like this is keyboard-reachable only in so far as it scrolls: the
entries here are not focusable and there is no selection.
[LazyList](/components/lazy-list) is what adds those, and
[keyboard operability](/access/keyboard) is what it has to satisfy.

## Next

[Virtualization](/layout/virtualization) is the window in full, the
estimate, the corrections and what a frame costs.
[Overflow and scrolling](/layout/overflow-and-scrolling) is the scroll
container the feed is one of.
