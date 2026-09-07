---
description: A floating bar publishes the room it occupies and a screen keeps clear of it, along with the safe area and the soft keyboard.
---

# Insets

Three quite different things end up on the same four numbers, and that
is the point of having them: the platform's safe area (a notch, a home
indicator, a window's rounded corner), the soft keyboard, and whatever
the application itself is floating over its own content.

A screen that keeps its last row clear of all three should not have to
know which of the three it is clearing. Before this, every scrolling
screen in Segue knew about exactly one of them by name, and about the
height of the bar that caused it.

## The registry

An application provides one on its root:

```tsx
const insets = new UiInsetRegistry();

<box width={percent(100)} height={percent(100)} insets={insets}>
```

Per application rather than per module, for the same reason the theme
is: an inset is "what is over the content in this window", and a runtime
with two windows in it has one of these per window.

## Publishing

Anything drawn over the content instead of in it says so:

```tsx
<row position="absolute" left={0} right={0} bottom={0} height={72} modifiers={[publishInset({ edge: 'bottom' })]}>
```

It publishes its own measured height on a horizontal edge and its width
on a vertical one; pass `extent` when the node's own box is not the
answer. The contribution is republished whenever the box changes, so a
bar that grows moves the content with it, and retracted when the
modifier detaches, so a bar inside a `Presence` gives the room back as
it leaves.

Hold the modifier list still. A modifier's arguments are compared by
identity, so an inline `[publishInset({ edge: 'bottom' })]` detaches and
re-attaches on every render:

```ts
const PUBLISHES_ITS_ROOM = [publishInset({ edge: 'bottom' })];
```

## Reading

A scrolling page keeps clear of whatever is in the registry:

```tsx
<column modifiers={[insetPadding({ bottom: 40 })]}>
```

That is forty pixels plus however much the bars, the keyboard and the
platform's safe area are currently taking at the bottom, and it follows
all three as they change. Only the edges named are written, so it
composes with an element that sets `paddingX` itself.

The edges are physical rather than logical, because these are physical
facts: a soft keyboard is at the bottom of the screen in every language,
and a notch does not move when the reading does.

## Contributions compose by maximum, not by sum

Two things over the same edge overlap far more often than they stack. A
bar drawn across the home indicator already covers the safe area under
it, and a soft keyboard that pushes a bar up covers the bar too. Adding
them would push the content clear of a strip nothing is occupying, and
nobody would notice until the keyboard was open on a phone.

So each edge takes the largest contribution on it. A publisher whose bar
genuinely sits on top of another one publishes the total it occupies,
because it is the only thing that knows.

## The platform's own insets

The safe area and the soft keyboard come from `visualViewport` and from
`env(safe-area-inset-*)`, both of which need a window. That makes them
shell-side, and what crosses the thread boundary is four numbers:

```ts
// On the shell, where there is a window.
observeViewportInsets(insets => post({ type: 'insets', insets }));
```

```ts
// In the render worker, where the decision is taken.
registry.publish(message.insets);
```

`observeViewportInsets` reports once immediately as well as on change,
for the same reason `observeMediaQuery` does: a keyboard that is already
open, and a phone whose notch has been there all along, send no event.
Where there is no `visualViewport` it reports zeroes once and stops,
which is the honest answer on a desktop window with no notch.

The safe area is read off four custom properties on the document
element, because `env()` is only legal in CSS. A page that wants them
declares them in its own stylesheet:

```css
:root {
  --gesso-safe-area-top: env(safe-area-inset-top, 0px);
  --gesso-safe-area-right: env(safe-area-inset-right, 0px);
  --gesso-safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --gesso-safe-area-left: env(safe-area-inset-left, 0px);
}
```

An application that has not declared them gets zeroes rather than a
failure.

Nothing in `observeViewportInsets` reads a Gesso object, which is the
rule `decisions/0030` states: the shell holds what only it can hold and
posts plain data, and every decision about the data is taken on the far
side.

## In an application

Segue's now-playing bar publishes the eighty-eight pixels it occupies,
and seven screens keep clear of it with `pageInset(base)`. None of them
names the bar's height and none of them asks whether anything is
playing, which is what all seven did before.

The playground's **Layout** example is the same thing with a switch on
it: hide the bar and the page's `paddingBottom` goes from 112 to 40,
which the layout inspector shows as `set by insetPadding`.
