---
description: 'Toolbar: a bordered row of controls that belong together, announced once as a group rather than as loose buttons.'
---

# Toolbar

`Toolbar` is a row of controls that belong together: the actions over a
document, the formatting buttons above an editor, the three things you
can do to the record on screen. It is a padded row on the `surface`
colour with a one pixel border and a rounded corner, and it lays its
content out centred on the cross axis with a gap of 6.

What it adds beyond that row is one `toolbar` role with one name, so an
assistive technology announces the group once instead of describing
three loose buttons that happen to be adjacent. The buttons inside stay
exactly what they were: ordinary tab stops, with their own names and
their own keys.

<LiveExample id="structure" height="300" />

The example shows all three structure components at once, a
[card](/components/card) holding a toolbar and two
[rules](/components/divider), because that is how they are used. The
toolbar is the part below.

<<< @/src/examples/StructureExample.tsx#toolbar

## Props

| Prop       | Type      | Default      | What it does                                                                     |
| ---------- | --------- | ------------ | -------------------------------------------------------------------------------- |
| `label`    | `string`  | `'Toolbar'`  | The group's accessible name. It is not drawn, so say what these controls act on. |
| `children` | `UiChild` | an empty row | The controls.                                                                    |

The default name is the word `Toolbar`, which is true and unhelpful on a
screen with two of them. Name it after what it acts on.

The gap of 6, the padding of 6 and the centring are not props, and
neither are the colours: the fill is the `surface` token and the border
is `border`.

### What goes in a toolbar

A toolbar's controls are its child, written between the tags:

```tsx
<Toolbar label="Shipment actions">
  <row gap={6} y="center">
    {/* … */}
  </row>
</Toolbar>
```

It is a single child rather than a list, so the controls go in a `row`
inside it, which means that row is where the spacing between them is
decided. It is also read once, when the component is built, because the
component body runs once: a set of controls that changes is one element
with an Observable inside it rather than an Observable that resolves to
an element.

Because the toolbar centres what it holds, a vertical
[Divider](/components/divider) placed directly in it has no height to
take and disappears. Put the rule in a row that stretches instead.

### Layout and modifiers

The [shared layout props](/components/#layout-is-yours) land on the toolbar's row.

`rootModifiers` is declared on the shared props type but is not attached
by this component, so a modifier passed there does nothing. Put it on a
box around the toolbar until that changes.

## Keyboard

None. `Toolbar` binds no keys and is not a tab stop, so Tab and
Shift+Tab walk the controls inside it one at a time, and each control
answers its own keys.

That is worth being explicit about, because ARIA's toolbar pattern is
usually a single tab stop with the arrows moving between the controls,
and this is not that. What you get here is grouping and a name.

## Semantics

| What    | Value                                                              |
| ------- | ------------------------------------------------------------------ |
| Role    | `toolbar`, on the row that is the toolbar                          |
| Name    | `label`, defaulting to `Toolbar`                                   |
| States  | None. A toolbar has nothing to be                                  |
| Content | Nothing of its own: every control inside announces itself as it is |

The children of a toolbar are not presentational, so a button inside one
is still a `button` with its own name, and the spec beside the example
finds all three of them that way and drives one of them by name.

## Next

[Card](/components/card) is the surface a toolbar usually sits at the
top of, and [Divider](/components/divider) is the rule that splits one
group of controls from the next.
