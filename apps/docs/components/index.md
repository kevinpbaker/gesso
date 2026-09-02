---
description: What @gesso/components is, the contract every control in it honours, and how to read the pages that follow.
---

# Components

`@gesso/components` is the library a screen is built out of: twenty-seven
controls, from a checkbox to a virtualized table, all of them themed,
keyboard operable and announced to an assistive technology from the day
they were written.

They are ordinary components. Each one is a function that runs once and
returns elements, built from `@gesso/core` and nothing you do not also
have. What the library adds is that the same twenty-seven answer the
same four questions the same way, so learning one control is most of
learning the rest.

<LiveExample id="form" height="340" />

<<< @/src/examples/FormExample.tsx#form

## The contract

### Controlled by default, self-managing on request

A control takes either the value or an initial value, never both:

```tsx
<Checkbox label="Wrap lines" checked={wrap} onChange={next => (wrap.value = next)} />
<Checkbox label="Wrap lines" defaultChecked />
```

Given `checked`, the application owns the value and the box draws
whatever it is handed. The click still arrives, `onChange` still fires,
and if nothing writes the value back then nothing moves. That is not a
failure mode: it is how a control declines a change, and every page here
demonstrates it.

Given `defaultChecked`, the control keeps its own value in one cell and
the application hears about a change only if it asked for `onChange`.

Given both, the component throws as it is built, naming itself and both
props. A control that quietly owns state the application also thinks it
owns is the bug that rule exists to prevent, so it is an error rather
than a precedence rule you have to remember.

Which of the two applies is decided once, when the component is built,
from whether the value prop was supplied. A control cannot change owner
half way through its life.

### Themed through the environment, with no colour props

No control in the library takes a colour. They read the control tokens
from whatever theme they inherit:

| Token                                                  | What it paints                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `controlBackground`                                    | the resting fill of a box, a track, a field                     |
| `controlBackgroundHovered`, `controlBackgroundPressed` | the same under the pointer, and under a press                   |
| `controlBorder`                                        | the resting border                                              |
| `controlForeground`, `controlForegroundDisabled`       | the control's own text                                          |
| `controlAccent`                                        | the fill of a control that is on: a ticked box, a thrown switch |
| `danger`                                               | the border of a control marked `invalid`                        |
| `focusRing`                                            | the ring drawn outside whatever holds the keyboard              |

One set serves the checkbox, the switch, the radio, the slider, the
number field and the text field, so a theme restyles all of them at
once and no call site forks the palette. A subtree that has to look
different gets a different theme on a box around it, which is the
mechanism [light and dark](/guide/appearance) already describes.

### A keymap that is data

A control that answers keys declares them as a table of key to handler
and binds the table in one `onKeyDown`. A key in the table is handled
and consumed; a key that is not is left alone for whatever is listening
above, which is what keeps Tab, and an application's own shortcuts,
working while a control has focus. The `Keyboard` table on each page
below is that table, read off the component.

### Semantics on the element that is the control

Every control sets `role`, `label` and `states` on the node that takes
focus and carries the behaviour, not on a wrapper and not on the text
inside it. Controls with a numeric value set `valueNow`, `valueMin` and
`valueMax` as well; controls that are on or off say so with the
`checked` state instead.

That is the same tree `@gesso/testing` queries, so the spec beside each
example finds a checkbox by asking for a checkbox. There is no second
definition of what a control is.

## Layout is yours

Colour is the theme's, but placement cannot be: a control has to sit
where you put it. Every component's props therefore extend one shared
set, which it spreads onto its own root element.

| Prop                                                               | Type                    |
| ------------------------------------------------------------------ | ----------------------- |
| `width`, `height`                                                  | `UiLength`              |
| `minWidth`, `minHeight`, `maxWidth`, `maxHeight`                   | `UiLength`              |
| `margin`, `marginTop`, `marginRight`, `marginBottom`, `marginLeft` | `number`                |
| `flex`, `flexGrow`, `flexShrink`                                   | `number`                |
| `flexBasis`                                                        | `UiLength`              |
| `selfX`, `selfY`                                                   | `UiSelfAlignment`       |
| `rootModifiers`                                                    | `readonly UiModifier[]` |

Only the ones you actually pass are forwarded, so a control you say
nothing about sizes itself.

`rootModifiers` is the seam a modifier needs. It attaches to the
component's own root rather than to a box wrapped around it, which
matters because `measure`, `motion` and `sharedElement` all describe an
element: a modifier on a wrapper reports the wrapper. Declare the
modifier once at module scope and pass the same value every time, since
a modifier's arguments are compared by identity and a fresh object
detaches and re-attaches the modifier on every frame.

## How to read the pages that follow

Each control gets one page, in this shape.

- **Props.** Every prop the component's exported props type declares, its
  type, its default, and what it does. Any prop may be given a plain
  value or an Observable of one: a component's props are widened to
  accept either, and an Observable is bound rather than re-rendered, so
  the component function still runs once.
- **Controlled and uncontrolled.** Both forms of the same control, side
  by side.
- **Keyboard.** The keys the component binds, as its keymap has them.
- **Semantics.** The role it declares, where its accessible name comes
  from, and the states it emits as they change.

The pages written so far, by what they are for:

- **Choosing:** [Checkbox](/components/checkbox),
  [Switch](/components/switch),
  [RadioGroup](/components/radio-group).
- **Entering a value:** [TextInput and TextArea](/components/text-input),
  [Slider](/components/slider), [NumberInput](/components/number-input).
- **Showing data:** [DataTable](/components/data-table),
  [Tree](/components/tree), [LazyList](/components/lazy-list).
- **Arranging a screen:** [Tabs](/components/tabs),
  [Accordion](/components/accordion), [Card](/components/card),
  [Divider](/components/divider), [Toolbar](/components/toolbar).

For a tour of the library rather than a reference,
[using components](/guide/using-components) builds the form above.

## What has been checked

Every claim about behaviour on these pages is asserted by the spec
beside the page's example, which drives the real runtime with a fake
canvas and no browser at all. What that does not cover is drawing:
the canvas above is Canvas2D, and Chrome and other Chromium browsers are
the extent of what any of this has been opened in. No screen reader has
been sat in front of the semantics these controls emit, which is a
different question from whether they emit them.
