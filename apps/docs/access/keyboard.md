---
description: Keyboard operability as a contract every component honours, from one tab stop per widget to Escape closing the overlay on top.
---

# Keyboard operability

A control that only a mouse can reach is unusable by a person with a
screen reader, a switch device or a broken trackpad, and it is
untestable without a browser. Both problems have the same fix, and in
this library it is a contract rather than a feature: **every control is
operable from the keyboard alone, and says what it is while doing it.**

The screen below is driven entirely with keys in the spec beside it.
Tab into it and try the same thing by hand.

<LiveExample id="keyboard" height="280" />

<<< @/src/examples/KeyboardExample.tsx#sortbar

## Where the line is

The runtime gives you four things, and they are the same four whether
an application is one thread or two:

- **A focus order**, which is document order, parents before children,
  wrapping at both ends. There is no `tabIndex`, so the way to change
  the order is to change the tree.
- **Key delivery.** A key goes to the focused node and bubbles from
  there, so a container can bind a shortcut for everything inside it.
  With nothing focused it goes to the root, which is where an
  application-wide shortcut lives.
- **Tab and Shift+Tab**, applied after the application's own listeners
  and only if none of them called `preventDefault()`.
- **Focus traps**, which is what makes a modal modal. See
  [focus and traps](/interaction/focus-and-traps) for the mechanics.

What it does not give you is a binding. A `<button>` is focusable and
takes a press, and nothing in the runtime turns Enter on a focused
button into a click. The Apply button in the example binds Enter and
Space itself, and that is the whole reason it works. An element that is
focusable is not thereby activatable: what a key does to a control is
the control's own business, which is why the library's components each
carry a keymap and why the two lines above are not boilerplate you can
skip.

The consequence for an application author is short. A control built out
of intrinsics is not keyboard-operable until you bind the keys.
A control taken from `@gesso/components` already is.

## A keymap is data

Every component that handles keys declares its bindings as a table and
binds them in one `onKeyDown`:

```tsx
onKeyDown={keymap({ ' ': toggle, Enter: toggle })}
```

`keymap` is exported from `@gesso/components`. A key that is bound runs
its handler and consumes the event, both `preventDefault` and
`stopPropagation`, so nothing above the control sees it. A key that is
not bound is left alone for whatever is listening further up.

The reason for the table is that a `switch` inside a handler cannot be
read without opening the source, cannot be tested without a runtime,
and cannot be overridden by an application that needs a different
binding. It is also why every component page here can carry an accurate
`## Keyboard` section: the section is the table.

## One tab stop per widget

Walking five tabs to get past a tab bar is worse than walking it with
the arrows, so a composite widget is a **single tab stop** and the
arrows move within it. Two shapes of this exist in the library, and
which one a component uses follows from what the widget is.

**Selection follows focus.** The group holds focus and an arrow moves
the choice: `RadioGroup` and `Tabs`. ARIA allows it, and it needs no
per-option focus juggling, no roving `tabindex` equivalent, and no
second focus model beside the runtime's.

**An active item inside the container that holds focus.** `Select`'s
listbox, `Menu`, `Tree`, `LazyList` and `DataTable` keep an index of
the active row while the container itself is what has focus. The active
row is drawn with the selection colour, and choosing it is a separate
key from moving to it.

The focus ring goes on the element that _is_ the control, which for one
of these containers is the container. That is the right thing to mark:
the ring says where the keyboard is, and which item inside is chosen is
said by the item's own colour. Every control in the library carries the
same `focusRing()`: called with no options the factory hands back one
shared value, and a ring given options is compared with the attached one
by what those options say, so the ring survives the control's re-render
either way.

## What the library binds

Every one of these is covered by the component's own specs, and each
component page repeats its own table with the details.

| Component               | Keys                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Checkbox`, `Switch`    | `Space` and `Enter` toggle                                                                                                     |
| `RadioGroup`            | Arrows move the choice, skipping disabled options; `Home` and `End` jump to the ends                                           |
| `Tabs`                  | `Left` and `Right` move the selection; `Home` and `End` jump                                                                   |
| `Accordion`             | `Space` and `Enter` on a section header open and close it                                                                      |
| `Slider`                | Arrows step; `PageUp` and `PageDown` take a larger step; `Home` and `End` go to the bounds                                     |
| `NumberInput`           | `ArrowUp` and `ArrowDown` step by `step`                                                                                       |
| `TextInput`, `TextArea` | The editing keys, plus `Enter` to submit in a single-line field                                                                |
| `Select`, closed        | `Enter`, `Space`, `Down` and `Up` open it; a printed character chooses by first letter                                         |
| `Select`, open          | Arrows walk, `Home` and `End` jump, `Enter` or `Space` chooses, `Escape` closes without choosing                               |
| `Menu`                  | Arrows walk, `Home` and `End` jump, `Enter` or `Space` chooses, `Escape` closes                                                |
| `Tree`                  | `Up` and `Down` walk the open rows, `Right` opens a node, `Left` closes it or goes to its parent, `Enter` and `Space` activate |
| `LazyList`, `DataTable` | `Up`, `Down`, `PageUp`, `PageDown`, `Home` and `End` walk the rows; `Enter` and `Space` activate                               |
| `SplitPane`             | Arrows move the divider; `Home` and `End` take it to its limits                                                                |
| `Dialog`                | `Escape` closes it, unless it was opened with `dismissible` off                                                                |
| `FindBar`               | `Escape` closes the find session                                                                                               |

## Escape closes the one on top

There is no overlay stack, and none is needed. Every overlay that takes
the keyboard traps focus, so Escape is bound on the overlay's own
content and the key cannot reach a dialog underneath: nothing
underneath is focusable while the trap is up.

<<< @/src/examples/KeyboardExample.spec.ts#escape

Closing for any reason, a choice, Escape, or a press outside, hands the
keyboard back to the control that opened it. That is the focus store's
`releaseTrap` doing what it was built for, and it is one rule rather
than one per component.

Two overlays deliberately never take focus at all. A tooltip that could
be tabbed into is a trap with no way out, and a notification that stole
the keyboard from what a person was doing is a bug, so `Tooltip` and
`Toast` are read through their role rather than visited.

## A control you cannot query is a control nobody can reach

`@gesso/testing` queries the semantics tree, not the node tree: `getByRole`,
`getByLabel`, and events that go through the same controllers a real
pointer and a real keyboard go through. That makes the two problems at
the top of this page one problem. A control with no record cannot be
found by a spec, and it cannot be found by an assistive technology
either; a control that a spec has to reach by walking the tree is a
control a person cannot reach at all.

<<< @/src/examples/KeyboardExample.spec.ts#keys

Not a press anywhere in it. See [testing](/guide/testing) for the rest
of the library, and [the mirror](/access/the-mirror) for what the same
records look like from the platform's side.

## Limits

**The active option is not named as active to the platform.** There is
no `aria-activedescendant`, so while a `Select` is open the platform is
told which option is selected, and the highlighted one is communicated
by colour alone. Walking the list with the arrows is correct in the
application and thin in a screen reader.

**No screen reader has been run against any of this.** The keyboard
behaviour above is covered by specs and was checked by hand in Chrome
in the render worker. What a screen reader's own browse and forms modes
make of it is untested; see
[the mirror's limits](/access/the-mirror#limits).

**Hit targets are exact rectangles**, which matters here because a
control that is hard to hit with a pointer is the one people fall back
to the keyboard for. Size controls for a finger rather than relying on
the slop a browser would add.

## Next

[The component library](/components/) has a keyboard table on every
page, and [focus and traps](/interaction/focus-and-traps) is the
mechanism underneath this one.
