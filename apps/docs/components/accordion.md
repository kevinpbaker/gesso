---
description: 'Accordion: sections that open and close, with its props, its two keys, and what an open section announces.'
---

# Accordion

`Accordion` is a stack of labelled sections that open and close, for
content that is worth having on the page but not worth showing all at
once: a settings screen, a list of questions and answers, a long form
broken into steps. Each section carries its own content, so a section is
one value rather than a header and a body the caller has to keep in
step.

A closed section is not in the tree at all. It costs no layout, and it
says nothing to a screen reader. Reach for [Tabs](/components/tabs)
instead when exactly one of the views should be showing and the choice
is a navigation rather than a disclosure.

<LiveExample id="accordion" height="460" />

Settings is controlled, and the application pins `Basics` open: click
its header and it stays open, because a controlled accordion shows only
what is written back. Expand all opens two sections with no gesture at
all. `Retention` is disabled. Shipping is uncontrolled and `exclusive`,
so opening one of its sections closes the other.

<<< @/src/examples/AccordionExample.tsx#accordion

## Props

| Prop           | Type                                | Default  | What it does                                                                                                 |
| -------------- | ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `sections`     | `readonly AccordionSection[]`       | required | The sections, in the order they are drawn. Declare the array once: a fresh one is a fresh set.               |
| `open`         | `readonly string[]`                 | none     | The values of the open sections. Supplying it makes the accordion controlled.                                |
| `defaultOpen`  | `readonly string[]`                 | none     | What is open to begin with, for an accordion that owns its own. Supplying both throws, naming the component. |
| `onOpenChange` | `(open: readonly string[]) => void` | none     | Called with the whole set the accordion would take, not with the one section that moved.                     |
| `exclusive`    | `boolean`                           | `false`  | Opening a section closes the rest.                                                                           |

An `AccordionSection` is four fields:

| Field      | Type      | Default  | What it does                                                             |
| ---------- | --------- | -------- | ------------------------------------------------------------------------ |
| `value`    | `string`  | required | What appears in the open set, and the section's key.                     |
| `label`    | `string`  | required | Drawn on the header, and the header's accessible name.                   |
| `content`  | `UiChild` | required | What the section shows while it is open.                                 |
| `disabled` | `boolean` | `false`  | The header refuses a click, cannot be focused, and so cannot be toggled. |

Supplying neither `open` nor `defaultOpen` starts with everything
closed. `exclusive` applies as a section is toggled and not as the
accordion is built, so a `defaultOpen` naming three sections opens three
of them; the next toggle is what reduces it to one.

There is no `label` prop and no role on the accordion itself: it is a
column of sections, and each section names itself. Give it a heading of
your own where a group needs a name, the way the example does.

### Layout and modifiers

The accordion takes the layout props every control in the library takes,
and spreads them onto its own column: `width`, `height`, `minWidth`,
`minHeight`, `maxWidth`, `maxHeight`, `margin` and its four sides,
`flex`, `flexGrow`, `flexShrink`, `flexBasis`, `selfX` and `selfY`.

`rootModifiers` is declared on the shared props type but is not attached
by this component, so a modifier passed there does nothing. Put it on a
box around the accordion until that changes.

## Controlled and uncontrolled

```tsx
// Controlled: the application owns the open set, and the accordion shows it.
<Accordion sections={SETTINGS} open={open} onOpenChange={next => (open.value = next)} />

// Uncontrolled: the accordion owns the open set, and reports it if asked.
<Accordion sections={SETTINGS} defaultOpen={['basics']} />
```

Which of the two applies is decided once, when the component is built,
from whether `open` was supplied; passing both throws an error naming
the component rather than choosing quietly.

`onOpenChange` is handed the whole set the accordion would take, which
is what makes a policy easy to write: the example filters the pinned
section back in, and a handler that wanted at most two open would slice
the array. What the application writes back is what is drawn, and a
controlled accordion given no `onOpenChange` does not move at all. The
spec proves both directions: a click that the handler declines leaves
the section open, and a write from a button somewhere else opens two
sections that nobody clicked.

An uncontrolled accordion keeps one cell of its own and still calls
`onOpenChange`, so an open set you only want to observe needs no state
at the call site.

`Accordion` takes no child: its content arrives inside `sections`,
unlike [Card](/components/card), [Toolbar](/components/toolbar) and
[Tabs](/components/tabs), which each hold one child written between
their tags.

## Keyboard

Every header is its own tab stop, so Tab and Shift+Tab walk them. A
disabled header cannot be focused, so the keyboard walks past it.

| Key     | What it does                            |
| ------- | --------------------------------------- |
| `Space` | Opens the focused section, or closes it |
| `Enter` | The same                                |

Both bindings toggle, and both consume the event, so nothing above the
accordion sees the key. `Enter` toggles as well as `Space` because a
header here is a row rather than a native button, and a reader who has
just arrived on it should not have to know which of the two this
framework chose. Nothing else is bound: the arrows are free, so an
accordion inside a scroller still scrolls.

## Semantics

| What     | Value                                                                           |
| -------- | ------------------------------------------------------------------------------- |
| Header   | `button`, on the row that takes focus                                           |
| Name     | The section's `label`                                                           |
| States   | `expanded` while open, `collapsed` while closed, and always exactly one of them |
| Disabled | `disabled` on the record of a section marked so, and inherited by its subtree   |
| Content  | Nothing of its own: an open section's content announces itself as it is         |

The accordion emits nothing at its own level, so what a screen reader
meets is a run of buttons that each say whether they are open. A closed
section's content is absent rather than hidden, which means there is
nothing there to skip past and nothing to accidentally read.

The states arrive as they change, so a section the application opens
from elsewhere updates what an assistive technology sees without
anything re-rendering. The marker drawn beside the label is text with no
record of its own; the state is what says whether the section is open,
and the triangle is for the eye.

## Next

[Tabs](/components/tabs) shows one view at a time from a strip, and
[the library overview](/components/) has the contract both of them are
an instance of.
