---
description: 'Toolbar: a bordered row of controls that belong together, announced once as a group; given items, it draws its own tool buttons with shortcut tooltips, one tab stop, and folds what does not fit into a ⋯ menu.'
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

## Tools that fold into ⋯

Give the toolbar `items` instead of children and it draws the buttons
itself. What you get for that:

- **Folding.** The tools that do not fit the width the toolbar is given
  fold, from the end, into a ⋯ button at its end, and come back when
  there is room. The ⋯ menu lists them with their shortcuts, and a tool
  chosen there is `onSelect`ed like one pressed on the bar.
- **Tooltips.** Each button's tooltip is its label and its shortcut,
  `Rectangle  R`. With `shortcutBadges`, a one- or two-letter shortcut is
  also drawn small in the button's corner, as drawing programs do.
- **One tab stop.** Tab reaches the toolbar once, on the last button
  used; the arrows walk the buttons, ⋯ included, and Home and End go to
  the ends. This is ARIA's toolbar pattern, which a row of children
  does not get (see [Keyboard](#keyboard)).
- **Pressed tools.** An item with `pressed` is drawn pressed and
  announced as `pressed`, and is a checkbox row in the ⋯ menu.

<LiveExample id="toolbaroverflow" height="260" />

<<< @/src/examples/ToolbarOverflowExample.tsx#items

What decides the width is the toolbar's own box. Where it can be as
wide as all its tools it is; where something holds it narrower (a
`maxWidth`, a row that shrinks it, an absolutely placed toolbar with
both `left` and `right`) the row of tools is what gives way. A toolbar
that is free to grow never folds, so give a floating one a `maxWidth`:
the room to the edge of what it floats over.

Every tool stays laid out while it is folded, hidden, so the toolbar
always knows how wide each one is and nothing jumps when one comes
back. A folded tool is out of the semantics tree and the tab order:
the ⋯ button, which says `collapsed` or `expanded`, is how a screen
reader reaches it.

| Item field  | Type            | What it does                                                                                       |
| ----------- | --------------- | -------------------------------------------------------------------------------------------------- |
| `value`     | `string`        | What `onSelect` is called with, and the item's identity across updates.                            |
| `label`     | `string`        | The button's name, its tooltip and its ⋯ menu row.                                                 |
| `icon`      | `() => UiChild` | Drawn instead of the label. Called once, when the button is built.                                 |
| `shortcut`  | `string`        | Said in the tooltip, as the button's description, in the ⋯ menu and, with `shortcutBadges`, drawn. |
| `pressed`   | `boolean`       | On or off, or the chosen one of a set. Left out, the button is an action.                          |
| `disabled`  | `boolean`       | Drawn dim, refuses presses, skipped by the arrows.                                                 |
| `separator` | `boolean`       | A rule before it, and a group in the ⋯ menu. Ignored on the first.                                 |

`items` can be a cell. Only a change to which items there are, or
where the rules fall, rebuilds the row; a `pressed` or a label that
changes is followed by the button that has it, so pressing a tool from
the keyboard leaves focus on the button pressed.

`keepFocus` makes a pointer press leave keyboard focus where it was.
A canvas that answers to tool keys (V, L, R) keeps them after a tool is
chosen with the mouse; the keyboard still reaches every button.

## Props

| Prop             | Type                      | Default      | What it does                                                                     |
| ---------------- | ------------------------- | ------------ | -------------------------------------------------------------------------------- |
| `label`          | `string`                  | `'Toolbar'`  | The group's accessible name. It is not drawn, so say what these controls act on. |
| `children`       | `UiChild`                 | an empty row | The controls. With `items`, drawn after the tools and never folded.              |
| `items`          | `ToolbarItem[]`           | none         | Tools the toolbar draws, folds and keys itself. See above.                       |
| `onSelect`       | `(value: string) => void` | none         | A tool pressed, on the bar or in the ⋯ menu.                                     |
| `moreLabel`      | `string`                  | `'More'`     | The ⋯ button's name and tooltip.                                                 |
| `shortcutBadges` | `boolean`                 | `false`      | Draws a short shortcut in its button's corner.                                   |
| `keepFocus`      | `boolean`                 | `false`      | A pointer press leaves keyboard focus where it was.                              |

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

With `items`: one tab stop, on the last button used. Left and Right
walk the buttons on the bar and then ⋯, wrapping; Home and End go to
the first and the last; Enter and Space press the focused button, and
on ⋯ open the menu, as Down does. The menu then owns the keys.

With children: none. `Toolbar` binds no keys and is not a tab stop, so Tab and
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
