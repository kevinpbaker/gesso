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

Five scales and two axes, and they are independent of each other:

| Field        | What it is                                                   |
| ------------ | ------------------------------------------------------------ |
| `colors`     | The palette: the names a colour prop may be written as       |
| `typography` | The type scale, in named roles                               |
| `shapes`     | Corner radii by name, from `none` to `full`                  |
| `shadows`    | Layered box shadows by name, from `none` to `extraLarge`     |
| `spacing`    | Gaps and insets by name, from `none` to `huge`               |
| `density`    | `compact`, `comfortable` or `spacious`: how tightly it packs |
| `contrast`   | `standard` or `high`: how far a mark sits from its ground    |

There is also an optional `extensions`, which is where an application's
own token groups live; the last section of this page is about those.

`colors` and `shapes` are the two with a lookup behind them. A colour
prop accepts a palette name, and `borderRadius` accepts a name in the
shape scale; either is resolved against the theme the node inherits, so
nothing in a component has to hold a colour or a radius.

```tsx
<box backgroundColor="surface" borderRadius="medium" />
```

Both names are resolved at paint, which is why a radius can be one at
all: `borderRadius` affects paint and nothing else, so the lookup
happens where the theme is already being consulted for every colour. A
box that names a number never reaches the lookup.

A name the scale does not carry draws square, the same quiet failure a
colour name nothing matches already had. That is a theme missing a
step rather than a typo: a misspelling does not compile, because the
names are a closed union.

`shadows` and `spacing` are read from the theme and passed as values
instead: `boxShadows` takes the array, and a padding takes a number.
A screen written from the scale says `paddingX={theme.spacing.large}`
rather than `paddingX={16}`, and gets the density axis for free. There
is no by-name resolution for a length, because a length is read in the
layout pass and a radius is not; `decisions/0079` has the reasoning.

`typography` is the subject of [the type scale](/appearance/typography),
and it matters here for one reason: a theme's palette is not what
colours your text. Text that names no colour takes it from the
`textStyle` in the environment, which is why a root provides both.

## The two axes

`density` and `contrast` are axes rather than second themes, because an
application that has chosen its colours should not have to choose them
twice.

`withDensity(theme, 'compact')` returns the same theme with its spacing
scale at three quarters, and records which way it has been turned so
that asking again does not shrink it twice. Nothing else moves: a
smaller gap between two rows is a density choice, and a smaller word is
a typography one.

`withContrast(theme, 'high')` returns the same theme with every
foreground pushed away from the surface it is drawn on until it clears
a 7:1 ratio. A control's own text is measured against the control
rather than against the page, the grounds are left where they were, and
a name a custom palette added is raised too. There is no way back: the
raising loses what the palette was, so keep the standard theme and
derive the high one from it, which is what an application following the
operating system's setting does anyway.

```ts
const theme = derive([scheme, wantsContrast], (dark, high) => {
  const base = dark ? appDarkTheme : appLightTheme;
  return high ? withContrast(base, 'high') : base;
});
```

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
  `controlBorder`, `controlForeground`, `controlForegroundDisabled`,
  `controlAccent`, `danger`, `focusRing`.
- **Selection**, for a row that is chosen rather than operated:
  `selectionBackground`, `selectionForeground`.

The `UiColors` interface in `@gesso/core` is the source of truth for
that list, and `lightTheme` and `darkTheme` show what each name is set
to.

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

`UiShapes` works the same way, and for the same reason: seven steps
cover a document and not an application. A theme may carry radii of its
own, and declaring them is what makes them type:

```ts
declare module '@gesso/core' {
  interface UiShapeExtensions {
    readonly control: unknown;
  }
}
```

The value type is not used, only the key, because what the theme
carries is always a number. After that `borderRadius="control"` is
legal and `borderRadius="contorl"` is a compile error. It is the same
mechanism as `UiTypographyExtensions`, which
[the type scale](/appearance/typography) covers for roles.

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
- **The type scale is compared over its keys too**, so a role an
  application added to the scale invalidates the subtree that reads it
  exactly as a shipped role does.
- **The shape scale is compared over its keys as well**, for the same
  reason, so a step added through `UiShapeExtensions` repaints what
  names it.
- **The spacing scale, the density and the contrast** are compared, so
  turning either axis is a change of theme.
- **Each extension is compared with the comparison it declared**, which
  is the reason a token group of your own needs no edit here.

## Token groups of your own

A palette name and a type role cover colour and text. An application
always has more than that: Segue has the width its content column is
held to and the height of its now-playing bar, and both used to be
module level constants, which is a theme no provider can change and no
appearance toggle can reach.

`defineThemeExtension` turns such a module into part of the theme:

```ts
export interface SegueMetrics {
  readonly columnWidth: number;
  readonly barHeight: number;
}

export const segueMetrics = defineThemeExtension<SegueMetrics>({
  name: 'segue.metrics',
  defaults: { columnWidth: 600, barHeight: 88 }
});

const theme = withThemeExtension(lightTheme, segueMetrics, {
  columnWidth: 600,
  barHeight: 88
});
```

Reading one is a property access on the object you declared, so an
editor completes the token names and `metrics.barHieght` is a compile
error:

```ts
const metrics = themeExtension(theme, segueMetrics);
<box height={metrics.barHeight} />;
```

Nothing about `UiTheme` or `themesEqual` changes to add a group. The
values ride in a map keyed by the symbol `defineThemeExtension` minted,
so two groups called `brand` in two packages do not collide, and each
is compared with the comparison it declared, which is what makes a
change to one invalidate the subtree that reads it.

A component library may declare one too. It is how a component that
needs a token the shared vocabulary does not have gets one without
adding a colour prop and forking the theme at every call site.
`@gesso/components` declares `controlTokens`, which is what
[restyling the controls](/components/restyling) is written against.

### Reading a group from inside a component

`themeExtension(theme, group)` above reads a theme you are holding. A
component is not holding one: its body runs once, before its node is in
a tree, so there is no environment to read and anything it computes
from the theme is frozen at the defaults.

`themeTokenCell` is the way in. It is the shape `ctx.bounds()` already
has, a cell plus the modifier that fills it:

```tsx
const tokens = themeTokenCell(segueMetrics);

<box modifiers={[tokens.modifier]} height={tokens.select(m => m.barHeight)} />;
```

The cell starts at the group's declared defaults and the modifier
replaces them at attach, before the first frame is drawn, so nothing
flickers through a default it was never going to keep. Bind with
`select` rather than off the cell directly: the cell publishes the
whole group, and `select` projects one token and drops a repeat, so a
theme change that moved a colour does not rewrite every padding on the
element.

Because the cell is an ordinary Observable it reaches a child, which is
the case a modifier writing properties on its own node cannot serve. A
control is usually a box with something inside it, and `color` does not
cascade from a parent node the way it does in CSS, so a button's label
binds its own colour to the same cell its box binds its padding to.

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
