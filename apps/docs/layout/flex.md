---
description: Direction, the two axes, grow and shrink and basis, wrapping, and the places the model parts company with CSS.
---

# Flex in full

[Layout basics](/guide/layout-basics) covers the shape of the model:
`<row>`, `<column>` and `<box>`, the `x` and `y` props, typed lengths,
and the fact that the cross axis stretches by default. This page is the
rest of flexbox: what decides an item's main size, what happens when the
items do not fit, and where the model parts company with CSS.

## The element is the axis

CSS has one `display: flex` and a `flex-direction` to point it. Gesso
has two elements instead:

| Element    | Main axis  | Cross axis |
| ---------- | ---------- | ---------- |
| `<row>`    | Horizontal | Vertical   |
| `<column>` | Vertical   | Horizontal |

The axis is the tag, not a property, so a screen's structure reads off
its markup. `direction` is still a property, and on a row or a column
it is read for one thing: a value ending in `-reverse`
(`'row-reverse'`, `'column-reverse'`) runs the main axis backwards, and
alignment, item order and auto margins all mirror with it. Setting
`direction="column"` on a `<row>` does nothing; write a `<column>`.

A `<scrollview>` is the third container that lays its children out in a
line, and it is the exception on both counts: its axis does come from
`direction`, defaulting to a column, and its items never flex. A
viewport exists in order to overflow, so a scroll container hands each
child the size it asked for and lets the content run past the edge.

## Four items, four rules

The row below is 520 px wide. Press **Width** to narrow it to 400 and
then 300, and **Wrap** to turn `flexWrap` on:

<LiveExample id="flex" height="260" />

<<< @/src/examples/FlexExample.tsx#bar

At 520 px the two `flex` items split the leftover exactly one to two. At
300 px there is no leftover: `fixed 96` refuses to shrink, `basis 140`
gives up what it can, and the items still do not fit, so the row
overflows rather than crushing them. Turn wrapping on and the last item
takes a line of its own.

## Main size: basis, then grow or shrink

| Prop         | Default | What it decides                                                                      |
| ------------ | ------- | ------------------------------------------------------------------------------------ |
| `flexBasis`  | unset   | The main size the item starts at. Unset means the size it measures at.               |
| `flexGrow`   | `0`     | Share of the leftover space this item takes.                                         |
| `flexShrink` | `1`     | Share of the overflow this item gives back, weighted by its basis.                   |
| `flex`       | unset   | The shorthand: `flex={n}` is grow _n_, shrink 1, basis 0, exactly as CSS's `flex: n` |

The order matters more than the names. Every item is first measured on
an unbounded main axis, which is its max-content size and its flex base
when `flexBasis` is unset. Those bases are what the container adds up to
decide whether there is space over or space short. Only then does one
factor apply: everything grows, or everything shrinks, never both in the
same pass.

That is why `flex={n}` reads so differently from `flexGrow={n}`. The
shorthand sets a basis of zero, so the item brings nothing to the sum
and its share is a share of the whole leftover: two items at `flex={1}`
and `flex={2}` come out exactly one to two whatever they contain.
`flexGrow={n}` on its own leaves the basis at the item's measured size,
so the growth is added on top of content that differs per item, and the
ratio you get is not the ratio you wrote.

Shrinking is weighted rather than even: an item's share of the overflow
is scaled by its basis, so a wide item gives up more pixels than a
narrow one at the same factor. `flexShrink={0}` opts out entirely, which
is what keeps the third item in the example at 96 px however narrow the
row gets.

Clamping is resolved in a loop rather than in one pass. An item whose
`minWidth`, `maxWidth` or automatic minimum fought the distribution is
frozen at the clamp, and the space it could not take is offered to the
items that can still move, until nothing is left to redistribute.

## Nothing shrinks below its content

An item's automatic minimum is the smaller of its declared main size and
its min-content size: the longest word for text, and for a container
whatever its own children insist on.
[Layout basics](/guide/layout-basics) states the rule; what it means for
a row is that a row can overflow. Once the items' minimums add up to
more than the container has, shrinking stops and the content runs past
the padding edge, which is what CSS does too.

Three ways out, in the order worth trying:

