---
description: Logical padding and margin, and what mirrors when a subtree reads right to left.
---

# Right to left

An inset named on one horizontal edge is nearly always logical rather
than physical: the space before a leading icon, the indent of a nested
row, the gutter a list keeps against the side it starts at. Written as
`paddingLeft`, all three are wrong the moment the application runs in
Arabic, and nothing marks them as the edge that should have moved.

## Logical edges

```tsx
<row paddingStart={16} paddingEnd={12}>
```

`paddingStart` is the edge the reading starts at: the left under
`textDirection="ltr"`, the right under `"rtl"`. `marginStart` and
`marginEnd` are the same outside the box.

This is the pair the documentation teaches for a single horizontal edge.
`paddingLeft` and `paddingRight` stay, and are still the answer for an
edge that is genuinely physical: a gutter kept clear of an overlay
scrollbar sits on the same side in both directions.

Resolution is most specific wins, as everywhere else in the box model:
**side, then logical side, then axis, then the shorthand.** A physical
name beats the logical one that landed on the same edge, because it is
the more specific statement of the two. So

```tsx
<row padding={8} paddingStart={20} paddingLeft={4}>
```

is four on the left whichever way it reads. See
[layout basics](/guide/layout-basics) for `paddingX` and the rest of the
box model, and `decisions/0079` for why `padding` is a single number.

There is no `paddingBlockStart`. The vertical axis does not reverse in
any writing mode Gesso supports, so `paddingTop` says what it means.

## Putting a subtree into right to left

The direction is a field of a text style, and a text style is what the
theme's typography is made of. So one value at the root mirrors
everything under it:

```ts
function readingRightToLeft(theme: UiTheme): UiTheme {
  const typography = Object.fromEntries(
    Object.entries(theme.typography).map(([role, style]) => [role, { ...style, textDirection: 'rtl' }])
  );
  return { ...theme, typography };
}
```

Every role, not only the one the root provides. An element that names a
role takes that role's style whole, direction included, so a theme whose
body reads one way and whose headings read the other would mirror a page
in pieces.

`textDirection` on an element is still an ordinary property, and it
mirrors that element's own box. It does not reach the element's
children, because it is not a provider; the theme is.

## What mirrors

Everything the box model decides:

| Under `rtl`                    | What happens                                                              |
| ------------------------------ | ------------------------------------------------------------------------- |
| A `<row>`'s main axis          | Runs right to left. Order, alignment and auto margins all mirror.         |
| A `<column>`'s `x` / `selfX`   | `start` is the right edge, `end` the left.                                |
| A wrapping `<column>`'s lines  | Stack right to left, and `wrap-reverse` cancels it.                       |
| A `<box>`'s `x` / `selfX`      | Same as a column's: a stack's start edge is the right one.                |
| A `<grid>`'s columns           | The first track is the right-hand one, and cell alignment goes with it.   |
| `paddingStart` / `marginStart` | Resolve to the right edge.                                                |
| A custom layout's `place`      | Its `start` coordinate is measured from the right.                        |
| An overlay scrollbar           | The vertical bar hangs on the left, and so does the band that reveals it. |

Two things do not, and should not:

- **`left`, `right`, `top`, `bottom` and `inset`** are physical, as they
  are in CSS. A node pinned to `left={0}` is on the left in both
  directions.
- **A stretched child is symmetric**, except when its own maximum cuts
  it short of the box; the leftover is then at the start edge, which
  moves with the reading.

All twenty of those cases are graded against Chrome, case by case, by
`packages/core/src/layout/conformance`.

## What does not mirror yet

This is the box half of internationalisation. The text half is a
separate workstream: message formatting with plurals, a locale cell, and
`Intl`-backed dates and numbers are not here yet, and neither is an
icon that knows it should be flipped.

The playground's **Layout** example has a **Mirror** switch, which
swaps the theme for its mirrored twin at runtime. Everything in the
table above moves; nothing on the page is written twice.
