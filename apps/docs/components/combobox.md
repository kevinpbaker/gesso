---
description: 'Combobox: a value chosen by typing, a text field that filters a list, for one value or several, with its props, keys and active-descendant semantics.'
---

# Combobox

A value chosen by typing. Reach for it when the list is one a person
searches rather than reads: forty people to assign, two hundred labels.
Typing narrows the list to the options that match, best first, and the
highlight walks the matches while the caret stays in the field.

When the list is short enough to read, a [select](/components/select) is
better: it shows every answer the moment it opens and needs no typing.

<LiveExample id="combobox" height="360" />

<<< @/src/examples/ComboboxExample.tsx#combobox

Tab into Assignee and type `design`: Kim is found by a keyword, and Enter
assigns her. Alan is disabled, so the arrows step over him. In Labels,
each Enter toggles a label and the list stays open for the next one;
Backspace in the empty field takes the last one off.

## Props

| Prop             | Type                                  | Default        | What it does                                                                                  |
| ---------------- | ------------------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `options`        | `readonly ComboboxOption[]`           | required       | The options. Declare the array once.                                                          |
| `value`          | `string`                              | none           | The chosen value, `''` for none, when the application owns it.                                |
| `defaultValue`   | `string`                              | none           | The value to start on, when the combobox owns it.                                             |
| `onChange`       | `(value: string) => void`             | none           | Called with the value chosen.                                                                 |
| `multiple`       | `boolean`                             | `false`        | Several values: each choice toggles one, and the list stays open.                             |
| `values`         | `readonly string[]`                   | none           | The chosen values in `multiple`, when the application owns them.                              |
| `defaultValues`  | `readonly string[]`                   | none           | The values to start on in `multiple`, when the combobox owns them.                            |
| `onValuesChange` | `(values: readonly string[]) => void` | none           | Called with the values after a choice or a removal.                                           |
| `label`          | `string`                              | `''`           | Drawn above the field, and the name of the field and the list.                                |
| `labelHidden`    | `boolean`                             | `false`        | The label still names the field but isn't drawn.                                              |
| `placeholder`    | `string`                              | `''`           | Drawn in the empty field.                                                                     |
| `description`    | `string`                              | `''`           | Shown under the field and read after its name.                                                |
| `error`          | `string`                              | `''`           | What's wrong, shown in place of the description; implies `invalid`.                           |
| `invalid`        | `boolean`                             | `false`        | Draws the border in `danger` and adds the `invalid` state.                                    |
| `required`       | `boolean`                             | `false`        | Adds the `required` state. It enforces nothing.                                               |
| `disabled`       | `boolean`                             | `false`        | Refuses typing and presses, and greys the field.                                              |
| `emptyText`      | `string`                              | `'No matches'` | Shown in the list when nothing matches.                                                       |
| `onQueryChange`  | `(query: string) => void`             | none           | Called with the text as it's typed, for a list searched somewhere else.                       |
| `filter`         | `boolean`                             | `true`         | Filters `options` by what's typed. `false` shows them as given, already narrowed by a search. |
| `listHeight`     | `number`                              | `280`          | The list's tallest before it scrolls. The highlight is kept in view as it moves.              |
| `ref`            | `UiNodeRef`                           | none           | Receives the field, for focusing it or anchoring something to it.                             |

A `ComboboxOption` is a `value` and a `label`, plus an optional `detail`
drawn quieter beside the label (a handle, a team), `keywords` it also
answers to, and `disabled`.

## Matching

What was typed is matched against each label, case-insensitively, and
ranked: a label that starts with it, then one with a word that starts
with it, then one that contains it anywhere, then an option with a
keyword that contains it. Within a rank the options keep their own
order. `filterCombobox(options, query)` is the same function, exported
for a caller that wants to show a count or test its own options.

A single combobox showing its own value's label lists everything, since
the label is what's chosen, not a search for it. Focusing the field
selects that label, so the first character typed starts a new search.

## Searching somewhere else

A list too long to hand the component, such as every issue in a
workspace held by a data worker, is searched where it lives. Pass
`onQueryChange` to hear the text as it's typed, send it to the search,
and pass what comes back as `options` with `filter={false}`, so the
combobox shows the results as they are rather than filtering them
again:

```tsx
<Combobox
  label="Parent issue"
  filter={false}
  options={found}
  onQueryChange={query => search.send.find(query)}
  onChange={key => search.send.setParent(key)}
/>
```

The label shown for a chosen value is looked up in the current
`options`, so a search that moves on can leave the field blank; a caller
that keeps a value shown keeps its option in the list.

## Keyboard

The field is one tab stop, and focus never leaves it: the list is
walked by a highlight, which the field names as its `activeDescendant`,
so a screen reader announces each option as the highlight reaches it.

| Key         | What it does                                                                |
| ----------- | --------------------------------------------------------------------------- |
| Typing      | Filters the list, opening it                                                |
| `Down`      | Opens the list, or moves to the next option that can be chosen              |
| `Up`        | Opens the list, or moves to the previous one                                |
| `Enter`     | Chooses the highlighted option. Single closes; `multiple` toggles and stays |
| `Escape`    | Closes the list. With it closed, puts back the chosen label                 |
| `Backspace` | In `multiple`, with the field empty, takes off the last value               |
| `Tab`       | Closes the list and moves on                                                |

The highlight stops at the ends rather than wrapping, and starts on the
chosen value when it's listed. Leaving the field closes the list and
puts back what's chosen, whatever was typed.

## Semantics

The field is a `combobox`, `expanded` or `collapsed` with the list, and
the list is a `listbox` of `option`s, each numbered with `posInSet` and
`setSize` and marked `selected` when chosen. In `multiple`, the chosen
values are a `list` above the field, each with a button named
`Remove <label>`.
