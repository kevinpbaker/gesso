---
description: 'SegmentedControl: one choice from a few as a single track cut into segments, with why it is a radio group rather than a tab list, its props, keyboard map and semantics.'
---

# SegmentedControl

One choice from a few, drawn as one track cut into segments. The
control at the top of a pane that says which of three views is below
it, or which of two units a figure is in: Day / Week / Month, Grid /
List, Celsius / Fahrenheit. Few options, all of them short, all of them
worth seeing at once, and the whole thing costing one line of a
toolbar.

Reach for it when the choices are exclusive, there are two to five of
them, and each fits in a word. Past that the track runs out of room and
a [Select](/components/select) costs less of it. When the choices want
a column and a sentence each,
[RadioGroup](/components/radio-group) is the same control with room to
breathe. When what is being switched is **which panel is shown** rather
than which value is held, [Tabs](/components/tabs) is the component,
for the reason below.

<LiveExample id="segmentedcontrol" height="340" />

<<< @/src/examples/SegmentedControlExample.tsx#segmented-control

Click any of the three and use the arrows. Each track is a single tab
stop, so Tab moves past the whole control rather than through its
segments, and inside it the arrows move the choice as they go. `Range`
is controlled and the figure under it is derived from the same cell, so
the control and the number cannot disagree. `Row density` was given
`defaultValue` and owns its own value, reporting it through `onChange`.
`Export as` has a segment marked `disabled`: PDF is drawn, greyed,
refuses a click, and the arrows step over it.

## Why this is a radio group and not a tab list

The first question, because the paint is the paint a browser's tab
strip has and the instinct is to call it one.

A `tablist` is a promise about the page: these controls each reveal a
panel, the panels are siblings, and the one you pick is the one that is
showing. An assistive technology acts on that promise. It offers to
move to the panel a tab controls, and it expects a `tabpanel` to be
there when it arrives. A segmented control that picks Celsius has no
panel to move to, and declaring one would send a reader somewhere that
does not exist.

What this control does is pick a value, exclusively, from a handful of
choices. That is a radio group, and a radio group is what it declares.
The rule is about what changes, not about how wide the control is:

| What the choice changes           | The component                         |
| --------------------------------- | ------------------------------------- |
| A value the application holds     | `SegmentedControl`                    |
| Which panel of content is shown   | [Tabs](/components/tabs)              |
| A value, with room for a sentence | [RadioGroup](/components/radio-group) |

[Tabs](/components/tabs) draws the strip, declares the `tablist`, and
puts a `tabpanel` under it carrying the selected tab's name. If that
panel is the point, that is the component.

## Why it is not a variant on RadioGroup

Honestly: because the two halves that are shared are the two halves
that are cheap to share, and the two that are not shared are all of the
component.

The semantics are identical, `radiogroup` over `radio`s with `checked`
on the chosen one, and the keyboard is identical. Both of those are
about fifteen lines, and both are genuinely shared: the two components
read `keymap`, `CONTROL_FOCUS_RING`, `layoutOf` and `controlled` from
the same places.

Everything else differs. A radio group stacks down by default, puts a
dot beside each label, carries an error message under itself, and has
`invalid`, `required` and `direction` props that mean something for a
form field. A segmented control is a single horizontal track with no
dots, no message, no validation, and a `size` that resolves through the
button tokens so it can sit in a toolbar beside a
[Button](/components/button) and match its height.

A `variant: 'segmented'` on `RadioGroup` would therefore be a prop that
turns four other props off, changes the default of a fifth, and
switches out the whole body. That is a second component hiding inside
the first, with a type that lies about which combinations are
meaningful. Two components that agree on a keyboard cost less than one
component with a mode.

## Props

| Prop           | Type                         | Default    | What it does                                                                                 |
| -------------- | ---------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `options`      | `readonly SegmentedOption[]` | required   | The segments, in order. Each is `{ value, label, disabled? }`.                               |
| `value`        | `string`                     | none       | The chosen value, when the application owns it. Supplying this makes the control controlled. |
| `defaultValue` | `string`                     | none       | The starting choice, when the control owns it.                                               |
| `onChange`     | `(value: string) => void`    | none       | Called with the value the control would take, on a click and on a bound key.                 |
| `label`        | `string`                     | `''`       | The group's accessible name. It is not drawn: the heading beside it is yours.                |
| `disabled`     | `boolean`                    | `false`    | Refuses clicks and keys for the whole track, and marks the subtree unavailable.              |
| `size`         | `ButtonSize`                 | `'medium'` | `small`, `medium` or `large`, resolved through the same tokens a `Button` uses.              |

