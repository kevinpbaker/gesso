---
description: 'Attaching behaviour to an element without wrapping it: the modifiers prop, the override cascade, how a modifier survives the rebuild of the element it is on, and what one is allowed to touch.'
---

# Modifiers

A modifier attaches behaviour to an element. Hover and press state, a
focus ring, a tooltip, a drag, a measurement: each of those is a value
in a `modifiers` array rather than a component wrapped around the thing
it affects.

The alternative is a wrapper, and wrappers cost. Each one is a node in
the tree that takes part in layout, that the inspector shows instead of
the intent, and that has to nest in some fixed order when two behaviours
land on the same element. A modifier is none of those: two behaviours on
one element stay one element.

```tsx
<box modifiers={[SURFACE_INTERACTION, focusRing()]} />
```

The prop takes an array of modifier values, and only elements take it. A
component's node is its anchor, a fragment with no box and no paint, so
passing `modifiers` to a component throws rather than attaching
something to a node that cannot use it. Components that expect to be
animated or measured from outside offer `rootModifiers` instead, which
puts them on the element the component itself renders. The controls in
`@gesso/components` take it.

## What a modifier writes

<LiveExample id="modifiers" height="380" />

<<< @/src/examples/ModifiersExample.tsx#cascade

`interactive()` is the one nearly every screen uses. It publishes
`hovered` and `pressed` as `visualState`, and it takes `hovered` and
`pressed` maps of property values to write while those states last:

<<< @/src/examples/ModifiersExample.tsx#shared

Hover and press are one modifier rather than two on purpose. Both would
write `visualState`, and two modifiers writing one property is a real
conflict where the later one's set drops the other's state.
`hoverable()` and `pressable()` are the same kind with one half switched
off.

Publishing the state is not the same as painting it. Neither renderer
resolves a colour from `visualState`, because what a hovered control
looks like belongs to the application and its theme, so the property
maps are how a modifier says what it looks like here.

## The override cascade

A modifier does not write onto the node. It writes into a cascade:

```text
effective(property) = the last override in modifier order,
                      else what the element declared
```

Three consequences worth holding on to:

- **Giving up a write restores the declared value**, not a default.
  Leaving the box above puts `controlBackground` back because that is
  what the element said, and an element that declared nothing at all
  goes back to inheriting from the environment rather than to some
  substitute. The restore carries the property's dirty flags, so a
  restored `width` relays out and a restored `backgroundColor` repaints.
- **Later in the list wins.** Two modifiers writing one property is
  allowed, warns once per node and property in development, and resolves
  in favour of the later one. It is also why a component lists its own
  modifiers before a caller's `rootModifiers`: a caller who attached
  something to a control meant it.
- **A binding that emits while a modifier is overriding updates the
  declared value**, and the override still wins. Both the builder's
  writes and an Observable's emissions funnel through the same path.

`set` accepts an Observable as readily as a value, and subscribes for
exactly as long as the modifier is attached. `clear` drops this
modifier's write of one property. A write to a property name the
registry does not know throws, on the grounds that an unknown name is a
typo and the registry's closedness is what makes that catchable.

## What survives a rebuild

<<< @/src/examples/ModifiersExample.tsx#identity

The set attached to a node is reconciled the way keyed children are,
matched by kind and position, and what happens to a match is decided by
its arguments. They are compared by value: plain objects and arrays are
walked, key by key and element by element, primitives compare as
primitives, and everything else, a function, an Observable, a class
instance, compares by identity, because a new callback or a new stream
is a genuinely new argument. Two objects whose key sets differ are
different arguments, even when the extra key holds `undefined`, and the
walk gives up past eight levels of nesting and asks for the same object
instead.

Equal arguments mean there is nothing to do: the modifier stays
attached and keeps whatever state it is holding. An
`interactive({ hovered: { opacity: 0.9 } })` written in the render is
the same modifier on the render after it, which is how it reads.

Different arguments are a change to answer. A kind with an `update` is
told, and stays attached. A kind with no `update`, which is most of
them, detaches and attaches again: listeners dropped and re-registered,
overrides taken off the node, and whatever per-attachment state it was
keeping gone. A hover highlight blinks off, an `autoFocus()` fires a
second time, a drag in flight is dropped.

So the thing to watch is a callback. An arrow function written inside
the render is a new function every time, and a new function is a new
argument no matter what surrounds it. The example measures that: three
boxes carry the same kind, and pressing the button leaves two counters
at one while the third climbs. The one that climbs is the box whose
handler is written in the render; the box beside it passes an equal
object built just as freshly, and nothing happens to it.

