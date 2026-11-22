---
description: 'ShortcutSheet and KeyCap: every live keyboard shortcut, listed on ? from the shortcut registry with a filter, and a shortcut drawn as key caps.'
---

# ShortcutSheet and KeyCap

`ShortcutSheet` is the sheet `?` opens: every keyboard shortcut that
works here, grouped, with a filter at the top. `KeyCap` draws one
shortcut as the keys to press, for the sheet's rows and for a hint
anywhere else.

Both take a shortcut as the [shortcut registry](/interaction/shortcuts)
writes it (`'Mod+Shift+P'`, `'?'`, `'g d'`), so a hint, the sheet and the
shortcut that runs are one string, and print it the way the platform
writes its own: `⇧⌘P` on a Mac, `Ctrl` `Shift` `P` elsewhere.

<LiveExample id="shortcutsheet" height="560" />

<<< @/src/examples/ShortcutSheetExample.tsx#shortcut-sheet

Click the board and press `?`, or press the button. The sheet lists what
the registry says is live, grouped, with the editor's keys that the
registry doesn't hold added from `entries`. Type in the filter to narrow
it; `?` again or Escape closes it.

## ShortcutSheet props

| Prop           | Type                            | Default                | What it does                                                       |
| -------------- | ------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| `open`         | `boolean`                       | none                   | Whether it is open, when the application owns that.                |
| `defaultOpen`  | `boolean`                       | none                   | Whether it starts open, when the sheet owns that.                  |
| `onOpenChange` | `(open: boolean) => void`       | none                   | Called when it asks to open or close.                              |
| `registry`     | `UiShortcutRegistry`            | none                   | The application's shortcuts, whose live ones are listed.           |
| `entries`      | `readonly ShortcutSheetEntry[]` | none                   | Shortcuts the registry doesn't hold, listed after it.              |
| `shortcut`     | `string`                        | none                   | The keys that open it, registered in `registry`: `'?'`. Read once. |
| `title`        | `string`                        | `'Keyboard shortcuts'` | The dialog's title, and the label of the shortcut that opens it.   |
| `generalLabel` | `string`                        | `'General'`            | The heading for shortcuts that name no group.                      |
| `width`        | `number`                        | `520`                  | Its width. A window narrower than that gets it as wide as fits.    |

A `ShortcutSheetEntry` is a `label`, its `keys` (one string, or several
that do the same) and an optional `group`: an editor's Bold, which the
editor handles itself and so never registers.

## What the sheet lists

Given `registry`, the sheet reads what is live where focus was when it
opened, which is the same list the
[command palette](/components/command-palette) offers, worked out the
same way. It cannot show a key that would not run where the person was,
or miss one that would. The `entries` come after.

Rows are grouped by their shortcut's `group`, the general group first
and the others as they first appear. Keys that share a label share a
row, "j or Down arrow", and a key two shortcuts want is listed for the
one that would run. The sheet's own key is left out: it is the one key
somebody looking at the sheet already knows.

`shortcutSections(bindings, entries)` and
`filterShortcutSections(sections, query)` are the same grouping and
filter, exported for an application that draws the list some other way,
such as on a help page.

## The filter

The filter takes focus as the sheet opens. Every word typed has to start
a word of what a row does, its group, its keys in words or its caps, so
"down" finds "Down arrow" and not "markdown", and "editor b" finds Bold.

Given `shortcut`, the same key closes the sheet again, typed in the
filter included: a `?` in the filter is not a search, since no row's
name holds one. Escape closes it as it closes any dialog, and focus goes
back to where it was.

## KeyCap

| Prop      | Type      | Default  | What it does                                                       |
| --------- | --------- | -------- | ------------------------------------------------------------------ |
| `keys`    | `string`  | required | The shortcut, as the registry writes it: `'Mod+K'`, `'g d'`.       |
| `compact` | `boolean` | `false`  | Smaller caps, for a hint in a menu row or a status bar. Read once. |

```tsx
<KeyCap keys="Mod+Shift+P" />
```

Each key of a press is a cap of its own, and a chord's presses have
"then" between them. It takes the shared layout props, so it can be
placed like any other control.

## Semantics

The sheet is a modal `dialog` named by `title`. Its filter is a
`searchbox`. Each group is a `heading` over a `list` named by the group,
and each row a `listitem` named by what it does and its keys in words,
"Next card, j or Down arrow", numbered with `posInSet` and `setSize`.

A `KeyCap` is a `group` named by its shortcut in words: "Command Shift
P" on a Mac, "Control Shift P" elsewhere, and "g then d" for a chord. A
key cap's `⌘` or `↓` is read out inconsistently or not at all, so the
words are what is heard.
