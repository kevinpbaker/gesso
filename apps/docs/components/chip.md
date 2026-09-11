---
description: 'Chip: a pill that is on or off, for a row of filters, with its variants, props, keyboard map and semantics.'
---

# Chip

A pill that is on or off. Reach for it when a row of options narrows
what a list below shows: the genres above a catalogue, the languages of
a feed, the switches along a toolbar. Each chip names one option and a
press turns it on or off; the chips that are on say what the list is
showing. When the options are exclusive and the row is the whole
control, [Tabs](/components/tabs) says so more clearly; when the option
takes effect on a form's submit rather than at once, a
[Checkbox](/components/checkbox) does.

A chip is a toggle button and announces itself as one: the role is
`button` and `pressed` follows `selected`, which is what `aria-pressed`
is for. A chip that is never on, such as "Clear filters" or "Back", is
the same component with `selected` left off, and it reads as a plain
button.

<LiveExample id="chip" height="260" />

<<< @/src/examples/ChipExample.tsx#chip

Tab into the rows and try them. The genre row is controlled: the
application holds one cell, every chip reads whether it is the chosen
one, and a press writes the cell rather than the chip. "All" is on
until a genre is pressed, and its accessible name says so: "All,
showing", then "Show all". The toolbar row below is outlined and small,
with two switches, a glyph, a chip that is never on and one that is
disabled.

## Props

| Prop              | Type                          | Default    | What it does                                                                                 |
| ----------------- | ----------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `label`           | `string`                      | `''`       | The word on it, and the accessible name unless `name` says more                              |
| `name`            | `string`                      | the label  | The accessible name, when it should say more than the word; the count joins the label if not |
| `description`     | `string`                      | `''`       | Longer help, for a word that cannot say everything                                           |
| `selected`        | `boolean`                     | none       | Whether it is on, when the application owns it. Supplying this makes the chip controlled.    |
| `defaultSelected` | `boolean`                     | none       | The starting value, when the chip owns it. Supplying this makes the chip self-managing.      |
| `onPress`         | `(selected: boolean) => void` | none       | Fired on a click and on Enter or Space, with the value the chip would take                   |
| `count`           | `number` or `string`          | none       | A figure after the word, in the same colour at the normal weight, read after the word too    |
| `icon`            | `string`                      | none       | SVG path data for a glyph before the word, on the usual 24 grid                              |
| `variant`         | `ChipVariant`                 | `'filled'` | What the chip is made of: `filled` or `outlined`                                             |
| `size`            | `ChipSize`                    | `'medium'` | How big it is: `small` or `medium`                                                           |
| `textStyle`       | `UiTypographyRole`            | the size's | The role the word is set in, for a code or a figure that wants the monospace role            |
| `disabled`        | `boolean`                     | `false`    | Refuses presses and keys, and draws the word in the disabled foreground token                |
| `ref`             | `UiNodeRef`                   | none       | Receives the node that is the chip, for focusing it or anchoring something to it             |

Neither `selected` nor `defaultSelected` has a default in the sense of
a value the component substitutes. Supplying neither makes a plain
button: never on, with `onPress` firing `true`, the value a chip that
could be on would take. That is deliberately not what a checkbox does
with neither, because a chip that is never on is a thing a row of chips
actually has, and a "Clear filters" that quietly turned itself on when
pressed would be a bug. Supplying both throws.

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too.

## Controlled and uncontrolled

```tsx
// Controlled: the application owns the value, and the chip shows it.
<Chip label="Metal" selected={computed(() => genre.value === 'Metal')} onPress={() => (genre.value = 'Metal')} />

// Uncontrolled: the chip owns the value, and reports changes if asked.
<Chip label="Verified only" defaultSelected onPress={next => save(next)} />
```

The controlled form is the one a row of filters wants, because one cell
holds the choice and every chip reads it; there is no way for two chips
to be on at once, and nothing to keep in step. It also lets the
application decline: `onPress` fires with the value the chip would take,
and if nothing writes back then the chip does not move.

## One word, and a name that can say more

`label` is the word on the chip and, by default, what a screen reader
says. A chip in a row that filters a page reads "Metal"; what pressing
it does is "Show Metal, 119,205 tracks", and that is worth saying to
someone who cannot see the row. `name` replaces the announced name
without touching the word:

```tsx
<Chip label="Metal" name={computed(() => (on.value ? 'Metal, showing' : 'Show Metal, 119,205 tracks'))} />
```

