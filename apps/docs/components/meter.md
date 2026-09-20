---
description: 'Meter: a measurement inside a known range, its three bands, and why it is not a progress bar.'
---

# Meter

A measurement inside a known range, which is simply true right now.
Disk 82% full. A password's strength. How much of a budget is spent,
how much charge is left, how many of the seats in a plan are taken. A
meter is a read-out: it says where a quantity sits between two ends,
and it says nothing at all about where it is going.

## Why this is not a progress bar

[ProgressBar](/components/progress-bar) reports how far along a task
is. That is a claim about _time_. It starts empty, it fills, it ends,
and every pixel of it implies that the thing it describes is under way
and will finish. That is why it has an indeterminate form, because
"going, size unknown" is a sensible thing for a task to be, and why
ARIA lets it drop its value while it is `busy`.

A meter has no indeterminate form, because "a measurement, but we do
not know it" is not a reading, it is an absence. It never reaches an
end and stops. A disk that is 82% full is not 82% of the way through
being a disk, and a password that scores 3 out of 5 is not three
fifths finished. Drawing a measurement with a progress bar tells the
reader that something is happening, which is the one thing that is not.

So: **a task with a size is a
[ProgressBar](/components/progress-bar)**. **A quantity with a range is
a Meter.** If the number could go down again without anything having
gone wrong, it is a meter. If the reader is setting the number rather
than reading it, it is a [Slider](/components/slider), which looks
similar and is a different thing entirely.

<LiveExample id="meter" height="360" />

<<< @/src/examples/MeterExample.tsx#meter

The disk points one way and the password points the other. "Copy the
photos" adds 120 GB in one go, which walks the disk out of the good
band, through the middle one and into the poor one, and the example
writes no conditional about colour to make that happen. Typing into the
password field walks the other meter up the same three bands in the
opposite order.

## Props

| Prop        | Type                        | Default    | What it does                                                             |
| ----------- | --------------------------- | ---------- | ------------------------------------------------------------------------ |
| `value`     | `number`                    | required   | Where the needle is. The fill clamps into the range; the number does not |
| `min`       | `number`                    | `0`        | The bottom of the range                                                  |
| `max`       | `number`                    | `1`        | The top of it                                                            |
| `label`     | `string`                    | none       | The name read with the figure                                            |
| `low`       | `number`                    | `min`      | The bottom band's edge, in the same units as `value`                     |
| `high`      | `number`                    | `max`      | The top band's edge                                                      |
| `optimum`   | `'low' \| 'high'`           | `'high'`   | Which end of the range is the good end                                   |
| `showValue` | `boolean`                   | `false`    | Draws the reading beside the bar. Read once                              |
| `format`    | `(value: number) => string` | percentage | How the reading is written                                               |

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too. The meter has
no width of its own: the bar fills what it is given, so pass a `width`
or a `flex`.

`value` is the only required prop, which is the difference from a
progress bar in the type system as well as on the page. There is no
meter with no value.

`format` is a function prop, so it is compared by identity, the rule
[the library page](/components/) states for functions and Observables
among a component's props. One written fresh at the call site is a new
function on every render. Declare it at module scope, as the example
does, or hold it in a cell.

`showValue` is read once, when the meter is built, because it decides
the meter's shape rather than a value inside it, the same rule
[Badge](/components/badge) applies to `dot`. Binding it to `visible`
would not do the job: `visible` is paint-only, so a hidden reading
would go on holding its width and its gap. A meter that has to gain or
lose its reading changes its `key`.

There are no colour props, and there will not be any. Restyling a meter
is a theme provider around it.

## The bands

`low`, `high` and `optimum` are the reason this component exists rather
than being a rounded box with a fill in it. Without them, every caller
writes the same conditional, "is this reading good?", at their own call
site, each of them slightly differently.

| `optimum` | Good               | Middling        | Poor               |
| --------- | ------------------ | --------------- | ------------------ |
| `'high'`  | at or above `high` | between the two | at or below `low`  |
| `'low'`   | at or below `low`  | between the two | at or above `high` |

`'high'` is the default and is the ordinary direction: password
strength, battery charge, a test suite's coverage. `'low'` is the disk
case, where 5% full is fine and 95% full is not.

An edge that is not given sits at the end of the range it bounds, so
`high` on its own means "everything below `high` is the bottom of the
scale". Giving **neither** edge turns the bands off and the bar is
`controlAccent`: a caller who named no edges has told the component
nothing about what a good reading is, and painting one of three tones
on a guess would be worse than painting none.

`poor` is tested before `good`, so a caller who crosses the two edges
gets a deterministic answer rather than a band that depends on which
branch happens to be written first.

### The three tones

| Band     | Token           |
| -------- | --------------- |
| good     | `controlAccent` |
| middling | `textMuted`     |
| poor     | `danger`        |

The two ends are the tokens the library already uses for those two
claims. `controlAccent` is the fill of a control that is on, and it is
what [ProgressBar](/components/progress-bar) and
[Slider](/components/slider) already fill a track with. `danger` is
what a control's border turns when it is invalid, and what a `danger`
[Badge](/components/badge) is painted in.

