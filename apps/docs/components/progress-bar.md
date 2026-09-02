---
description: 'ProgressBar: determinate and indeterminate progress in one control, its range, and the value it reports.'
---

# ProgressBar

How far along something is, or that it is going at all. Reach for it
when the work has a size: bytes uploaded, rows imported, steps of a
wizard finished. When it does not, this component still has an answer,
and it is the same component with no value; a [spinner](/components/spinner)
is the smaller version of that answer for a control that has to sit
inside a row of text.

Determinate and indeterminate are one component because they are one
control to a screen reader: the same `progressbar` role, with the value
present or absent.

<LiveExample id="progressbar" height="320" />

<<< @/src/examples/ProgressBarExample.tsx#progress

## Props

| Prop        | Type     | Default      | What it does                                                   |
| ----------- | -------- | ------------ | -------------------------------------------------------------- |
| `value`     | `number` | none         | The work done so far. Omitting it makes the bar indeterminate. |
| `min`       | `number` | `0`          | The bottom of the range the value is measured against.         |
| `max`       | `number` | `1`          | The top of it.                                                 |
| `label`     | `string` | `'Progress'` | What a screen reader reads.                                    |
| `thickness` | `number` | `6`          | The height of the track, and the radius of both its ends.      |

The bar has no width of its own: it fills what it is given, so pass a
`width` or a `flex`. The rest of the layout props on
[the library page](/components/) apply.

`rootModifiers` reaches the track, which is the element the bar is, so
a `sharedElement` or a `motion` can be put on one without wrapping it
in a box of its own.

There are no colour props. The track is `controlBackground` and the
fill is `controlAccent`, so a theme restyles every bar at once.

## The value, and the range

`value`, `min` and `max` are all bindings, and what a screen reader is
told is the value as it stands rather than a fraction worked out from
it. `Disk used` in the example reports 34 of 120, which is what the
number means; a bar that reported 0.283 instead would have thrown away
the units on the way.

The fill is clamped to the track, because a fill wider than its track
would be a lie about the picture. The reported value is not clamped,
because that would be a lie about the number.

Whether a bar is determinate is decided once, when it is built, from
whether `value` was supplied. A bar that starts with no value and later
gets one does not change its mind: give it a `key` that changes with
the answer, so the old one leaves and a determinate one arrives.

## Indeterminate

Given no `value`, a sliver sweeps the track and the record says `busy`
with no value at all. It sweeps in twenty-four positions 90 ms apart,
which is the same shape the [spinner](/components/spinner) uses and
costs the same: one property written eleven times a second rather than
one written on every frame. The sliver's position is a percentage of
the track, so the sweep follows the bar when the bar is resized, and
the spec beside the example measures both of those.

It keeps sweeping under reduced motion, for the reason a spinner keeps
turning: a still indeterminate bar states that nothing is happening.

## Keyboard

None. A progress bar reports and does not take input. A control that
lets the reader choose a value in a range is a
[slider](/components/slider), which looks similar and is a different
thing entirely.

## Semantics

| What   | Value                                                                   |
| ------ | ----------------------------------------------------------------------- |
| Role   | `progressbar`, on the track                                             |
| Name   | `label`, which is `Progress` when none was given                        |
| Value  | `value`, `min` and `max` while determinate; none of the three otherwise |
| States | `busy` while indeterminate, and nothing while determinate               |

An indeterminate bar omits its value rather than reporting zero. That
is ARIA's rule and it is the right one: zero is a stronger and
different claim than unknown, and a reader told "0 per cent" hears that
nothing has happened yet.

The value arrives as it changes rather than being read once, so a bar
the application moves from elsewhere updates what an assistive
technology sees without anything re-rendering.

## Next

[Spinner](/components/spinner) is the small indeterminate one, and
[Slider](/components/slider) is what to reach for when the reader is
choosing the value rather than watching it.
