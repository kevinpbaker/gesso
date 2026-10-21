---
description: "An application's destinations down its side: the active one marked current, filled or outline icons, badges, groups that open, close and disable, an icons-only form, Cmd-click to open a destination somewhere new, operated from the keyboard as one tab stop."
---

# NavigationRail

`NavigationRail` is the column of destinations an application keeps down
its side: a mail client's mailboxes, a settings screen's sections, a
workbench's list of pages. One destination is active, the page the
reader is on. Rows can carry an icon, filled or drawn as lines, and a
badge; groups of rows open and close, and can be disabled whole; a
destination can be opened somewhere new with a Cmd-click; and the whole
rail can collapse to a narrow column of icons whose labels appear as
tooltips.

It replaces the column of buttons such screens usually grow by hand,
which Tab walks one row at a time and which tells a screen reader
nothing about which row is the current page.
[Breadcrumb](/components/breadcrumb) says where the reader is in a
hierarchy; this is where they can go.

<LiveExample id="navigationrail" height="340" />

<<< @/src/examples/NavigationRailExample.tsx#rail

Click a destination and the url changes, then the rail follows it. Sent
is disabled. Tab into the rail and use the arrows: focus moves from row
to row and nothing navigates until Enter or Space. Left on a label goes
back to Labels, Left again closes the group, and Right opens it. The «
button above collapses the rail to icons; hover one, or arrow onto it,
to see its label. Settings has an outline icon, two paths drawn as
lines. Cmd-click (Ctrl-click off a Mac) or middle-click a destination,
or press Cmd-Enter on one, and the shell is asked to open that page
somewhere new while this one stays where it is.

## Driving it from the router

The router owns where the application is, so the rail is almost always
controlled: its `value` is computed from the router, and a press asks
the router to go somewhere. The rail does not move on a press; it moves
when the url does, which is also what makes Back and Forward, a link
elsewhere on the screen and a typed address move it with no code of
their own.

<<< @/src/examples/NavigationRailExample.tsx#routes

Give each destination a `to`, as [Link](/components/link) takes one: a
url of the router's, or `to(route, params)`, which is typed from the
route, so a destination whose path takes params cannot be named
without them. A plain press reports the key through `onChange` and then
the router navigates there; a Cmd-click opens it somewhere new (see
below).

`router.isActive(route)` is a cell that is true while a route is in the
current chain, a layout included while any of its children shows. The
example combines one per destination and takes the first that is true:

```tsx
const active = combineLatest(PAGES.map(page => router.isActive(page.route))).pipe(
  map(flags => PAGES.find((_, at) => flags[at])?.key ?? null)
);

<NavigationRail items={ITEMS} value={active} />;
```

With layouts in the chain, list the leaves before their layouts, or
order the check so the deepest match wins: `isActive` is true for every
route in the chain.

Without `to`, route from `onChange` instead:
`onChange={key => PAGES.find(page => page.key === key)?.go(router)}`. A
key can be anything unique, and using the url itself as the key is the
shortest version, `value={router.url}` and `onChange={url =>
router.navigate(url)}`, when every destination is one fixed address.
Do not give both `to` and an `onChange` that routes, or a press
navigates twice.

## Opening a destination somewhere new