Sharing one value is then a question of cost rather than of
correctness. A shared value matches on the first comparison and stops,
allocating nothing per render, where an inline one is allocated and
then walked in proportion to its size. Two places are the natural home
for one:

- **Module scope**, which is where the hover style every example on this
  site shares is declared, and where the component library keeps the
  interaction and the ring every control carries.
- **A component body**, because [a component runs
  once](/guide/components-run-once). A value captured in a `const`
  there is built once for the life of the tree even when the element
  around it is rebuilt, and so is a handler captured beside it.

Factories with no arguments hand one over anyway: `focusRing()` and
`autoFocus()` each return a single shared value.

The list itself is static per element. There is no Observable list of
modifiers; the arguments are where a value may vary, and a genuinely
different set of behaviours is a re-render of the parent, which is the
framework's existing answer to structural change.

## What a modifier may touch

Everything, and only this:

| Capability         | Host API                                                     |
| ------------------ | ------------------------------------------------------------ |
| The node           | `node`                                                       |
| Read a property    | `get(name)`, the effective value including inheritance       |
| Write, and stop    | `set(name, value or Observable)`, `clear(name)`              |
| Listen on the node | `on(type, listener, options?)`                               |
| Listen at the root | `onRoot(type, listener, options?)`, capture by default       |
| Where the node is  | `layoutBox()`, `flowBox()`, `scrollOffset()`, `onLayout(cb)` |
| The environment    | `environment(key)`, `onEnvironment(cb)`                      |
| Focus              | `focus()`, `isFocused()`, `onFocusChange(cb)`                |
| Draw               | `decorate(shapes or null)`                                   |
| Animate a cell     | `animate(cell, to, options)`, `spring(...)`, `stopAnimation` |
| Shared elements    | `shared`                                                     |
| Own a teardown     | `own(teardown)`, released in reverse order on detach         |
| Ask for a frame    | `requestFrame()`                                             |

That list is a budget, not a starting point. A capability that is not on
it is a proposal against the design rather than a parameter added in
passing, and the test applied to one is whether it could be done through
the environment or a service instead.

Two things a modifier can never do. It cannot reach a renderer or a
canvas context, because both backends paint from shared inputs and a
canvas callback would end that; drawing goes through decoration shapes,
which are painted in the node's own pass, under its transform and its
ancestors' clips. And it cannot add or remove children: a behaviour that
needs children is a component, because component identity is node
identity.

`onRoot` deserves its own warning. It exists for the event that never
arrives, which is what "the person pressed somewhere else" is, and every
attached instance is one more listener that every event in the
application walks. A modifier that listens at the root for something it
could hear at its own node is a cost paid by the whole app.

Two rules about ordering, which is the thing people ask about:

- The element's own `on*` handler is registered before any modifier's,
  so at the target it runs first, and a `stopImmediatePropagation()`
  from it stops the modifiers behind it.
- Attachment runs after the element's declared props are written and
  before its children are reconciled. Detachment runs before the node is
  removed, so a teardown still sees an intact node. A modifier can
  therefore never outlive its node, and a node can never keep a
  modifier's subscription.

## Measuring an element

`measure(subject)` reports the node's box into a Subject the caller
owns, which is the `ResizeObserver` a canvas does not have. It is how a
component reads the geometry of an element it renders without reaching
into the layout engine, and it is what a split pane's divider and a
slider's thumb use to turn a pointer position into a fraction of a
track.

It reports the **visible** box: where the node is seen, after any
scrolling above it. That is the one a pointer position can be compared
with. `flowBox()` is the other question, where the node sits in the
layout, and it is what an animation asks: a node whose page scrolled has
not moved.

`onLayout` fires after any frame that moved the node's box, which
includes a scroll, because a scroll moves everything under the
scroller. Register it only while it is needed. A tooltip on every one of
ten thousand table cells that registered eagerly would be ten thousand
listeners walked per scrolled frame.

## The rest of them

