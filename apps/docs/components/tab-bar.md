---
description: 'TabBar: a strip of the things an application has open, which the person closes, reorders, renames and adds to, with its props, keys, drag between bars and semantics.'
---

# TabBar

A row of tabs for the things an application has open: an editor's
files, a workbook's sheets, a browser's pages. Where
[Tabs](/components/tabs) switches between a few fixed panels, this is a
strip the person adds to, closes, reorders and renames, and the panel
under it is yours.

Each of those abilities is there when its callback is. The bar reports
what the person did and the owner decides: nothing closes, moves or
changes its name until the application writes the change into `tabs`.

<LiveExample id="tabbar" height="200" />

<<< @/src/examples/TabBarExample.tsx#tab-bar

Press a tab, or focus the strip and use the arrows. Delete or the ×
closes one; `notes.md` is unsaved, so it shows a dot until the pointer
is on it. Drag a tab, or press Mod+Shift with an arrow, to move it.
Double-click a tab, or press F2, to rename it. The + opens a new file.
Open enough files and the strip scrolls, with a button at its end that
lists them all.

## Props

| Prop            | Type                                                     | Default     | What it does                                                                   |
| --------------- | -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| `tabs`          | `readonly TabBarTab[]`                                   | required    | The tabs, in order.                                                            |
| `value`         | `string`                                                 | none        | The selected tab, when the application owns it.                                |
| `defaultValue`  | `string`                                                 | none        | The tab to start on, when the bar owns the selection.                          |
| `onChange`      | `(value: string) => void`                                | none        | Called with the tab selected.                                                  |
| `onClose`       | `(value: string) => void`                                | none        | Draws close buttons, and closes on a middle press and on Delete.               |
| `onMove`        | `(value: string, index: number) => void`                 | none        | A tab moved to `index`, by a drag or by Mod+Shift and an arrow.                |
| `onRename`      | `(value: string, label: string) => void`                 | none        | Renames in place, on a double click or F2. Only a new, non-empty name is sent. |
| `onContextMenu` | `(value: string, at?: { x: number; y: number }) => void` | none        | A tab's menu: a right click with where it was, or the menu key or Shift+F10.   |
| `onAdd`         | `() => void`                                             | none        | Draws a button after the tabs that opens a new one.                            |
| `addLabel`      | `string`                                                 | `'New tab'` | The add button's name.                                                         |
| `dragType`      | `string`                                                 | own         | What a dragged tab is carried as. Bars that share one take each other's tabs.  |
| `onDrop`        | `(value: string, index: number) => void`                 | none        | A tab from another bar with the same `dragType`, dropped at `index`.           |
| `label`         | `string`                                                 | `'Tabs'`    | The strip's name, and what the list button and its search are called after.    |
| `ref`           | `UiNodeRef`                                              | none        | Receives the strip, to focus it or anchor a menu to it.                        |

A `TabBarTab` is a `value` and a `label`, plus:

- `icon`, a glyph before the label, in the form
  [NavigationRail](/components/navigation-rail) takes one.
- `detail`, said after the label and as the tab's description: a file's
  folder, so two `index.ts` tabs can be told apart.
- `dirty`, unsaved: a dot where the close button is, which turns into
  it under the pointer, and "unsaved" in the tab's description.
- `preview`, its label in italics, as an editor draws a tab the next
  file opened will replace.
- `closable`, false for a tab that can't be closed, such as a pinned one.
- `disabled`.

## Closing

With `onClose`, the selected tab and the one under the pointer show a
close button at their end. A press on it closes the tab without
selecting it first, a middle press anywhere on a tab closes it, and
Delete on the strip closes the selected one. Which tab is selected next
is the application's choice, since it is the one that removes the tab
from `tabs`; the example selects the neighbour, as an editor does.

## Moving, and moving between bars

With `onMove`, a tab can be dragged onto another, and it takes that
tab's place; dropped on the strip past the last tab, it goes to the
end. Mod+Shift with Left or Right moves the selected tab one place.

Every bar's tabs can be carried, whether or not the bar has `onMove`.
Two bars given the same `dragType` take each other's tabs: a tab
dropped on another bar is reported there, through that bar's `onDrop`,
with the index it was dropped at, and the application moves it from
one list to the other. That is an editor's split view: one `dragType`
for every editor group.

```tsx
<TabBar label="Left group" tabs={left} dragType="editor-tab" onDrop={(file, index) => groups.move(file, 'left', index)} />
<TabBar label="Right group" tabs={right} dragType="editor-tab" onDrop={(file, index) => groups.move(file, 'right', index)} />
```

## Renaming

With `onRename`, a double click on a tab or F2 on the strip draws the
tab as a field in its place, with its name selected, so typing replaces
it. Enter keeps the new name, Escape puts the old one back, and leaving
the field keeps what was typed. A name that is empty or unchanged is not
sent. Either way the keyboard goes back to the strip.

## More tabs than fit

The tabs stay on one line and scroll sideways, and the selected tab is
kept in view. Once they are wider than the strip, a button at its end
lists every tab in a [searchable menu](/components/menu#searching), the
selected one checked, so a tab far out of view is a few letters away.

## Keyboard

The strip is one tab stop. The close buttons are not stops: the
keyboard closes with Delete.

| Key                       | What it does                                              |
| ------------------------- | --------------------------------------------------------- |
| `Right`, `Left`           | Selects the next or previous tab, wrapping, past disabled |
| `Home`, `End`             | Selects the first or last tab                             |
| `Delete`                  | Closes the selected tab, with `onClose`                   |
| `Mod+Shift+Right`, `Left` | Moves the selected tab one place, with `onMove`           |
| `F2`                      | Renames the selected tab in place, with `onRename`        |
| Menu key, `Shift+F10`     | Asks for the selected tab's menu, with `onContextMenu`    |

Under `textDirection="rtl"` the next tab is to the left, so `Left` and
`Right` trade places.

## Semantics

The strip is a `tablist` named by `label`, and the selected tab is its
`activeDescendant`, so a screen reader reads each tab as the arrows
reach it. Each tab is a `tab`, `selected` when it is, with its detail
and "unsaved" as its description. A tab's children are presentational,
so its close button has no record of its own: the tab is what is heard,
and Delete is how the keyboard closes it. That is also why a rename
draws a field in the tab's place rather than inside it: the field is a
`textbox` named "Rename" and the tab's name. The list and add buttons
are `button`s.
