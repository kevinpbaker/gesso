---
description: Rows, columns and boxes; the two alignment props; typed lengths; and the sizing rules that decide who grows.
---

# Layout basics

Gesso's layout borrows CSS's model and most of CSS's names, so a box
that would be 240 px wide in a browser is 240 px wide here, and the
engine is checked against Chrome on a few hundred generated fixtures. What is
different is that the names are typed, and there is no cascade: a
property is set on an element, and that is where it comes from.

## Three containers

| Element    | Lays children out                                    |
| ---------- | ---------------------------------------------------- |
| `<row>`    | Along the horizontal axis                            |
| `<column>` | Along the vertical axis                              |
| `<box>`    | Stacked on top of each other, aligned within the box |

`<box>` is also the plain rectangle: a background, a border and a size.
The same element is exported as `Stack` for when layering is what you
mean.

## `x` and `y` place everything

Two props do the work of `justify-content`, `align-items` and their
per-child overrides:

- **`x`** places children horizontally.
- **`y`** places children vertically.
- **`selfX` / `selfY`** let one child override its parent on that axis.

They are named for the screen rather than for the axis, so they mean the
same thing on a row as on a column. On a `row`, `x` distributes along
the main axis (`start`, `center`, `end`, `space-between`, and the rest)
and `y` places across it. On a `column` they swap roles without swapping
names.

Press either button. `x` walks the distributions, `y` walks the
cross-axis values:

<LiveExample id="layout" height="260" />

<<< @/src/examples/LayoutExample.tsx#row

**The cross axis defaults to `stretch`**, matching CSS. Stretch gives a
child the container's cross size _only when the child has not chosen
one_: the tiles above have no `height`, so they fill the row, and the
moment one takes a `height` it keeps it under every value of `y`. This
is the single most common surprise in the model, which is why the
example is built to show it.

## Lengths are values, not strings

A number is pixels. Anything else is a tagged value you import:

```tsx
import { auto, percent } from 'gesso-core';

<box width={240} />            // 240 px
<box width={percent(50)} />    // half the parent's content box
<box width={auto} />           // sized by content
```

There is no `"50%"`. A string where a length belongs throws at layout
and names the property, because the alternative is a hot path that
parses strings on every measure. Percentages resolve against the
parent's definite content box, and behave as `auto` when it has none.

## Space

`gap` between children, `padding` inside a container, `margin` outside a
child, all in pixels. Both `padding` and `margin` come with an axis and
four sides:

```tsx
<column gap={12} paddingX={24} paddingY={16}>
```

`paddingX` is the left and right of the box, `paddingY` the top and
bottom, and `marginX` and `marginY` are the same outside it. Nearly
every box is padded more on one axis than the other, so those two are
the pair to reach for; `padding` on its own is for the box that really
is padded equally.

The four sides are still there for the inset that is genuinely on one
edge, and the most specific value wins: a side beats its axis, and an
axis beats the shorthand. So

```tsx
<row padding={8} paddingX={16} paddingLeft={0}>
```

is nothing on the left, sixteen on the right, and eight top and bottom.
What has gone is the pair: `paddingLeft={24} paddingRight={24}` says
one thing twice, and `paddingX={24}` is that thing.

`padding` is a number and nothing else. It does not take a tuple or an
object, deliberately.

For a single horizontal edge, reach for `paddingStart` and `paddingEnd`
rather than `paddingLeft` and `paddingRight`. They name the edge the
reading starts and ends at, so an indent stays an indent when the
application runs right to left, and they resolve between the axis and
the physical sides. See [right to left](/layout/right-to-left).

A row and a column can also space their axes apart independently with
`rowGap` and `columnGap`. `margin` takes `auto` on either axis, which is
still the shortest way to push one child to the far end of a row.

The numbers themselves belong in a theme rather than in the markup.
`theme.spacing` is an eight step scale on the same names as the shape
scale, so a screen written from it reads `paddingX={theme.spacing.large}`
and a compact density shrinks every box on the page at once. See
[themes and the environment](/appearance/themes-and-the-environment).

## Who grows

Sizing follows flexbox, including the parts people forget:

- `flexGrow` takes a share of the space left over; `flexShrink` gives
  back a share of the overflow; `flex={1}` is the usual shorthand for
  both.
- **A flex item never shrinks below its content.** An item's automatic
  minimum is the smaller of its declared size and its min-content size,
  which is the longest word or the widest summed row. That is what stops
  a column of cards being crushed to nothing by a tall sibling. Set
  `minWidth`/`minHeight` explicitly to overrule it; scroll containers
  and clipped text have no automatic minimum by design.
- Space a clamped item cannot take is redistributed to the others,
  rather than being lost.

## When a box is the wrong size

Ask the engine rather than guessing. Every runtime can explain any
node's size: the rule that fixed each axis, the constraints it was
given, and the ancestor a change would be laid out from.

```ts
formatExplanation(runtime.explain(node));
// "shrank to 0 (flexShrink 1 …); its automatic minimum is 0:
//  a scroll container or clipped text has none"
```

The same explanation is what `gesso-testing`'s `toHaveBox` prints when
an assertion misses, so a failing layout test tells you why rather than
only what.

## Next

[Text](/guide/text) is the other half of layout: wrapping, clamping, and
what a paragraph does to the box around it.
