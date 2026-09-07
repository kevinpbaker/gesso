---
description: 'Container queries: a box that branches on the room it has rather than on the size of the window, and what a band costs.'
---

# Layouts that change with the room they have

A screen that differs at 400 px and at 1400 px asks one of two
questions. Either its properties change, in which case use
`breakpoint`, or its children genuinely differ, in which case use
`Responsive`. Both measure **the container**, not the window.

That distinction is the whole reason neither of these is a media query.
`observeMediaQuery` needs a window, the runtime that would branch on it
is usually in a worker, and the question a component actually has is
"how much room do I have", which is not the window's width in any layout
with a sidebar in it.

## Properties that change: `breakpoint`

```tsx
<column
  modifiers={[
    breakpoint({
      at: [900],
      props: { 0: { paddingX: 12, gap: 8 }, 900: { paddingX: 32 } }
    })
  ]}>
```

`at` is the widths, ascending, at which the properties change. `props`
is what to write in each band, keyed by the width that opens it; the
band below the first breakpoint is keyed `0`.

Bands are applied cumulatively from the narrowest up, so a band names
only what it changes: the column above keeps `gap: 8` at 1000 px because
the 900 band did not say otherwise.

Nothing is written until the node has been laid out once, so the first
frame uses the element's own values. Give the element the narrowest
band's values as its declared props when that matters.

## Children that differ: `Responsive`

```tsx
Responsive({ at: [900], width: percent(100) }, size =>
  size.width >= 900 ? [<Sidebar key="side" />, <List key="list" />] : [<List key="list" />]
);
```

`build` is called once per band entered, with the size the container had
when it entered that band, and its result replaces the children.
`Responsive` takes every prop a `<column>` takes, plus `as` to be a row
or a box instead.

`at` is required, and that is deliberate. Children rebuilt on every
pixel of a resize would allocate a subtree per frame of a drag. Naming
the widths that matter is what makes the rebuild happen once per band:
dragging a window edge from 1000 px to 1399 px does no work at all.

The first build happens before any layout, when the size is zero, so
`build` has to return something sensible for a container whose room is
not yet known. Zero picks the narrowest arm, which is the right guess
and also what a phone gets.

## What a band costs

Two numbers, both pinned by
`packages/core/src/layout/ContainerQuery.budget.spec.ts`:

- **Crossing a band costs one extra layout pass**, over the container's
  own subtree. The modifier hears the new box, writes its properties,
  and the node is laid out again. There is no way around that and no
  reason to want one.
- **A resize inside a band costs nothing at all.** The modifier hears
  every width and writes on none of them, so nothing is dirtied and the
  frame's pass is the only pass.

That second number is the one worth watching in your own code: a
container query that recomputed on every width would lay the page out
twice per frame of a window drag, and nobody would notice until the drag
felt heavy.

## The size, for anything else

A container that declares itself one publishes its content size to its
subtree through `UiEnvironmentKeys.containerSize`, so a descendant that
wants the number rather than a branch can read it without a prop
threaded down:

```ts
const room = ctx.environment(UiEnvironmentKeys.containerSize);
const columns = room.changes.pipe(map(size => Math.max(1, Math.floor(size.width / 240))));
```

What is provided is a **source** whose identity never changes, not a
size. An environment value is a snapshot that a subtree caches, so
putting a number in one would rebuild the environment of everything
under the container on every pixel of a drag. The source is set once;
what changes is what it reports, and only the code that asked to hear
about it does any work.

`Responsive` provides one for you. To provide one by hand, build a
`UiContainerSizeSource`, put it on the node's `containerSize` prop, and
attach `sizeContainer` with the same object.

The size reported is the **content** box, padding excluded, because the
room a child has is the room inside the padding.

## In an application

Segue's home screen shows four shelves under 720 px, six under 1180, and
all eight above it. A shelf is a row that scrolls sideways, so eight of
them stacked in a window the width of a phone is a wall to scroll past
rather than a page to take in.

```tsx
const SHELF_BREAKPOINTS = [720, 1180];

Responsive({ width: percent(100), gap: 4, at: SHELF_BREAKPOINTS }, size => [
  <GenreChips key="genres" />,
  ...shelvesFor(size.width).map(id => <ShelfRow key={id} id={id} />)
]);
```

The playground's **Layout** example has the same thing at a smaller
scale, with a panel that splits and rejoins at 820 px of its own content
box, which is not 820 px of window.