The middle one had no obvious token, because the palette has no
`warning` and one component is not a good enough reason to add one. A
token exists so that several components agree about a colour, and a
name with a single caller is a colour prop with extra steps. Of what is
actually in the palette, `placeholder` is within a few percent of
`controlBackground` in both stock palettes, so a middling bar would
read as an empty one, and `secondary` is an accent that means
"notable", which is a louder claim than a middling reading makes.
`textMuted` is the ink the theme already writes de-emphasised text in:
present, legible against the track in both palettes, and endorsing
nothing. That is exactly what the middle band says, and a theme that
adjusts its muted ink adjusts this with it.

Every value in that table is a palette name resolved at paint against
the inherited theme, the mechanism [themes and the
environment](/appearance/themes-and-the-environment) describes.

## Clamping, and a range that is not one

A `value` outside `min`..`max` clamps the **fill**, because a fill
wider than its track would be a lie about the picture. It does not
clamp the **reported** value, because that would be a lie about the
number. That is the same split
[ProgressBar](/components/progress-bar) makes, for the same reason, so
the two components report a value the same way.

The band is read from the raw value too. 140% of a quota is more poor
than 100% of it, not less, and clamping first would wrap a blown quota
back into the good band at exactly the moment it stopped being good.

`max <= min` draws an empty bar rather than throwing. It is a caller
error in the sense that nothing sensible can be drawn, but a meter's
range usually comes from data: a quota that has not been set, a plan
with no seats yet, a file of zero bytes. The degenerate case arrives at
runtime from a server rather than from a typo in the source. An empty
bar beside an honest `valueMin` and `valueMax` lets the reader see that
the range is the thing that is wrong; a thrown error takes the screen
down over one read-out.

## The reading, and where it goes

`format` writes the reading. The default writes a percentage of the
range, rounded, and unclamped so that it agrees with the value beside
it. A range with no span has no percentage in it to report, so the
default falls back to the bare number there.

The formatted string is what an assistive technology hears, and it
lives in `valueText`, which is ARIA's `aria-valuetext` and means
precisely "read this instead of the number". "0.82" is not a reading
anybody can act on.

The three alternatives each lose something:

- **`label`** is the meter's _name_. Putting the reading there would
  either throw away "Disk used" or make every caller concatenate the
  two, and a name that changes as the value changes is not a name.
- **A `description`** is supplementary. It is announced after the
  value, and sometimes not at all.
- **A drawn text node** cannot carry it, because `progressbar` is one
  of the roles whose children are presentational. The semantics tree
  claims everything under the meter's root, so the reading beside the
  bar has no record of its own and is never announced.

`valueText` is the only one of the four that is announced whether or
not `showValue` drew anything, which is why the reading is computed
even when it is not drawn.

The band itself is paint and nothing announces it. A caller who wants
"82%, running low" heard has a `format` to say it in, and a component
that invented an `invalid` state out of a colour would be claiming
something the caller never said.

## Keyboard

None. A meter reports and takes no input. A control that lets the
reader choose a value in a range is a [Slider](/components/slider).

## Semantics

| What   | Value                                                              |
| ------ | ------------------------------------------------------------------ |
| Role   | `progressbar`, on the meter's root                                 |
| Name   | `label`, falling back to the drawn reading when none was given     |
| Value  | `valueNow` is the raw `value`; `valueMin` and `valueMax` as passed |
| Text   | `valueText`, which is `format`'s answer                            |
| States | none                                                               |

`progressbar` is a narrowing, and the page says so rather than
pretending otherwise. `UiRole` has no `meter`, and `progressbar` is its
only numeric-range role that is not a control. It is still the honest
choice: the record carries `valueNow`, `valueMin`, `valueMax` and
`valueText`, which is the whole of what a meter has to say, and the
alternative is declaring nothing and being unreachable. What it costs
is the word "progress" in some readers' announcements, and a `label`
and a `valueText` that say what the reading actually is are what pay
for it.

Pass a `label`. Given none, the meter's name falls back to whatever
text is drawn inside it, which is the reading when `showValue` is on
and nothing at all when it is off, and "82%" is not a name.

## What this page was checked against

`Meter.spec.ts` mounts the component with `gesso-testing` and asserts
that it reports the measurement in the units it was given rather than a
fraction, that the fill clamps at both ends while the reported number
does not, that the fill is a percentage of the track so it follows a
resize, that a meter with no edges is one accent band, that the three
bands read upwards for `optimum: 'high'` and downwards for
`optimum: 'low'`, that the band is taken from the raw value, that a
missing edge sits at the end of the range it bounds, that a degenerate
range draws empty and still reports the range it was handed, that the
reading reaches `valueText` whether or not it is drawn, that a drawn
reading has no record of its own because a `progressbar` claims its
children, that the default reading is a percentage and falls back to
the bare number for a range with no span, and that `rootModifiers`
reaches the element the meter is. `MeterExample.spec.ts` asserts what
the example above claims, by role and name.

## Next

[ProgressBar](/components/progress-bar) is the one for a task with a
size, and [Slider](/components/slider) is the one for a value the
reader is choosing rather than reading.