Every prop takes a plain value or an Observable of one, including
`options`. The layout props on [the library page](/components/) apply
here too.

`size` is read once, when the control is built, as
[Button](/components/button) reads its own: a size picks one row of the
token table and every metric on the track comes from that row. A
control that has to change size changes its `key` and is built again.

### Options that change

`options` is required, because a track with nothing in it is not a
choice, and it is a cell like every other prop. The segments are built
from the cell rather than read out of it once, so a control whose
choices arrive from a request, or grow when a feature is switched on,
rebuilds its segments when the cell emits. The keyboard reads the
cell's current value at the moment a key arrives, so the arrows walk
the segments that are actually drawn.

An **empty** `options` draws an empty track: the trough with its ring,
its role and its name, and nothing in it. It answers no key, because
there is nothing to move to. It is deliberately not nothing at all. An
empty array is usually "not loaded yet", and a control that vanished
and came back would move everything beside it twice.

### A value that is in no option

A preference saved before the options changed is the usual way to get
one. The control draws **no chosen segment**: the whole track is quiet.
It does not silently correct the value to the first segment, because
that would show the application a choice it did not make and does not
hold, and the disagreement would surface later as a save that writes
back something nobody picked.

An arrow recovers. From no match, a forward step lands on the first
selectable segment and a backward step on the last, which is
[RadioGroup](/components/radio-group)'s rule too. The same reasoning is
why supplying neither `value` nor `defaultValue` leaves the control
with nothing chosen rather than with its first segment lit.

## Controlled and uncontrolled

```tsx
// Controlled: the application owns the choice, and the track shows it.
<SegmentedControl label="Range" options={RANGE} value={range} onChange={next => (range.value = next)} />

// Uncontrolled: the track owns the choice, and reports it if asked.
<SegmentedControl label="Range" options={RANGE} defaultValue="week" onChange={next => save(next)} />
```

Supplying both throws, naming the component and both props. Supplying
neither leaves the control self-managing with nothing chosen.

The controlled form is what lets the application refuse a choice. Every
arrow and every click goes to `onChange` first, and the track shows
only what comes back, so a handler can write a note instead of a value.
It is also what keeps a derived view honest: in the example, the
figure under `Range` reads the same cell the control does, so there is
no second copy of the choice to fall out of step.

## Keyboard

The track is a single tab stop and the segments are not tab stops
themselves. Inside it the arrows move the choice, and **walking
selects**: this is the "selection follows focus" pattern ARIA allows
for a radio group, it is what
[RadioGroup](/components/radio-group) does, and it needs no roving
focus and no separate highlight that a reader would then have to commit
with Space.

| Key                       | What it does                                          |
| ------------------------- | ----------------------------------------------------- |
| `ArrowRight`, `ArrowDown` | Chooses the next segment, wrapping past the last      |
| `ArrowLeft`, `ArrowUp`    | Chooses the previous segment, wrapping past the first |
| `Home`                    | Chooses the first segment that can be chosen          |
| `End`                     | Chooses the last segment that can be chosen           |
| `Tab`                     | Not bound: focus leaves the control                   |

Every binding steps over a segment marked `disabled` rather than
landing on it, and Home and End reach the first and last segment that
can actually be chosen rather than the first and last drawn. A disabled
control answers no key at all.

Both axes are bound, as they are on a radio group. The track is only
ever a row, so Up and Down match no layout here. They are bound anyway,
because a reader who has learned one arrow pair on the radio groups in
the same form should not discover that this control answers only the
other.

The focus ring is drawn on the track, because the track is what holds
the keyboard. While it has focus the chosen segment's ring turns
`controlAccent`, so a reader can see where the arrows will land.

## The paint

One track, and no slots. The track is a `controlBackground` trough with
a `controlBorder` ring, the ring for the reason
[Badge](/components/badge)'s neutral tone has one: `controlBackground`
is the colour of a surface, and an unringed trough on a card has no
shape at all. The segments sit flush inside it with no gap, because a
gap lets the trough show between them and the eye reads five slots with
one thing in them rather than one thing with five parts.

