---
description: 'Restyling the library: the control token group on the theme, what it holds, how a provider changes it, and why no component takes a colour prop.'
---

# Restyling the controls

No component in `@gesso/components` takes a colour prop, a padding prop
or a radius prop. Restyling one is a theme, and it always reaches every
control of that kind at once rather than the one call site you happened
to be editing.

There are three layers to it, and most of the time you only need the
first.

## 1. The palette

Every control names palette tokens rather than colours:
`controlBackground` for a field's ground, `controlAccent` for a ticked
box, `danger` for an invalid border, `selectionBackground` for a chosen
row. They are resolved at paint against the theme the control is under,
so a palette of your own restyles the whole library and does it in both
appearances:

```ts
const colors = { ...lightColors, controlAccent: hex('#be9a6e'), controlBorder: hex('#e3ddd2') };
const theme = { ...lightTheme, colors };
```

[A palette of your own](/appearance/themes-and-the-environment) is the
full account. Nothing below is needed to change a colour.

## 2. The shape scale

`borderRadius` takes a name in `theme.shapes`, so a box of your own
rounds with the theme. The library's own radii are not on that scale
though, for the reason the next section gives.

## 3. The control token group

What a palette cannot say is a metric, a mapping or an interaction: how
much padding a button has, _which_ palette token its tonal variant
uses, how far a filled one dims under the pointer. Those are one group
on the theme, declared by the library:

```ts
import { controlTokens } from '@gesso/components';

const theme = withThemeExtension(lightTheme, controlTokens, {
  ...controlTokens.defaults,
  radius: { ...controlTokens.defaults.radius, field: 0, sheet: 4 }
});
```

Spreading `controlTokens.defaults` first is the honest way to start:
the group stays complete, and the tokens you have not thought about yet
still answer. Then provide it like any other theme:

```tsx
<box theme={theme}>
  <TextInput label="Name" />
</box>
```

Every field under that provider is square. You did not name `TextInput`,
`NumberInput` or `Select`, and you do not have to know which of them
exist.

### What the group holds

| Token                   | What it is                                                  |
| ----------------------- | ----------------------------------------------------------- |
| `radius.field`          | A text field, a number field, a select's trigger            |
| `radius.checkbox`       | A checkbox's box, and the row it sits in                    |
| `radius.scroller`       | A list, tree or table's own box                             |
| `radius.sheet`          | A dialog or a popover                                       |
| `button.sizes`          | Padding, radius and type role, per `small`/`medium`/`large` |
| `button.paint`          | Which palette tokens each variant and tone use              |
| `button.hoveredOpacity` | How far a filled button dims under the pointer              |
| `button.pressedOpacity` | How far it dims while held                                  |

The radii are named for the role a box plays, not for the widget it is
in, so one `field` serves three controls. They are here rather than on
`theme.shapes` on purpose: the shared scale has no name for 6 or 10,
and inventing one for a control's sake would put the library's taste in
everybody's vocabulary.

### Remapping a variant

`button.paint` is the table of palette names, so an application can
change not only what a token is but which token a variant reaches for:

```ts
const theme = withThemeExtension(lightTheme, controlTokens, {
  ...controlTokens.defaults,
  button: {
    ...controlTokens.defaults.button,
    paint: {
      ...controlTokens.defaults.button.paint,
      filled: {
        ...controlTokens.defaults.button.paint.filled,
        accent: { background: 'secondary', foreground: 'surface' }
      }
    }
  }
});
```

Every value in that table is a palette name, which is why the table
says nothing about light and dark: `controlForeground` on
`controlBackground` is ink on chalk in one appearance and chalk on ink
in the other.

## Why not a prop

A colour prop on a library component forks the theme at every call
site. The first screen that passes one has restyled one button; the
next person to change the brand has to find all of them. A provider
restyles what is under it, including components that did not exist when
the theme was written, and it composes: a nested provider restyles a
region without touching the root.

The one place the library is deliberately leaky is layout. Every
component takes `width`, `margin`, `flexGrow` and the rest and spreads
them onto its own root, because a caller has to be able to place a
control. That is a position, not a style.

## Writing a component that reads the group

A component's body runs once, before its node is in a tree, so it
cannot read the environment and anything it computes from the theme
would be frozen. `themeTokenCell` is the way in, and it is the shape
`ctx.bounds()` already has:

```tsx
const tokens = themeTokenCell(controlTokens);

return Box(
  { modifiers: [tokens.modifier], borderRadius: tokens.select(t => t.radius.field) },
  Text({ text: label, color: tokens.select(() => 'controlForeground') })
);
```

[Token groups of your own](/appearance/themes-and-the-environment)
covers the cell in full, including why bindings go through `select` and
why the label binds its own colour instead of inheriting one.