A Cmd-click (Ctrl-click off a Mac, and either key on every platform, as
[Link](/components/link#opening-a-destination-somewhere-new) explains),
a middle click, or Cmd-Enter or Ctrl-Enter on a focused row asks for the
destination somewhere new: another tab, another window. The page the
reader is on stays, so the rail's value does not move and `onChange` is
not called.

| How it is activated                                     | A destination with `to`                                           | Without `to`                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| Click, Enter or Space                                   | `onChange`, then the router navigates in place                    | `onChange`                                                        |
| Cmd-click, Ctrl-click, middle click, Cmd- or Ctrl-Enter | `onOpenElsewhere`, then `ShellService.openRoute`; the value stays | `onOpenElsewhere` when given; otherwise the same as a plain press |

It is opt-in. A rail with no `to` and no `onOpenElsewhere` answers a
modified press exactly as a plain one, which is what it always did. A
group answers every press by opening or closing, because it has nowhere
to open.

`onOpenElsewhere` is its own callback rather than a second argument to
`onChange`, because a handler written for `onChange` that never looked
at the second argument would navigate in place on a Cmd-click, which is
the one thing a Cmd-click must not do. It is called before the shell is
asked, so it can record the request either way.

With keys and no `to`, wire it through the shell yourself: `openRoute`
for a page of this application, `openUrl` for somewhere outside it.
What either opens is the shell's to decide, a new browser tab or a new
desktop window; the table on
[Link](/components/link#opening-a-destination-somewhere-new) has each
shell's answer.

```tsx
const shell = ctx.inject(ShellService);

<NavigationRail
  items={ITEMS}
  value={active}
  onChange={key => router.navigate(URLS[key])}
  onOpenElsewhere={key => shell.openRoute(URLS[key])}
/>;
```

## Props

| Prop               | Type                                    | Default  | What it does                                                                                                                               |
| ------------------ | --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `items`            | `readonly NavigationItem[]`             | required | The destinations and groups, in the order they are drawn. Declare the array once: a new array builds new rows.                             |
| `value`            | `string \| null`                        | none     | The active destination's key, `null` for none. Supplying it makes the rail controlled.                                                     |
| `defaultValue`     | `string \| null`                        | none     | The destination to start on, for a rail that owns its value. Supplying both throws, naming the component.                                  |
| `onChange`         | `(key: string) => void`                 | none     | Called with the key a click, Enter or Space asked for, the active one included, so a second press can mean "back to the top of this page". |
| `onOpenElsewhere`  | `(key: string) => void`                 | none     | Called with the key a Cmd-click, Ctrl-click, middle click or Cmd-Enter asked to open somewhere new. The value does not move.               |
| `expanded`         | `readonly string[]`                     | none     | The open groups, by key. Supplying it makes the open set controlled.                                                                       |
| `defaultExpanded`  | `readonly string[]`                     | none     | The groups to start open. Without it, the groups marked `defaultExpanded` start open.                                                      |
| `onExpandedChange` | `(expanded: readonly string[]) => void` | none     | Called with the whole new open set whenever a group opens or closes.                                                                       |
| `collapsed`        | `boolean`                               | `false`  | Icons only, 56 wide. Each label is shown as a tooltip and is still the row's accessible name. Bound, so a toggle narrows it in place.      |
| `width`            | `UiLength`                              | `240`    | The width while expanded.                                                                                                                  |
| `label`            | `string`                                | `'Main'` | The landmark's accessible name, and the tree's inside it. Name it for what it navigates: `Mail`, `Settings`.                               |

### `NavigationItem`

An item is a destination, or a group: anything with `items` is a group.

| Field             | On          | Type                        | What it does                                                                                                                                          |
| ----------------- | ----------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`             | both        | `string`                    | The identity: what `value` and the open set hold. Unique across the whole rail, groups included.                                                      |
| `label`           | both        | `string`                    | The row's text and its accessible name, also when collapsed.                                                                                          |
| `icon`            | both        | `NavigationIcon`            | SVG path data on a 24 grid, filled in the row's text colour, or an outline icon (below). Collapsed, a row without one shows its label's first letter. |
| `badge`           | destination | `number \| string`          | Drawn at the row's end through [Badge](/components/badge), so 120 is `99+`. Collapsed, it is a dot on the icon.                                       |
| `badgeLabel`      | destination | `string`                    | What the badge means, said after the label: `12 unread`. Without it, the badge's own text.                                                            |
| `to`              | destination | `string \| RouteTarget`     | Where it is in this application. A press navigates there after `onChange`; a Cmd-click opens it somewhere new. See above.                             |
| `disabled`        | both        | `boolean`                   | Greyed, inert to the pointer, skipped by every key, and announced as unavailable. On a group, its heading and every row under it, at any depth.       |
| `items`           | group       | `readonly NavigationItem[]` | What the group holds, groups included.                                                                                                                |
| `defaultExpanded` | group       | `boolean`                   | Open when the rail is built, for a rail that owns its open set. Read once, from the first `items`.                                                    |

A group is not a destination. Activating one opens or closes it, and it
is never the `value`.

A disabled group neither opens nor closes from the rail. Its open state
is still announced, and if the open set holds it, from
`defaultExpanded` or a controlled `expanded`, its rows are shown,
disabled, so a section the reader cannot use yet is still one they can
see the contents of.

### Icons

`icon` is a `NavigationIcon`: a string, or an object for an icon drawn
as lines. Each path is drawn as [Icon](/components/icon) draws
one, in the row's text colour, on a 24 grid.

```ts
// Filled, as before: one path.
{ key: 'inbox', label: 'Inbox', icon: 'M4 4h16v16H4z' }

// An outline icon: drawn as a line 1.5 grid units wide.
{ key: 'menu', label: 'Menu', icon: { path: 'M4 6h16M4 12h16M4 18h16', style: 'stroke', strokeWidth: 1.5 } }

// Several paths, laid over each other, as an SVG's <path> elements are.
{ key: 'settings', label: 'Settings', icon: { path: [GEAR_OUTER, GEAR_HOLE], style: 'stroke', strokeWidth: 1.5 } }
```

| Field         | Type                     | Default     | What it does                                                                                     |
| ------------- | ------------------------ | ----------- | ------------------------------------------------------------------------------------------------ |
| `path`        | `string \| string[]`     | required    | SVG path data. Several are each drawn as their own `Icon`, in the same square.                   |
| `style`       | `'fill' \| 'stroke'`     | `'fill'`    | Filled, or drawn as a line, which is what an outline set such as Heroicons' outline icons wants. |
| `strokeWidth` | `number`                 | `2`         | The line's width, in grid units, when stroked.                                                   |
| `fillRule`    | `'nonzero' \| 'evenodd'` | `'nonzero'` | How a filled path decides what is inside it. Heroicons' solid set wants `'evenodd'`.             |

The [shared layout props](/components/#layout-is-yours) land on the
landmark, the rail's outer column, except `width`, which is read as the
expanded width above. Give the rail a height, with `flexGrow` in a
column or `y="stretch"` in a row, and it scrolls when its rows are
taller than that.

## Controlled and uncontrolled

```tsx
// Controlled: the router, or anything else, owns the active key.
<NavigationRail items={ITEMS} value={active} onChange={key => go(key)} />

// Uncontrolled: the rail keeps it, and reports each change.
<NavigationRail items={ITEMS} defaultValue="inbox" onChange={key => log(key)} />
```

Which form applies is decided once, when the rail is built. A
controlled rail given no `onChange` never moves on a press, which is how
a destination is refused. The open set has the same two forms through
`expanded` and `defaultExpanded`, owned separately from the value.

The rail never opens a group on its own. If the active destination is
inside a shut group, the group's label is drawn heavier so the reader
can see where they are, and opening it is the application's call: a
change the rail made would reach `onExpandedChange` as if the reader
had made it.

## Keeping the active row in view

When the value changes, and when the rail is given a new size, the
active row is scrolled into view, so a rail of sixty pages opens with
the current one showing. Turning the wheel is not undone. Keyboard focus
is kept in view by the runtime, as it is everywhere, so walking past
the bottom of a tall rail scrolls it.

## Keyboard

The rail is one tab stop. Unlike [Tree](/components/tree) and
[Tabs](/components/tabs), whose focus stays on the container, the
arrows here move focus itself from row to row, and the row holding the
tab stop is the one focus was last on, else the active destination,
else the first row that can take focus. The arrows never navigate:
walking past six rows must not load six screens. Enter and Space do.

| Key          | What it does                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Down, Up     | The next or previous row, stepping over disabled ones. Clamped at the ends, never wrapped.       |
| Home, End    | The first or last row that can take focus                                                        |
| Right        | On a shut group, opens it; on an open one, moves into it. Left instead, reading right to left.   |
| Left         | On an open group, closes it; on anything else, moves to its group. Right instead, right to left. |
| Enter, Space | On a destination, `onChange` with its key; on a group, opens or closes it                        |
| Cmd-Enter    | On a destination, opens it somewhere new (also Ctrl-Enter); the value stays. See above.          |
| A letter     | The next row whose label starts with it, wrapping                                                |

Right and Left are ARIA's tree keys, and they follow the reading
direction: under `textDirection: 'rtl'` Left opens a group and Right
closes it, as the layout mirrors with the text. A letter no row starts
with is not consumed, so an application's single-key shortcuts still
reach it; a key the table does not list is left alone too.

## Semantics

| What        | Value                                                                                   |
| ----------- | --------------------------------------------------------------------------------------- |
| Landmark    | `navigation`, named by `label`                                                          |
| List        | `tree`, named by `label`, inside the landmark                                           |
| Row         | `treeitem`, named by the item's `label`, also when collapsed and the label is not drawn |
| Depth       | `level`, from 1, with `posInSet` and `setSize` among its siblings                       |
| Active      | the `current` state on the active destination                                           |
| Group       | `expanded` while open, `collapsed` while shut                                           |
| Badge       | the row's `description`: `badgeLabel`, or the badge's own text                          |
| Unavailable | `disabled` on a row marked so, and on every row inside a disabled group                 |

The rows are a `tree` rather than a `list` of links. A list of links
cannot say a group is open, and a screen reader keeps the arrow keys
for its own reading cursor in a list; a tree is a composite widget,
which tells it to hand them over. This is ARIA's navigation treeview
pattern. The active row carries `current`, which is "the page this
leads to is the one open", rather than `selected`, which belongs to a
choice in a listbox and is not what a reader expects of navigation.

## What this page has checked

`NavigationRail.spec.ts` mounts the rail with `gesso-testing` and
asserts the landmark and the tree with their names; which rows exist as
groups open and close, with their level, position and set size; the
`current`, `expanded` and `collapsed` states; the badge's description;
the disabled row announced, inert to a click and skipped by every key;
both forms of the value and of the open set, and the error when both
are given; a group press that opens it without becoming the value; the
single tab stop, where Tab lands and that it survives the row it was on
being closed away; every key in the table, the clamping at the ends,
and type-ahead leaving an unmatched letter for the application; a
Cmd-click, a Ctrl-click, a middle click and Cmd-Enter or Ctrl-Enter
reported to `onOpenElsewhere` with the value left alone, the middle
press forgotten by the next click, a modified press treated as plain
when nothing asked for it, a `to` followed in place on a plain press
and sent to the shell's `openRoute` on a modified one; a disabled group
announced, drawn in the disabled ink and inert with every row under it,
and skipped by the arrows and type-ahead; a string icon filled exactly
as before, and an outline icon stroked at its width, several paths each
drawn, and a fill rule passed through, in both widths; Left
and Right swapped and the indent and badge mirrored under right to
left; the collapsed width, the labels kept as names with none drawn,
the first letter for a row with no icon, and the tooltip opening on
keyboard focus and only while collapsed; the active row scrolled into
view on a change and on the first frame, and focus followed down a
long list; and a long label cut short of the rail's edge and of its
badge. `NavigationRailExample.spec.ts` drives the example above
through the router: the url a press goes to, the rail following a
navigation it did not make, Enter navigating where the arrows do not,
a Cmd-click and Ctrl-Enter asking the shell for the page with the url
and the rail left where they were, and collapsing.

What has not been checked: none of this has been opened in a browser.
Every assertion runs against the testing runtime's fake canvas, so the
look of the rail, the colours of the active row in both themes, the
icons' shapes, an outline icon's line weight beside a filled one, a
disabled group's ink, where a tooltip lands beside a collapsed rail in
a real window, what a real browser or desktop shell opens for a
Cmd-click, a real mouse's middle button, and how it reads in a real
screen reader are untested. The
tooltip is placed to the right and relies on the overlay flipping at
the window's edge for a right-to-left rail on the right, which is the
overlay's documented behaviour and not something this page has seen.

Limits worth knowing: an outline icon with several paths costs one
raster per path, where a filled string costs one. Shift-click and
Alt-click mean nothing here, as they mean nothing on a `Link`, and a
group cannot be opened somewhere new.

## Next

[Breadcrumb](/components/breadcrumb) shows where the reader is in a
hierarchy, and [Tree](/components/tree) is the same keyboard over data
rather than over destinations.
