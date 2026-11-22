---
description: 'CommandPalette: every command an application has, found by typing, with fuzzy ranking, group headings, the shortcut registry listed as commands, and its props, keys and semantics.'
---

# CommandPalette

Every command there is, found by typing: the box Mod+K opens. A palette
is the list an application's menus, toolbars and keys add up to, made
searchable. Typing narrows it with a fuzzy match, so `tgtm` finds
"Toggle terminal"; the arrows walk what matches, Enter runs it and
Escape closes.

Reach for it when a person knows what they want to do and not where it
lives. To choose a value for a field, a [combobox](/components/combobox)
is the control; for a few commands beside the thing they act on, a
[menu](/components/menu).

<LiveExample id="commandpalette" height="420" />

<<< @/src/examples/CommandPaletteExample.tsx#command-palette

Press Mod+Shift+P, or the button, and type `zen`: Enter runs "Toggle zen mode".
Type `dark` and the colour theme is found by a keyword. Print is listed
but can't run now, so the arrows step over it. Save was never declared
as an item: it is a shortcut in the registry, so the palette lists it
under Shortcuts with its keys. The example opens on Mod+Shift+P rather
than Mod+K because this site's own search already answers to Mod+K, and
the page hears a key before the example does.

## Props

| Prop            | Type                            | Default             | What it does                                                                       |
| --------------- | ------------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `items`         | `readonly CommandPaletteItem[]` | required            | The commands, in the order they are listed before anything is typed.               |
| `open`          | `boolean`                       | none                | Whether it is open, when the application owns that.                                |
| `defaultOpen`   | `boolean`                       | none                | Whether it starts open, when the palette owns that.                                |
| `onOpenChange`  | `(open: boolean) => void`       | none                | Called when it asks to open or close: its shortcut, Escape, a press outside a row. |
| `onSelect`      | `(value: string) => void`       | none                | Called with the item chosen, after the palette has closed and the item has run.    |
| `onQueryChange` | `(query: string) => void`       | none                | Called with the text as it is typed, for a search held elsewhere.                  |
| `initialQuery`  | `string`                        | `''`                | What the field holds at each opening: `>` for commands, as an editor has it.       |
| `filter`        | `boolean`                       | `true`              | Ranks `items` by what is typed. `false` shows them as given.                       |
| `registry`      | `UiShortcutRegistry`            | none                | The application's shortcuts, whose live ones are listed after `items`.             |
| `shortcut`      | `string`                        | none                | The keys that open it, registered in `registry`: `'Mod+K'`. Read once.             |
| `label`         | `string`                        | `'Command palette'` | The palette's name, and the label of the shortcut that opens it.                   |
| `placeholder`   | `string`                        | `'Type a command…'` | Drawn in the empty field.                                                          |
| `emptyText`     | `string`                        | `'Nothing matches'` | Shown when nothing matches.                                                        |
| `limit`         | `number`                        | `100`               | The most rows it lists. Past that, typing is quicker than scrolling.               |
| `width`         | `number`                        | `560`               | Its width. A window narrower than that gets it as wide as fits.                    |
| `listHeight`    | `number`                        | `400`               | The list's tallest before it scrolls. The highlight is kept in view.               |

A `CommandPaletteItem` is a `value` and a `label`, plus:

- `run`, what choosing it does. It runs after the palette has closed and
  focus is back where it was, so a command that acts on the focused
  thing (delete the selected row) finds it.
- `group`, the heading it is listed under before anything is typed.
  Items next to each other with the same group are one group.
- `detail`, a quieter text after the label: a path, a description.
- `keywords`, other words it answers to.
- `shortcut`, the keys that do the same from anywhere, as `⌘S` or
  `Ctrl+Shift+P`, said at the row's end.
- `disabled`, listed but not runnable now. The arrows pass it by.

The palette opens near the top of the window, centred, over a dimmed
page, and holds the keyboard until it closes.

## Matching

Every word typed has to be found, in the label or, for less, in the
keywords, the detail or the group. A word is found as a run of
characters (best at the start of the label, then at the start of a word,
then anywhere) or else as a subsequence, `tgt` in "Toggle terminal",
which scores higher the more of it is contiguous and lands on word
starts. Case and accents don't count, and a shorter label wins a tie.
The characters of the label that matched are drawn strong.

Before anything is typed, the items are listed as given, under their
group headings: put what was used lately first. Once something is typed
the list is ranked as one, and each row's group is said at its end
instead. `commandPaletteMatch(item, query)` and
`filterCommands(items, query)` are the same ranking, exported for a
caller that ranks its own list.

## The shortcuts are commands

An application with a [shortcut registry](/interaction/shortcuts) has a
list of commands already. Given `registry`, the palette lists every
shortcut live where focus was when it opened, after `items`, each with
its keys and under its own group or Shortcuts. An item with the same
label as a shortcut stands for it, so the application's words and the
shortcut's keys are listed once. `shortcutCommands(registry, focused)`
returns the same items, for an application that merges them some other
way.

Given `shortcut` as well, the palette registers that key to open itself,
for as long as it is mounted, and leaves it out of its own list.

## Searching somewhere else

A list too long to hand the component, such as every file in a large
folder held by a worker, is searched where it lives. Pass
`onQueryChange` to hear the text, send it to the search, and pass what
comes back as `items` with `filter={false}`, so the palette shows the
results as they are:

```tsx
<CommandPalette
  label="Go to file"
  filter={false}
  items={found}
  open={quickOpen}
  onOpenChange={next => (quickOpen.value = next)}
  onQueryChange={query => files.send.find(query)}
  onSelect={path => editor.open(path)}
/>
```

## Keyboard

Focus stays in the field, which is the palette's one stop. The list is
walked by a highlight, which the field names as its `activeDescendant`,
so a screen reader reads each row as the highlight reaches it.

| Key                  | What it does                                           |
| -------------------- | ------------------------------------------------------ |
| Typing               | Ranks the list, the best match highlighted             |
| `Down`               | The next row that can run, wrapping to the first       |
| `Up`                 | The previous row that can run, wrapping to the last    |
| `PageDown`, `PageUp` | Eight rows down or up, stopping at the ends            |
| `Home`, `End`        | The first or last row, while the field is empty        |
| `Enter`              | Closes the palette, then runs the highlighted row      |
| `Escape`             | Closes the palette and gives focus back to what had it |
| `Tab`                | Nothing: the field is the palette's only stop          |

A press outside the palette closes it too.

## Semantics

The palette is a modal `dialog` named by `label`. Its field is a
`combobox`, `expanded`, whose `autocomplete` is `list` and which
`controls` the `listbox` under it. Each row is an `option` numbered with
`posInSet` and `setSize` across the whole list; its description is its
detail, its group once the list is ranked, and its shortcut in words
(`Command Shift P` rather than `⇧⌘P`, which a screen reader reads out
inconsistently). Before anything is typed each group is a `group` named
by its heading, which is not an option.
