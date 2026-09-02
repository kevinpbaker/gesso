---
description: 'Tabs: a strip of tabs and the panel under it, with its props, the keys that move the selection, and what it announces.'
---

# Tabs

`Tabs` is a strip of tabs and the panel beneath it, for one region of a
screen that shows one of several views of the same thing. The strip is a
single tab stop and the arrows move the selection, which is the shape
[RadioGroup](/components/radio-group) has and for the same reason:
walking five tabs with Tab to reach the content behind them is worse
than walking them with the arrows.

What goes in the panel is yours. `Tabs` draws the strip, frames the
panel and names it after whichever tab is showing; it never decides
what the panel holds.

<LiveExample id="tabs" height="320" />

Views is controlled, and the application refuses `Billing`: click that
tab, or arrow onto it, and the selection stays where it was. `Audit` is
disabled, so the arrows step over it and a click on it does nothing.
Density is uncontrolled and runs on its own. Click either strip and try
Left, Right, Home and End.

<<< @/src/examples/TabsExample.tsx#tabs

## Props

| Prop           | Type                       | Default      | What it does                                                                                        |
| -------------- | -------------------------- | ------------ | --------------------------------------------------------------------------------------------------- |
| `tabs`         | `readonly TabDefinition[]` | required     | The tabs, in the order they are drawn. Declare the array once: a fresh one is a fresh set of tabs.  |
| `value`        | `string`                   | none         | The selected tab's value. Supplying it makes the strip controlled.                                  |
| `defaultValue` | `string`                   | none         | The value to start on, for a strip that owns its own. Supplying both throws, naming the component.  |
| `onChange`     | `(value: string) => void`  | none         | Called with the value the strip would take, on a click and on a bound key.                          |
| `label`        | `string`                   | `'Tabs'`     | The tab list's accessible name. It is not drawn, so give it the name of what the tabs are views of. |
| `children`     | `UiChild`                  | an empty row | What goes inside the panel.                                                                         |

A `TabDefinition` is three fields:

| Field      | Type      | Default  | What it does                                                                                                       |
| ---------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `value`    | `string`  | required | What `onChange` reports and `value` is compared against. Also the tab's key.                                       |
| `label`    | `string`  | required | Drawn on the tab, and the tab's accessible name.                                                                   |
| `disabled` | `boolean` | `false`  | Draws the label in the disabled foreground token, makes the tab inert to the pointer, and steps every key over it. |

Supplying neither `value` nor `defaultValue` leaves the strip with
nothing selected and the panel with an empty name. From there either
arrow lands on the first tab that can be chosen rather than stepping
from nowhere, and Home and End go where they always go. The selected tab
is filled with the `controlBackgroundHovered` token, so a theme moves it
without a colour prop here.

### The panel

The panel a strip shows is its child, written between the tags, and it
is a single child rather than a list.

It is also read once, when the component is built, because the component
body runs once. A panel that changes with the selection is therefore one
element with an Observable inside it rather than an Observable that
resolves to an element. The example's panel is a `box` whose children are
bound to the selected value, which is the pattern to copy.

### Layout and modifiers

The [shared layout props](/components/#layout-is-yours) land on the strip's outer column.
`rootModifiers` goes somewhere else: onto the tab list, beside the focus
ring, because that is the element that takes focus and carries the role.

## Controlled and uncontrolled

```tsx
// Controlled: the application owns the selection, and the strip shows it.
<Tabs tabs={VIEWS} value={view} onChange={next => (view.value = next)}>
  {panel}
</Tabs>;

// Uncontrolled: the strip owns the selection, and reports it if asked.
<Tabs tabs={VIEWS} defaultValue="summary">
  {panel}
</Tabs>;
```

Which form applies is decided once, when the component is built, from
whether `value` was supplied; supplying both throws.

A controlled strip draws the value it is handed, and `onChange` is a
request rather than a change. A controlled strip given no `onChange` at
all does not move until the application moves it, and the spec beside
the example proves exactly that: every arrow, every key and every click
leaves it where it was, and a write to the cell moves it with no gesture
behind it.

An uncontrolled strip keeps one cell of its own and still calls
`onChange`, so a selection you only want to observe needs no state at
the call site.

## Keyboard

The strip is one tab stop and the focus ring is drawn around the whole
strip. The tabs inside are not focusable; which one is chosen is said by
its own fill rather than by where the ring is.

| Key   | What it does                                         |
| ----- | ---------------------------------------------------- |
| Right | The next tab that can be chosen, wrapping at the end |
| Left  | The previous one, wrapping at the start              |
| Home  | The first tab that can be chosen                     |
| End   | The last tab that can be chosen                      |

Every one of them skips a tab marked `disabled`, and every one of them
is a request the application may decline. A key in the table is consumed;
anything else is left for whatever is listening above, which is what
lets a strip sit inside a dialog that closes on Escape. Up and Down are
not bound.

## Semantics

| What      | Value                                                                          |
| --------- | ------------------------------------------------------------------------------ |
| Tab list  | `tablist`, named by `label`, on the element that takes focus                   |
| Tab       | `tab`, named by the tab's `label`                                              |
| Tab state | `selected` on the chosen tab, and nothing on the others                        |
| Disabled  | `disabled` on the record of a tab marked so, and the subtree under it is inert |
| Panel     | `tabpanel`, named after the tab that is showing                                |

Which tab is chosen is said by a state, not by a number: there is no
`valueNow` on the strip. A tab's own text is claimed as the tab's name
rather than announced beside it, because ARIA calls the children of a
tab presentational and a reader that read both would hear it twice.

What is not emitted is worth knowing too. A tab carries no `posInSet`
and no `setSize`, so nothing announces "2 of 4"; the spec asserts both
absences, so they are documented rather than accidental. The panel is
tied to its tab by sharing its name and by nothing else: the semantics
record has no owns relationship to express.

## Next

[Accordion](/components/accordion) is the other way to show one section
at a time, and [the library overview](/components/) has the contract all
of this is an instance of.
