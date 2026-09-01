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

`<box>` is also the plain rectangle, meaning a background, a border and
a size, and it is exported as `Stack` when what you mean is layering.

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
import { auto, percent } from '@gesso/core';

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
child, all in pixels, each with a per-side property beside it:

```tsx
<column gap={12} padding={16} paddingLeft={24} paddingRight={24}>
```

A row and a column can also space their axes apart independently with
`rowGap` and `columnGap`. `margin` takes `auto` on either axis, which is
still the shortest way to push one child to the far end of a row.

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

The same explanation is what `@gesso/testing`'s `toHaveBox` prints when
an assertion misses, so a failing layout test tells you why rather than
only what.

## Next

[Text](/guide/text) is the other half of layout: wrapping, clamping, and
what a paragraph does to the box around it.