- **Wrap.** `flexWrap="wrap"` turns the overflow into a second line.
- **Let something clip.** A `<scrollview>`, or text with `maxLines` or
  `textOverflow="ellipsis"`, has no automatic minimum by design, so it
  is free to shrink and its own content scrolls or truncates inside it.
- **Overrule it.** An explicit `minWidth` or `minHeight` wins over the
  automatic one.

## Wrapping

`flexWrap` takes `'nowrap'` (the default), `'wrap'` or `'wrap-reverse'`.
Items go onto a line while their sizes and the gaps between them fit,
and an item that fits nowhere gets a line to itself. Each line then
resolves its own grow and shrink separately, so the same item can be
shrunk on a crowded line and sit at its full basis on a line of its own.

The gaps split by role rather than by name:

| Prop        | On a row                | On a column             |
| ----------- | ----------------------- | ----------------------- |
| `columnGap` | Between items           | Between wrapped lines   |
| `rowGap`    | Between wrapped lines   | Between items           |
| `gap`       | Both, unless overridden | Both, unless overridden |

`alignContent` distributes a wrapping container's lines across the cross
axis: `'stretch'` (the default), `'start'`, `'center'`, `'end'`,
`'space-between'`, `'space-around'` or `'space-evenly'`. It has
something to do only when the container's cross size is larger than its
lines need; stretch, the default, grows the lines to fill it.

```tsx
<row flexWrap="wrap" alignContent="start" rowGap={8} columnGap={12} height={200}>
```

## Alignment, and words that do not apply

`x` and `y` place children, `selfX` and `selfY` let one child override
its parent, and [Layout basics](/guide/layout-basics) covers what each
value does. Three things that page does not say:

- **A word that does not apply to an axis is ignored.**
  `'space-between'` and its siblings are main-axis distributions, so
  `y="space-between"` on a row changes nothing and the cross axis keeps
  its default of `'stretch'`. Nothing throws; the engine simply has no
  meaning for it there.
- **`'baseline'` is a row's word.** A column treats it as `'start'`,
  because there is no shared baseline to align to down a column.
- **Auto margins are resolved first.** `margin={auto}` on the main axis
  absorbs the free space before `x` or `y` ever sees it, so an item with
  an auto margin beats the container's distribution rather than
  negotiating with it.

## Where this differs from CSS

| CSS                                        | Gesso                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `display: flex` plus `flex-direction`      | `<row>` and `<column>`; `direction` is read only for a `-reverse` suffix |
| `justify-content`, `align-items`           | `x` and `y`, named for the screen rather than for the axis               |
| `align-self`                               | `selfX` and `selfY`                                                      |
| `flex: 1 1 auto` parsed from a string      | `flexGrow`, `flexShrink`, `flexBasis`; `flex={n}` is the one shorthand   |
| `order`                                    | No such property. Put the children in the order you want them            |
| `gap: 5%`                                  | `gap`, `rowGap` and `columnGap` are pixels                               |
| `width: 50%`                               | `percent(50)`; a string where a length belongs throws at layout          |
| Items flex inside an overflowing container | Items in a `<scrollview>` never flex                                     |
| `align-items: baseline` down a column      | A column treats `'baseline'` as `'start'`                                |

## What the numbers were checked against

The engine is compared box for box against headless Chrome, on a couple
of hundred generated fixtures that run as part of the ordinary test
suite. Flex carries most of them: grow and shrink weightings,
redistribution after a clamp, wrapping and `alignContent`, reverse and
right-to-left rows, auto margins, percentages and aspect ratios. Chrome
152 generated the current expectations, and it is the only browser they
were taken from.

One disagreement is recorded rather than fixed: a container that
shrink-wraps its items counts their `flexBasis` toward its own size,
where Chrome sizes it from item content and ignores the basis. Browsers
do not agree with each other on that case either.

None of this changes with the renderer. Boxes are computed once by the
layout engine, and Canvas2D and WebGPU both read the result; both also
measure text through the same measurer, so a line breaks in the same
place and an item is the same width either way.

## Next

[Grid](/layout/grid) is the two-dimensional half: tracks that several
rows share, spans, and the point at which nesting rows inside columns
stops being the right answer.
