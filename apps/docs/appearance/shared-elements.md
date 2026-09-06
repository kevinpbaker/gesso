---
description: "sharedElement(): how one screen's element continues as another screen's, why it is FLIP over the live graph rather than a snapshot, and where it stops."
---

# Shared elements

Some things do not enter and do not leave. A cover in a list and the
banner on the screen it opens into are the same object, and the change
should look like the object moving rather than one picture replacing
another.

Open the collection, then come back:

<LiveExample id="sharedelement" height="380" />

Two elements, on two screens, with one name between them. Nothing else
about either screen knows a transition exists.

## Marking an element shared

One modifier, and a name:

<<< @/src/examples/SharedElementExample.tsx#list

The same name on the screen it opens into is the whole declaration:

<<< @/src/examples/SharedElementExample.tsx#detail

The name is global to the runtime, so it names a **thing** rather than
a place. That is why a list of three collections gives each of them a
name carrying its own id, `cover-2` rather than `cover`, and the
coordination that a CSS class would need in order to keep three cards
from claiming one name disappears: a name registry can carry an id, and
a class cannot.

## What happens on the change

A route change is an ordinary change to the tree, so a shared element
needs nothing from the router at all. What runs is this:

1. **The arriving element claims the name** when its modifier attaches,
   and keeps whatever box the previous holder had.
2. **On its first layout**, both boxes are known. The element is drawn
   at the departing one's box, translated and scaled onto it, and then
   released to its own. The pivot is the element's centre, so the offset
   is between two centres and the scale is a plain ratio of sizes, with
   nothing to correct for.
3. **The departing element yields**, instantly and not as an animation:
   the arriving one is about to be drawn from exactly its box, and
   anything but an immediate disappearance puts two of the same thing on
   screen. The yield is handed to the arriving element rather than
   performed on the spot, so there is never a frame with neither of them
   drawn.
4. **On arrival the override is cleared**, so the element goes back to
   being laid out by what it declared.

**Why a registry rather than a diff of the tree.** Reconciliation
creates a parent's new children before removing the unmatched old ones,
so "the leaving node hands over to the arriving one" would hand over in
the wrong direction. Keying by name means the arriving element asks
whoever holds this name where it is, and it does not matter whether that
element has left yet. It is also what makes the reverse work: coming
back, the list's cover claims the name from the banner.

**Why FLIP over the live graph rather than a snapshot.** The browser's
View Transitions API snapshots the old document, applies the change,
snapshots the new one and cross-fades pseudo-elements between two
rasters, because in a document there is no old DOM left to animate by
the time the new one exists. Gesso keeps a retained scene graph, so both
elements are real, live and measurable at the same moment. The morph is
therefore FLIP on the actual node: interruptible, continuous, free of
the raster, and with everything inside it still live the whole way.

It measures the box the element is **seen** in, not the one it occupies
in the flow, which is the opposite of what `animateLayout` reads and for
the opposite reason. A layout animation must not mistake a scroll for a
move, so it watches the flow; a morph is a visual continuation of what a
person is looking at, so a card halfway down a scrolled list is picked
up from where it appears rather than from where it would be with the
list at the top.

## The arguments

| Argument   | Type                          | Default       | What it does                                                     |
| ---------- | ----------------------------- | ------------- | ---------------------------------------------------------------- |
| `name`     | `string`                      | required      | What both elements answer to, across the whole runtime           |
| `morph`    | `'transform' \| 'geometry'`   | `'transform'` | Translate and scale, or animate the element's own box            |
| `scale`    | `'free' \| 'uniform'`         | `'free'`      | One ratio per axis, or the width's ratio on both                 |
| `fadeFrom` | `number`                      | none          | Fade the arriving element up from this opacity as it morphs      |
| `onMorph`  | `(morphing: boolean) => void` | none          | Told when a morph starts and when it arrives. See stacking below |
| `lift`     | `boolean`                     | `false`       | Paint the element above its screen and outside every clip in it  |

It also takes the timing every motion takes: `duration`, `easing`,
`spring`, `delay` and `reducedMotion`.

**A morph is paced by time, not by a spring**, and the default is
`slow` on the `standard` curve. A spring's shape does not change with
distance: it covers the same _proportion_ of the move in the same time
however far it is going, so a card near the middle of a list reads as a
gentle expansion while the identical curve over six hundred pixels reads
as a jump followed by a slow settle. A fixed duration spends the same
time on the movement whatever the distance, which is what makes it read
as travel. Naming a `spring` is still available and still turns the
duration off, for a movement that follows a gesture.

**`scale: 'uniform'` is what text wants.** A line of text has no shape
of its own to preserve, since its box is whatever the line breaks made
it, while the type inside only ever grows by its font size. Left free, a
title that fits on one line in a card and wraps to two on the page it
opens into is scaled by quite different factors across and down, and the
letters are visibly squashed on the way. The width's ratio is the one
kept, because for a line of text it tracks the font size closely while
the height's ratio is a count of lines.

**`morph: 'geometry'` is for one shape.** It animates the element's own
`left`, `top`, `width` and `height` rather than transforming it, which
costs a relayout per frame and is worth paying for a rounded rectangle
whose aspect ratio changes: scaling one stretches its corners into
ellipses. A card expanding into a page is that shape. It requires an
element that positions itself, `position: 'absolute'` or `'fixed'` with
numeric `left` and `top`, and it refuses an element pinned by insets,
because such an element has no width of its own to animate and writing
one on top of both is over-constrained.

## Where it stops

