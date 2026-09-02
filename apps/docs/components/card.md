---
description: 'Card: a bordered surface with an optional heading, and the group it announces around whatever you put on it.'
---

# Card

`Card` is a surface that groups what is on it: a padded column on the
`surface` colour, with a one pixel border, a rounded corner and an
optional heading at the top. Reach for it when a set of things belongs
together and the screen would otherwise read as one undifferentiated
list.

It holds no state and answers no keys. What it adds beyond the box you
would have drawn yourself is a `group` role with a name, so the
grouping is something an assistive technology can hear rather than
something only the eye can see.

<LiveExample id="structure" height="300" />

The example shows all three structure components at once, a card
holding a [toolbar](/components/toolbar) and two
[rules](/components/divider), because that is how they are used. The
card is the part below.

<<< @/src/examples/StructureExample.tsx#card

## Props

| Prop       | Type      | Default      | What it does                                                                                   |
| ---------- | --------- | ------------ | ---------------------------------------------------------------------------------------------- |
| `title`    | `string`  | `''`         | A heading drawn above the content at 15px and weight 600. An empty title draws nothing at all. |
| `label`    | `string`  | `''`         | The group's accessible name. Falls back to `title`, so a card with a heading needs no label.   |
| `padding`  | `number`  | `16`         | The inset between the card's border and everything inside it.                                  |
| `children` | `UiChild` | an empty row | What the card holds.                                                                           |

The gap between the heading and the content is 12 and is not a prop.
Neither are the colours: the fill is the `surface` token and the border
is `border`, so a theme restyles every card at once and no call site
forks the palette.

A card with neither a `title` nor a `label` is still a `group`, with an
empty name. That is worth avoiding: a group a screen reader cannot name
is a boundary it announces and cannot explain. Give it one or the other.

### What goes on a card

A card's content is its child, written between the tags:

```tsx
<Card title="Shipment 4192">
  <column gap={12}>{/* … */}</column>
</Card>
```

It is a single child rather than a list, so several things inside a card
go in a `column` or a `row`, which is what the example does. It is also
read once, when the component is built, because the component body runs
once: content that changes is one element with an Observable inside it
rather than an Observable that resolves to an element.

### Layout and modifiers

The [shared layout props](/components/#layout-is-yours) land on the card's column. A card
sizes itself to its content, so `width` is usually the one prop worth
passing.

`rootModifiers` is declared on the shared props type but is not attached
by this component, so a modifier passed there does nothing. Put it on a
box around the card until that changes.

## Keyboard

None. The card binds no keys and is not a tab stop; whatever you put
inside it keeps its own keyboard behaviour, and the card neither adds to
it nor swallows any of it.

## Semantics

| What    | Value                                                                  |
| ------- | ---------------------------------------------------------------------- |
| Role    | `group`, on the column that is the card                                |
| Name    | `label`, or `title` when no label was given, or empty when neither was |
| States  | None. A card has nothing to be                                         |
| Content | Nothing of its own: what is inside a card announces itself as it is    |

`group` is the honest role. It says "these belong together" and nothing
more, which is exactly what a card means; a card with a heading is not a
landmark, and calling it one would put it in a screen reader's list of
regions beside the real navigation.

The name is bound to `label` and recomputed every time that changes, but
the fallback reads the title as it stands at that moment rather than
following it. So a card whose title changes while its label stays empty
draws the new heading and keeps the old name. Pass a `label` as well
wherever the title is not fixed; the spec beside the example holds that
behaviour in place so it cannot change without being noticed.

## Next

[Divider](/components/divider) is the rule inside a card, and
[Toolbar](/components/toolbar) is the row of controls at the top of one.
