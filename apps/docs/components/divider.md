---
description: 'Divider: a one pixel rule between things, on either axis, announced as a separator and named by nothing.'
---

# Divider

`Divider` is a rule: one pixel in the `border` colour, horizontal or
vertical, drawn between things that are related but distinct. Reach for
it where a gap alone is not quite enough, and prefer a gap where it is.

It takes no state, answers no keys, and cannot be clicked or focused. A
rule is furniture, and this component's whole job is to be furniture
that an assistive technology also understands as furniture.

<LiveExample id="structure" height="300" />

The example shows all three structure components at once, a
[card](/components/card) holding a [toolbar](/components/toolbar) and
two rules, because that is how they are used. The rules are the part
below: one vertical, between the origin and the destination, and one
horizontal under them.

<<< @/src/examples/StructureExample.tsx#divider

## Props

| Prop        | Type                | Default | What it does                                             |
| ----------- | ------------------- | ------- | -------------------------------------------------------- |
| `direction` | `'row' \| 'column'` | `'row'` | `'row'` is a horizontal rule, `'column'` a vertical one. |

That is the whole of it. The colour is the `border` token rather than a
prop, and the thickness is one pixel rather than a prop, so a theme
moves every rule at once.

`direction` is read once, when the component is built, rather than
bound. Passing an Observable there gives you the rule it resolved to on
the first frame and nothing after that, so a rule that turns has to be
two rules chosen between.

### Sizing, which the rule mostly does itself

A rule writes its own size after the caller's layout props, so three of
them do not reach it:

- A horizontal rule sets `height: 1` and `flexGrow: 1`, and clears
  `width`.
- A vertical rule sets `width: 1`, and clears `height` and `flexGrow`.

Everything else on the shared layout props does arrive, margins
included, which is the usual way to inset a rule from the edge of what
it is dividing.

Two consequences to hold on to, both of which the spec pins down:

- **A vertical rule takes its height from the row it is in.** It asks
  for none of its own, so a row that centres its children leaves it
  nothing to stretch into and it disappears. Put it in a row that
  stretches, which is what the example does, or give the row a definite
  height.
- **A horizontal rule grows on the main axis, whichever that is.**
  Inside a row, `flexGrow: 1` is what spans it across. Inside a column
  with spare height, that same growth claims the spare height and the
  rule becomes a block. Keep a horizontal rule in a column that is
  sized by its content, which is the ordinary case, or put it in a row
  of its own.

`rootModifiers` is declared on the shared props type but is not attached
by this component, so a modifier passed there does nothing.

## Keyboard

None. A rule is not a tab stop and binds no keys.

## Semantics

| What    | Value                                                                 |
| ------- | --------------------------------------------------------------------- |
| Role    | `separator`                                                           |
| Name    | None. A rule with a name would be noise on every screen it appears on |
| States  | None                                                                  |
| Pointer | Not hit testable, so a press passes through it to whatever is behind  |

`separator` with no name is the whole announcement, which is the point:
a screen reader can use it as a boundary without reading anything out.
`hitTestable` is off, so a rule laid across a surface cannot swallow a
press meant for the surface, and the spec beside the example proves that
the press arrives underneath.

## Next

[Card](/components/card) is the surface a rule usually sits on, and
[Toolbar](/components/toolbar) is the row of controls a vertical rule is
often asked to split. A toolbar centres its content, so a rule inside
one needs a row of its own that stretches.