`count` is for a figure that should be seen as well as heard. It is
drawn after the word at the normal weight, so it reads as a count beside
a word rather than as a second word, and it joins the accessible name
as "Metal, 119,205" unless `name` replaces it.

## The two axes

| Axis      | Values               | What it says             |
| --------- | -------------------- | ------------------------ |
| `variant` | `filled`, `outlined` | What the chip is made of |
| `size`    | `small`, `medium`    | How big it is            |

`filled` is a sheet in `controlBackground` with muted words; on, it
inverts, painting itself in `controlForeground` with the sheet's colour
for words, which is ink on chalk becoming chalk on ink in one appearance
and the reverse in the other. It is the loud choice for a row that
filters a whole page. `outlined` is a ring of `controlBorder` around
muted words; on, it fills with the selection pair and takes the accent
for its ring, which is quieter and suits a toolbar where a dozen chips
sit beside the words they filter.

The words of a chip that is off are `textMuted` rather than
`controlForeground`, on purpose: a row of filters is a row of quiet
things with one or two loud ones, and that contrast is what tells a
reader which is which.

`small` and `medium` share their vertical metrics with
[Button](/components/button)'s `small` and `medium`, so a chip and a
button on one row are the same height, and take one step more of
horizontal padding because a pill wants more room at its round ends
than a rectangle does. Both are read once when the chip is built, as
the button's axes are: a chip that has to change variant should change
its `key`.

## Hover, press and focus

Built in, and not a prop.

The hovered ground of a chip depends on whether it is on, and the
`interactive` modifier's overrides are ordinary values written over the
bound one. The private chips that came before this component learnt
what that does: a chosen chip under the pointer went light while its
words stayed white, so the one chip the person was pointing at was the
one they could not read. This chip hands the modifier cells rather than
tokens, which the modifier host follows for as long as it is attached,
so the hovered ground moves with the state. Off, either variant hovers
to `controlBackgroundHovered` and presses to `controlBackgroundPressed`,
as every other control in the library does. An outlined chip that is on
does the same over its wash. A filled chip that is on is painted in the
foreground itself and has nowhere to move to, so it dims, to 0.88 and
then 0.76, as the filled button does.

The cursor is `pointer` and the focus ring is `CONTROL_FOCUS_RING`, the
same one the inputs tier draws. Neither is optional.

## Keyboard

The chip is one tab stop. Both bindings toggle, and the element
consumes them, so nothing above the chip sees the key.

| Key     | What it does                                   |
| ------- | ---------------------------------------------- |
| `Space` | Toggles the chip                               |
| `Enter` | Toggles the chip                               |
| `Tab`   | Not bound: focus moves on as it normally would |

A disabled chip takes neither.

## Semantics

| What        | Value                                                                     |
| ----------- | ------------------------------------------------------------------------- |
| Role        | `button`, on the pill that takes focus                                    |
| Name        | `name`, else `label` with `count` after it                                |
| Description | `description`                                                             |
| States      | `pressed` while `selected`                                                |
| Disabled    | `disabled` is carried on the record, and inherited by everything under it |

The states arrive as they change rather than being read once, so a chip
the application turns on from elsewhere updates what an assistive
technology hears without anything re-rendering. The word inside the
pill has no record of its own, for the reason a checkbox's label has
none.

## Colours

None of them are props. `Chip` reads the control tokens from whatever
theme it inherits, like everything else in the library, and restyling
one is a theme provider around it. That is the mechanism [themes and
the environment](/appearance/themes-and-the-environment) describes.

## What this page was checked against

`Chip.spec.ts` mounts the component with `@gesso/testing` and asserts
the label as the word and the name, `pressed` following `selected`,
that a controlled chip reports a press and does not move until the
application writes back, that `defaultSelected` makes it self-managing
and supplying both throws, that Space and Enter toggle it and a disabled
one refuses both, that `name` and `count` shape the announced name,
that every colour on both variants in both states is a palette name,
that the hover token and the dimmed opacity follow the state while the
pointer stays, and that the sizes name a type role rather than a size.
`ChipExample.spec.ts` asserts what the example above claims, by role
and name. The keyboard gallery reaches the chip by Tab and turns it on
with Space.

## Next

[Tabs](/components/tabs) is the control for options that are exclusive
and are the whole of a screen's navigation, and
[Checkbox](/components/checkbox) is for an option that takes effect
when a form is submitted.