| Part                | Ground                | Words                       | Edge                                      |
| ------------------- | --------------------- | --------------------------- | ----------------------------------------- |
| The track           | `controlBackground`   | none                        | `controlBorder`                           |
| The chosen segment  | `selectionBackground` | `selectionForeground`       | `controlBorder`, `controlAccent` on focus |
| An unchosen segment | none                  | `textMuted`                 | none                                      |
| A disabled segment  | none                  | `controlForegroundDisabled` | none                                      |

The selection pair is the one the library already uses for _chosen
rather than operated_, the picked row of a list, a tree or a table,
which is exactly what a chosen segment is. It is the same call
[Chip](/components/chip)'s outlined variant makes when it is on.

**Without colour.** The chosen segment also carries a one pixel ring
the unchosen ones do not have, and that ring is the cue that survives
greyscale, a colour vision difference and a bad projector.
`borderWidth` is paint only and takes no space, so the ring appearing
and disappearing never moves a segment. A weight change on the chosen
segment's words would have been the other obvious cue and is
deliberately not used: text at 600 is wider than the same text at 400,
so the track would have resized every time the choice moved.

Every metric comes from `controlTokens.button.sizes[size]`: both
paddings, the radius and the type role. A segmented control and a
[Button](/components/button) of the same `size` are therefore the same
height, are cut to the same radius and set their words in the same
role, and a theme that squares off or re-scales its buttons moves this
with them. The track's own radius is the segment's plus the two pixel
inset, so the two curves stay concentric.

None of these colours is a prop, and none of them will be. Every one is
a palette name resolved at paint against the inherited theme, so the
table says nothing about light and dark. Restyling is a theme provider
around the control, the mechanism
[themes and the environment](/appearance/themes-and-the-environment)
describes, or the control tokens described in
[restyling](/components/restyling).

## Semantics

| What     | Value                                                                            |
| -------- | -------------------------------------------------------------------------------- |
| Role     | `radiogroup` on the track, `radio` on each segment                               |
| Name     | The track's is `label`; each segment's is its own `label`                        |
| Value    | No `valueNow` on the track: the chosen segment carries `checked` instead         |
| States   | `checked` on the chosen segment, and nothing on the others                       |
| Disabled | `disabled` on the track is on its record and inherited by every segment under it |

A segment's own `disabled` is a different thing from the track's: it
takes that segment out of the arrow order and refuses its click, and it
greys the segment's words, but it is not on the segment's record. The
track is where an assistive technology learns that the control as a
whole is unavailable.

The track carries no `invalid` and no `required`, and has no props for
them. A segmented control is a toolbar control rather than a form
field, and a choice that has to be validated wants the error message
under it that [RadioGroup](/components/radio-group) already draws.

### The label is not drawn

`label` is the accessible name and nothing else. The visible caption is
yours, because a heading over a control is part of the surrounding
form's typography rather than part of the control. Draw a `<text>`
beside the track and pass the same string as `label`, which is what the
example does.

## What this page was checked against

`SegmentedControl.spec.ts` mounts the component with `gesso-testing`
and asserts that it declares a `radiogroup` of `radio`s and neither a
`tablist` nor a `tabpanel`, that the track is focusable and no segment
is, that the arrows walk and the walk is the choice, that both axes are
bound, that Home and End reach the ends that can be chosen, that a
disabled segment is stepped over and refuses a click, that a disabled
control answers nothing, that a controlled track does not move until
the application writes the value back, that supplying `value` and
`defaultValue` together throws naming both, that the segments follow
the `options` cell when it emits, that empty options draw a named track
with nothing in it, that a value in no option leaves nothing chosen and
an arrow recovers from it, that the chosen segment carries a ring the
others do not, and that all three sizes take their paddings and radii
from the button size tokens with the track's radius concentric to the
segments'. `SegmentedControlExample.spec.ts` asserts what the example
above claims, by role and name.

## Next

[RadioGroup](/components/radio-group) is this control with room for a
sentence per option, [Tabs](/components/tabs) is the one to reach for
when the choice changes which panel is shown, and
[Chip](/components/chip) is the one for choices that are not exclusive.
