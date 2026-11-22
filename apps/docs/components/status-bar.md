---
description: 'StatusBar: the line along the bottom of an application, with items at its start and end, buttons, live text, a zoom control, its props, keys and semantics.'
---

# StatusBar

The line along the bottom of an application: where the caret is, what
is running, what the selection adds up to, and the zoom. Every editor,
spreadsheet and design tool has one, and until now every application
built on Gesso drew its own.

Items sit at the start or the end of the bar. Each is a piece of text
with an optional icon, spinner, tone and tooltip, and one with `onClick`
is a button: the encoding that opens a picker, the error count that
shows the problems.

<LiveExample id="statusbar" height="320" />

<<< @/src/examples/StatusBarExample.tsx#status-bar

Type in the note: the caret's line and column follow it, and "Saving…"
spins until a moment after you stop. Press the error count or the
encoding to see a press reported. The bar is one tab stop: Tab to it and
walk its buttons with the arrows. −, the percentage and + zoom the note;
the percentage puts it back to 100%.

## Props

| Prop           | Type                       | Default        | What it does                                                                |
| -------------- | -------------------------- | -------------- | --------------------------------------------------------------------------- |
| `items`        | `readonly StatusBarItem[]` | required       | What the bar says, in order at each end.                                    |
| `zoom`         | `number`                   | none           | The zoom, 1 for 100%, when the application owns it. Draws the zoom control. |
| `defaultZoom`  | `number`                   | none           | The zoom to start at, when the bar owns it. Draws the zoom control.         |
| `onZoomChange` | `(zoom: number) => void`   | none           | Called with the zoom − , + or the percentage asked for.                     |
| `zoomSteps`    | `readonly number[]`        | 25% to 500%    | The zooms − and + step through, in order.                                   |
| `label`        | `string`                   | `'Status bar'` | The bar's name.                                                             |

A `StatusBarItem` is a `key` and its `text`, plus:

- `side`, `'start'` (the default) or `'end'`.
- `label`, its name to a screen reader where the text is terse:
  "Encoding, UTF-8" for `UTF-8`.
- `icon`, in the form [NavigationRail](/components/navigation-rail)
  takes one.
- `tone`: `'muted'` (the default), `'default'`, `'primary'` or
  `'danger'`.
- `tooltip`, said when the pointer rests on it.
- `busy`, a spinner before the text while something is going on.
- `live`, its changes announced, politely: "Saving…", "Saved".
- `onClick`, which makes it a button.

## Text that changes

`text`, `label`, `tone` and `busy` each take a cell as well as a value.
A caret position changes on every key, and passed as a cell it is drawn
without the bar being rebuilt, so the items can be declared once, as the
example's are:

```tsx
const items = [{ key: 'caret', text: caret.pipe(map(at => `Ln ${at.line}, Col ${at.column}`)), side: 'end' }];
```

## Zoom

Given `zoom` or `defaultZoom`, the bar ends with a zoom control: −, the
zoom as a percentage, and +. − and + step to the next zoom in
`zoomSteps` (25%, 33%, 50% and so on to 500%, as a browser has them),
stopping at the ends, and the percentage puts the zoom back to 100%.
`zoomStep(zoom, 1)` and `zoomStep(zoom, -1)` are the same steps, for a
keyboard shortcut that zooms the same way.

## Keyboard

A status bar is the last thing on a screen and the least often wanted,
so its buttons are one tab stop between them, as a
[toolbar](/components/toolbar)'s are. Text that only says something is
not a stop at all.

| Key              | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `Right`, `Left`  | The next or previous button, the zoom's included |
| `Home`, `End`    | The first or last button                         |
| `Enter`, `Space` | Presses the button                               |

The button last focused keeps the stop, so Tab comes back to it. Under
`textDirection="rtl"`, `Left` and `Right` trade places.

## Semantics

The bar is a `toolbar` named by `label`. An item with `onClick` is a
`button` named by its label or its text. An item with an icon or a
spinner is a `group` named the same way, `busy` while it is, and plain
text is read as it is. A `live` item is a polite live region, so a
screen reader says "Saved" when it changes without moving anywhere.
The zoom control is a `group` named "Zoom", and its percentage is a
button named for the zoom and what it does: "Zoom 125%, reset to 100%".
