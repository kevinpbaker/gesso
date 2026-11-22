---
description: 'PanelGroup: any number of resizable panels with pixel sizes and one that fills, collapsing to the edge, sizes kept by key, with its props, keys and semantics.'
---

# PanelGroup

Panels side by side, or one above another, with a divider between each
two that the person moves: an editor's sidebar, text and second sidebar,
or its text above its terminal.

[SplitPane](/components/split-pane) is two panes and a fraction. This is
any number of them, sized the way an application's are: every panel but
one has a size in pixels, which a window made wider or narrower leaves
alone, and the one that fills takes the rest. Groups nest, so the text
and the terminal under it are a second group inside the first.

<LiveExample id="panelgroup" height="420" />

<<< @/src/examples/PanelGroupExample.tsx#panel-group

Drag a divider, or focus it and use the arrows. Drag the explorer's
divider most of the way left and it folds away; Enter on its divider, or
the button, brings it back. A double click on a divider puts its panel
back to where it started. Widen the window and only the text grows.

## Props

| Prop                | Type                                                | Default  | What it does                                                                |
| ------------------- | --------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `panels`            | `readonly PanelGroupPanel[]`                        | required | The panels, in order. Read once, when the group mounts.                     |
| `direction`         | `'row' \| 'column'`                                 | `'row'`  | Side by side, or one above another. Read once.                              |
| `sizes`             | `Readonly<Record<string, number>>`                  | none     | Each sized panel's size in pixels, by key, when the application owns them.  |
| `defaultSizes`      | `Readonly<Record<string, number>>`                  | none     | The sizes to start at, when the group owns them.                            |
| `onSizesChange`     | `(sizes: Readonly<Record<string, number>>) => void` | none     | Called with every size, by key, as a divider moves.                         |
| `collapsed`         | `readonly string[]`                                 | none     | The collapsed panels, by key, when the application owns them.               |
| `defaultCollapsed`  | `readonly string[]`                                 | none     | The panels to start collapsed, when the group owns them.                    |
| `onCollapsedChange` | `(collapsed: readonly string[]) => void`            | none     | Called when a panel collapses or comes back.                                |
| `divider`           | `'line' \| 'bar'`                                   | `'line'` | A one-pixel rule in a grab area, or `SplitPane`'s framed handle. Read once. |

A `PanelGroupPanel` is a `key` and its `content`, plus:

- `label`, its name, which names its divider: "Resize Explorer".
- `defaultSize`, its size in pixels before anyone moves it, and what a
  double click on its divider puts back. Default 240.
- `minSize` and `maxSize`, in pixels. The least defaults to 80; on the
  panel that fills it is the least that panel is given.
- `collapsible`, whether it can fold away to nothing.
- `fill`, the panel that takes what the others leave. One panel fills:
  the first marked so, else the first without a `defaultSize`, else the
  last.

## Which panel a divider moves

A divider resizes the panel beside it that has a size, and the panel
that fills gives or takes the difference. Between two panels that both
have sizes, it trades one for the other, and the panel that fills is
left alone. A panel is never made smaller than its least or larger than
its most, and the panel that fills is never squeezed below its least: a
sidebar dragged toward it stops there.

When the window is too small for every panel's size, the sized panels
shrink too, down to their least, and grow back when there is room.

## Collapsing

A `collapsible` panel dragged past half its least size folds away to
nothing, and dragged back out returns. Enter on its divider folds it and
brings it back, and Home folds it. An arrow toward the panel that fills
opens it at its least size.

A collapsed panel keeps its content mounted, hidden, and keeps its size,
so it comes back as it was. Its divider stays, so it can be dragged or
pressed back open. For a command such as "Toggle sidebar", own
`collapsed` and write the key in and out of it, as the example's button
does.

## Keeping the sizes

`sizes` and `collapsed` are keyed by panel rather than ordered, so an
application that saves them gets them back however its panels have
changed since: a panel added in a later version takes its
`defaultSize`, and the saved size of one taken out is ignored.

```tsx
const sizes = persisted<Record<string, number>>(new IndexedDbStorage(), 'layout.sizes', { initial: {} });
const collapsed = persisted<readonly string[]>(new IndexedDbStorage(), 'layout.collapsed', { initial: [] });

<PanelGroup
  panels={panels}
  sizes={sizes.value}
  onSizesChange={next => sizes.set(next)}
  collapsed={collapsed.value}
  onCollapsedChange={next => collapsed.set(next)}
/>;
```

## Keyboard

Each divider is a tab stop.

| Key                | What it does                                                  |
| ------------------ | ------------------------------------------------------------- |
| Arrows             | Moves the divider ten pixels along the group                  |
| `Shift` and arrows | Fifty pixels                                                  |
| `Home`             | Its panel to its least size, or folded away when it collapses |
| `End`              | Its panel to its most, or to all the room there is            |
| `Enter`            | Folds its panel away, or brings it back, when it collapses    |

## Semantics

Each divider is a `separator` named "Resize" and its panel's label. Its
value is that panel's size in pixels, from its least (0 for one that
collapses) to its most when it has one, and a collapsible panel's
divider is `expanded` or `collapsed`. The panels themselves add nothing:
what is in them says what it is.
