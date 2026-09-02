---
description: 'Spinner: an indeterminate busy indicator, what it costs per turn, and why it keeps turning under reduced motion.'
---

# Spinner

Work is happening and there is no saying how much is left. That is the
whole of what a spinner claims, and it is the reason to choose one:
when the amount of work is known, a
[progress bar](/components/progress-bar) says something a spinner
cannot, and a reader watching a spinner for eight seconds learns
nothing from it but that the application has not given up.

It is a `status` rather than a progress bar, and it carries `busy`. It
has no value, because it has none to have.

<LiveExample id="spinner" height="220" />

<<< @/src/examples/SpinnerExample.tsx#spinner

## Props

| Prop    | Type           | Default         | What it does                                           |
| ------- | -------------- | --------------- | ------------------------------------------------------ |
| `size`  | `number`       | `20`            | The side of the square it occupies, in logical pixels. |
| `label` | `string`       | `'Loading'`     | What a screen reader reads while it turns.             |
| `color` | `UiColorValue` | `controlAccent` | A palette name or a colour outright, for the blades.   |

`size` fixes the box and `flexShrink` is zero, so a spinner in a tight
row keeps its size. The layout props on
[the library page](/components/) apply.

`color` names a palette entry, and unlike an [icon](/components/icon)
this one resolves at paint: the blades are boxes rather than a raster,
so a theme change recolours them with nothing redrawn.

`rootModifiers` is declared on the shared props type but is not
attached by this component, so a modifier passed there does nothing.
Put it on a box around the spinner.

## What a turn costs

Eight blades of fixed, decreasing opacity sit in a container, and the
container's rotation is the only thing that changes. A turn is eight
positions 110 ms apart, so the whole animation is one property written
about nine times a second, rather than eight properties written on
every frame. It is a repeating tween with a stepped easing and a step
the length of one position, so the runtime wakes for it about nine
times a second, on the same phase as every other animation in the
application, and stops the moment the component leaves.

The turn is about the middle of the square. That is worth stating
because it was once wrong: a transform's `x` and `y` are its pivot,
offset from the node's top left, not an additional translation, so a
spinner given no pivot turns about its corner and swings across the row
it sits in. Half the side each is what makes it turn on the spot, and
the spec beside the example holds the pivot in place.

## Reduced motion

It keeps turning. That is deliberate, and it is the same call a
[video](/components/video) makes: the rule is to stop a movement only
where standing still would not say something false, and a spinner that
has stopped is one that says the work has stopped. WCAG's rule about
reduced motion is about movement triggered by interaction, and a busy
indicator is not that.

The spec beside the example mounts the whole thing with reduced motion
on and measures that the spinner still turns.

An application that wants no movement at all shows something else
instead: a line of text, or a progress bar with a value, both of which
say more than a spinner does anyway.

## Keyboard

None. A spinner is not a tab stop and binds no keys. It is also not
somewhere focus should be sent when work starts: announce the state
through the control that started it.

## Semantics

| What   | Value                                                          |
| ------ | -------------------------------------------------------------- |
| Role   | `status`, on the square that turns                             |
| Name   | `label`, which is `Loading` when none was given                |
| States | `busy`, always. A spinner that is not busy should not be drawn |
| Value  | None. It cannot say how far along the work is                  |

A spinner with no label is still announced, which is the opposite of
what an [image](/components/image) or an [icon](/components/icon) does
with a missing name. The reason is that a spinner is never decorative:
it exists to say something is happening, so it defaults to saying it
rather than dropping out of the tree. Replace the default wherever you
can name the work, since "Loading" said three times on one screen is
three anonymous waits.

## Next

[ProgressBar](/components/progress-bar) is the one to reach for when
the work can say how far along it is, and it is the same component in
its indeterminate form when it cannot.