| Modifier                                      | Where               | What it does                                                             |
| --------------------------------------------- | ------------------- | ------------------------------------------------------------------------ |
| `interactive()`, `hoverable()`, `pressable()` | `@gesso/core`       | Hover and press state, and the property writes that follow               |
| `focusRing(options?)`                         | `@gesso/core`       | A ring around the node while it holds focus                              |
| `autoFocus()`                                 | `@gesso/core`       | Takes focus on the node's first layout, once                             |
| `measure(subject)`                            | `@gesso/core`       | Reports the node's box whenever it moves                                 |
| `scrollPosition(args)`                        | `@gesso/core`       | Reports a scroll container's offset when it changes, and when it settles |
| `draggable(options)`                          | `@gesso/core`       | Moves the node with the pointer, as a transform                          |
| `clickOutside(options)`                       | `@gesso/core`       | Calls back when a press lands outside the node                           |
| `decorated(shapes)`                           | `@gesso/core`       | Draws shapes on the node for as long as it is attached                   |
| `animateLayout(options?)`                     | `@gesso/core`       | Animates a node from where it was to where layout has put it             |
| `motion(args)`, `sharedElement(args)`         | `@gesso/core`       | Entrances and exits, and an element that continues across a change       |
| `imageSource`, `iconSource`, `videoSource`    | `@gesso/core`       | Resolve media for a node that paints it                                  |
| `tooltip(ctx, options)`                       | `@gesso/components` | A tooltip on the element, with no wrapper node                           |

Three of those are worth a sentence more.

**`draggable()` listens for a Pan, not a Drag.** A card the pointer
picks up immediately is a press-and-move, which this input model calls a
Pan; a Drag is a long press followed by a move.
[Touch and gestures](/interaction/touch-and-gestures) has the whole
table. `start: 'longPress'` selects the other, and it is fixed at
attach.

**`clickOutside()` takes an `except`.** Without it, pressing the button
that opened a popover closes it and reopens it in one press, because the
opener is outside the thing it opened.

**`tooltip()` lives with the component it shares an implementation
with.** It takes the component's context as its first argument, because
a modifier has no component of its own to inject a service into, and
that is also what makes the tooltip close when the component unmounts.
`Tooltip` the component wraps its trigger in a box; the modifier adds
nothing to the tree, which is the reason to prefer it on an element you
control.

## Naming a set of them

A set of modifiers that belongs together should be named once, at module
level, and spread onto every element that wants it:

```ts
export const ROW = bundle(ROW_INTERACTION, focusRing({ color: 'focusRing' }));
```

```tsx
<row modifiers={ROW}>…</row>
```

`bundle` is the analogue of a SwiftUI `ViewModifier` or a Compose
`Modifier` chain: it flattens whatever it is given, including other
bundles, keeps the order, and freezes the result. Nesting composes, so
`bundle(BASE, OTHER_BUNDLE, focusRing())` is one flat list.

There are two reasons to name it. The ordinary one is that the set has
a meaning and the meaning is worth a word. The second is that
`modifiers={[INTERACTION, ...RING]}` is not free: it allocates a fresh
array and copies the ring into it on every render of the component that
element is in, and it was written seventy-two times across the two
applications in this repository. A bundle is built once and is the same
frozen array every time.

A bundle carries behaviour and not paint. The colours a hovered element
is drawn in ride inside `interactive()`'s options as palette names, so
one bundle is right in both appearances; the properties an element is
drawn with at rest stay on the element.

## When one goes wrong

`attach`, `update` and `detach` are each guarded. A modifier that throws
is reported, its host is released either way, and it is dropped rather
than left half attached with overrides on a node and nothing to take
them off. A modifier beside it in the list is unaffected, and the tree
goes on rendering.

The one failure that is deliberately not contained is a write to an
unknown property name, which is rethrown, because that is a typo and
catching it late would be worse than the throw.

The [inspector](/tooling/inspecting-a-node) names the kinds attached to
a node and outlines decorations in their own colour, and the layout
explanation carries a source per decided value, so
`backgroundColor #1f2937 set by interactive` is an answer the tools can
give rather than something to work out from the code.

## Limits

**A modifier's failures do not reach the error overlay.** They are
reported through the same channel binding errors use, and neither
channel is wired to the overlay yet. Watch the console.

**The element-handler-before-modifiers rule is documented rather than
pinned.** The dispatcher's registration order is covered by a spec; that
the element's own handler is always registered first is stated in the
host's contract and asserted nowhere, so treat it as the intended rule
rather than a guaranteed one.

**Where this page was checked.** Everything above is either taken from
the source or measured by the spec beside the example, which drives the
cascade through a real pointer, the ring through the focus manager and
the argument comparison through four renders. The reference modifiers
were checked by hand in the framework playground in Chrome on Linux, in the
render worker, on Canvas2D: hover and press write and restore, the ring
follows Tab and is clipped by the scroller it is half scrolled out of,
`measure` follows a divider and a slider, a dragged tile stays where it
is dropped without scrolling the list it sits in, `clickOutside` is not
reopened by its own opener, and all three tooltip placements open. The
same route on WebGPU was not watched.

## Next

[Focus and traps](/interaction/focus-and-traps) uses `autoFocus()` and
`focusRing()` in anger, and
[touch and gestures](/interaction/touch-and-gestures) is what
`draggable()` is listening to.
