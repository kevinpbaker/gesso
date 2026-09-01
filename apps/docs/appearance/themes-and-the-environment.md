---
description: 'A theme is one value in the environment: what it holds, what a colour token resolves against, and how an application provides a palette of its own.'
---

# Themes and the environment

A theme in Gesso is not a stylesheet and not a global. It is one value
provided at a node, inherited by everything below that node, and
resolved at paint time. So a colour written as `backgroundColor="surface"`
has no fixed meaning: it means whatever the nearest theme above that
node says it means.

[Light and dark](/guide/appearance) is the smallest case of this, where
the value provided is one of the two themes that ship. This page is the
general one: what a theme holds, and how an application provides its
own.

<LiveExample id="themes" height="300" />

Both cards are the same component, and neither names a colour. The left
one takes the palette the column above it provides, so the button
changes it. The right one provides a palette for itself, so the button
does not reach it.

The example provides palettes of its own, so unlike every other canvas
on this site it does not follow the page's appearance toggle. That is
the same rule at work: the nearest provider wins, and here the nearest
one is inside the example.

## What a `UiTheme` holds

Four fields, and they are independent of each other:

| Field        | What it is                                               |
| ------------ | -------------------------------------------------------- |
| `colors`     | The palette: the names a colour prop may be written as   |
| `typography` | The type scale, in six named roles                       |
| `shapes`     | Corner radii by name, from `none` to `full`              |
| `shadows`    | Layered box shadows by name, from `none` to `extraLarge` |

`colors` is the one with a lookup behind it. A colour prop accepts a
palette name and the name is resolved against the theme the node
inherits, so nothing in a component has to hold a colour. `shapes` and
`shadows` are read from the theme and passed as values instead:
`borderRadius` takes a number, not a shape name, and `boxShadows` takes
the array. The scale is worth using anyway, because a screen whose
radii all come from `theme.shapes` restyles in one place, but it is a
convention rather than a resolution the engine performs.

`typography` is the subject of [the type scale](/appearance/typography),
and it matters here for one reason: a theme's palette is not what
colours your text. Text that names no colour takes it from the
`textStyle` in the environment, which is why a root provides both.

## What a colour token resolves against

The palette of the nearest theme above the node, at the moment the node
is painted. Every prop that takes a colour accepts a name:
`backgroundColor`, `borderColor`, `color` on text, the colours a
modifier paints for a hovered or pressed state, and the stops of a
gradient.

The names in the shipped palette, in the three groups they fall into:

- **The surface and its content.** `background`, `surface`, `primary`,
  `secondary`, `text`, `textMuted`, `border`, `shadow`.
- **Controls**, named for the role a control plays rather than for a
  widget, so one set serves the checkbox, the switch, the radio, the
  slider and the fields: `controlBackground`,
  `controlBackgroundHovered`, `controlBackgroundPressed`,
  `controlBorder`, `controlBorderFocused`, `controlForeground`,
  `controlForegroundDisabled`, `controlAccent`, `danger`, `focusRing`.
- **Selection**, for a row that is chosen rather than operated:
  `selectionBackground`, `selectionForeground`.

`packages/core/src/environment/UiColors.ts` is the source of truth for
that list and for what each shipped theme sets them to.

A name that is not in the palette is not an error. The value falls
through to the CSS colour parser, so `'#1f6feb'` and `'rebeccapurple'`
are legal in the same prop, and a misspelt token is simply a colour
that does not parse: the node paints no background rather than
complaining. Worth knowing when a card comes out transparent.

## Providing one, and scoping it

`theme` is a prop on every element, and so are `textStyle` and
`contentColor`. Setting one provides that value to the node itself and
to everything below it:

<<< @/src/examples/ThemesExample.tsx#provide

Two things follow from the environment being a chain rather than a
global. The provider resolves against its own value, which is why the
column's `backgroundColor="background"` is the chosen palette's
background and not the page's. And the nearest provider wins, so a box
that provides a theme restyles its subtree and nothing else, which is
what puts two palettes on screen side by side above.

Nothing in between has to pass the theme along. The card is an ordinary
component that names tokens:

<<< @/src/examples/ThemesExample.tsx#card

## A palette of your own

`UiColors` is an interface, so a palette is any object with those
names, and a token is looked up on whatever palette the node inherits
rather than on a fixed list. That means an application may add names of
its own and write them in a prop exactly like the shipped ones:

<<< @/src/examples/ThemesExample.tsx#palette

Spreading a shipped palette first is the honest way to start: the shape
stays complete, and the tokens you have not thought about yet are still
answered. Deriving the control tokens from the same few colours is what
makes `@gesso/components` follow the palette, since those components
read the control tokens instead of taking colour props.

An application that wants light and dark of its own builds two of these
and maps the shell's appearance onto them, exactly as
[light and dark](/guide/appearance) shows for the shipped pair.

## What changing it costs

Providing a new theme writes a property. The runtime rebuilds the
environment for that node and walks its subtree, marking the nodes
whose inherited values may have changed, and the next frame repaints
them. No component function runs again and no node is rebuilt, which is
the same property the appearance toggle relies on and what makes a
large screen restyle in one frame.

The walk is skipped where the value did not really change, and the
comparison is worth knowing:

- **The palette is compared over its keys**, so a palette that adds
  names has those names compared too.
- **The type scale is compared over the six named roles.** A scale
  carrying a role of its own beyond those six may differ in that role
  alone and still compare equal, in which case nothing propagates.
  Provide such a style directly as `textStyle` rather than smuggling it
  through a theme.

## The rest of the environment

Three values travel this way, and they are the three provider props:

| Prop           | Inherited by                                                  |
| -------------- | ------------------------------------------------------------- |
| `theme`        | Every colour token, in every descendant                       |
| `textStyle`    | The eight inherited text properties, when a node names none   |
| `contentColor` | Provided and inherited, and carried into an overlay's content |

`contentColor` is the honest gap in that table: it is provided,
inherited and re-provided onto overlay content, and no element that
ships resolves a colour from it today. Text takes its colour from
`textStyle`, and everything else takes it from a prop.

Motion is deliberately not here. Durations, easings and springs are
named the way colours are, but they are not a field on `UiTheme`,
because a theme value is resolved per node and an animation drives a
cell, which has no node.

## What this page was checked against

The spec beside the example mounts it with `@gesso/testing`, which
needs no browser, and asserts the theme each node inherits and the
colours the renderer would resolve from it, before and after the swap.
The canvas itself was watched in Chrome on the Canvas2D renderer: the
swap repaints the left card and the ground behind it while the right
card holds its own palette. Nothing here was checked on WebGPU or on
another browser engine, and the shipped palettes have not been reviewed
for contrast ratios. They are a starting point, not an accessibility
guarantee.