**A morph is bigger than the element, so something has to be raised.**
For most of the way the element covers what sits beside it, and paint
order among siblings is tree order, so the neighbour is the one drawn on
top and the screen appears to shrink _behind_ it. A browser never meets
this, because its named elements are lifted out of the page into a layer
above everything; Gesso morphs the real node, which stays where it is in
the tree, and that is the same property that makes the morph
interruptible. So the modifier **reports** rather than acts: `onMorph`
tells a component when its element is morphing, and the component raises
whatever the layout says has to rise, which is almost never the morphing
element itself.

```tsx
const morphing = internalState(false);

<button zIndex={morphing.pipe(map(active => (active ? 1 : 0)))}>
  <box modifiers={[sharedElement({ name, onMorph: active => (morphing.value = active) })]} />
</button>;
```

**A clip is a different question, and `zIndex` cannot answer it.**
Raising an ancestor decides who is drawn over whom; it does nothing at
all about `overflow`. An element morphing back into something that clips
has both problems, and only the second one is fatal: a picture landing
in a horizontal row starts its journey at the middle of the page, which
is outside the row's scroll clip, so most of the morph is cut away and
the artwork appears out of nothing as it shrinks into the row.

`lift: true` is the answer to that one. For the length of the morph the
element is painted in a top layer: above the rest of the screen, and
outside every clip its ancestors impose. It keeps everything else about
them, their transforms, their scroll offsets and their opacity, so it is
drawn exactly where it would have been drawn and travels with whatever
it belongs to.

```tsx
<Image src={cover} rootModifiers={[sharedElement({ name, lift: true })]} />
```

"Above" stops at the screen. `Presence` marks each of its layers as a
boundary (the `liftBoundary` property), so a lifted element rises to the
top of the screen holding it and no further. Without that, a screen on
its way out would fly its morphing artwork across the screen arriving
behind it, which is the previous navigation's picture drawn over the new
page.

Lift only what needs it. An element that is not landing inside a clip is
better drawn where it belongs, and a lifted element is over everything
on its screen: a header and a now-playing bar included.

**A name has to be unique on the screen, and stable while it lives.**
A shared name is a claim: whichever element takes it last owns it, and
whatever held it before is hidden and morphed from. That is exactly
right across a screen change and exactly wrong between two elements
that are both on screen and staying, so two of them answering to one
name is not a tie, it is a picture flying in from somewhere else and a
card left invisible.

Both halves matter. Naming a card for the item it holds is not unique
when the same track is in two rows, and it is not stable either: a list
whose data is replaced hands the name from the card that held the item
to the card that holds it now, and reconciliation builds the new node
before it drops the old one, so the new one claims a name the old one
still owns. Name a card for its place instead, and let the page it
opens adopt the name of the card that was pressed. `apps/segue`'s
`hero.ts` is that pattern in about thirty lines.

**The arriving screen may not fade.** A screen's opacity is inherited by
everything inside it, and the morphing element is inside the arriving
screen by construction, so an `enter` that fades dims the very thing
carrying the transition and the page shows through for several frames.
The departing screen may fade, because nothing is morphing out of it:
its shared elements have already handed over. So the two are
alternatives. Either the screens cross-fade, which is right when nothing
is shared, or the shared elements carry the change and the screens swap
under them.

<<< @/src/examples/SharedElementExample.tsx#swap

**A component needs `rootModifiers`.** A `modifiers` prop on a component
is refused, and correctly: a component's node is an anchor fragment with
no box and no paint, so there is nothing to attach to. The components in
`@gesso/components` take `rootModifiers` instead, which is the component
answering the question for itself.

**Two elements with the same box do not always mean two identical
elements.** When a shared element looks like it inflates, compare its
two boxes before suspecting the animation. A scale on one axis only,
with the content unchanged, is always a container that stretched: a
title in a column that hugs its children and a title in a column that
stretches them measure differently even when the text is identical, and
the fix is in the layout rather than in the modifier.

**A params-only navigation morphs nothing**, because nothing changes.
The outlet compares chains rather than matches, so `/item/2` to
`/item/3` emits no new screen at all: the screens stay mounted and read
the new params. There is nothing arriving to claim a name.

**Scroll is not restored for you.** `Presence` drops a screen once it
has finished leaving, and its scroll offset goes with it, so a list
returned to is laid out at the top and a card morphs back to the wrong
place. Restoring it is two ordinary pieces: `scrollPosition({ onChange })`
reports where a container has got to, because the runtime moves that
offset without the application's knowledge, and `scrollY` puts it back
as a plain binding, so the list is laid out where it was left before it
paints.

## Reduced motion

The morph honours it like any other animation: under a reduced-motion
preference the arriving element is written straight onto its own box and
the change is a cut. Nothing is lost except the movement, which is the
point. [Motion](/appearance/motion#reduced-motion) has the detail.

## What this page was checked against

The spec beside the example mounts it with `@gesso/testing` and drives
frames on a manual clock. It computes the box the cover is actually
painted in, which is its layout box scaled about its centre and
translated, and asserts what a cut would fail: that on the first frame
of the change the banner is laid out at its full size and drawn at the
small cover's box, that a few frames later it is neither box, that it
ends with no transform at all and exactly on its own layout, that the
same happens in reverse coming back, and that the departing cover is at
opacity zero for the whole overlap.

Two limits are worth stating plainly. **The example swaps its screens
through `Presence` directly rather than through the router**, because a
live example on this site shares the page's address bar and a real
navigation would change it; `RouterOutlet` given a `transition` renders
its matched chain through the same `Presence`, so the mechanism is the
one described here, but the router itself is not exercised by this
page's spec. And the canvas above has not been watched frame by frame in
a browser for this page; nothing here was checked on WebGPU or on a
browser engine other than Chromium.

## Next

[Motion](/appearance/motion) is the vocabulary all of this is written
in: the tweens, the springs and the phase that advances them.
