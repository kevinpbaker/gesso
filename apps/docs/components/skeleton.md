---
description: 'Skeleton and SkeletonText: grey stand-ins with the same box as the content they wait for, with their props, the shimmer and its reduced-motion behaviour, and semantics.'
---

# Skeleton

A grey stand-in with the same box as the content it is waiting for.
Reach for it when a screen knows the shape of what is coming before it
has the content: a list of rows, a card, a profile header, a paragraph
of prose behind a request. `Skeleton` is one block; `SkeletonText` is a
run of bars, because a paragraph's stand-in is several lines of
differing width and making every caller write that loop is the thing a
library exists to prevent.

The reason it exists is not that a loading screen should look busy. It
is that a list which fills in must not move what is under it. A
stand-in whose box differs from the real content is worse than no
stand-in at all: nothing at all is the absence of a jump, while a wrong
box is a jump plus the flicker of the grey thing that caused it. So the
first question a caller answers is not what colour or how many, it is
how big, and the component takes its box from `width`, `height` and the
rest of the layout props rather than guessing.

When the wait has no shape to promise, because nothing is known about
what will arrive, a [Spinner](/components/spinner) is the honest
control. When the work has a measurable end, a
[ProgressBar](/components/progress-bar) says more than either.

<LiveExample id="skeleton" height="380" />

<<< @/src/examples/SkeletonExample.tsx#skeleton

Press "Load again" and watch the caption rather than the grey. Every
row is `ROW_HEIGHT` tall whichever of its two faces it is wearing, so
three tracks arriving change what the rows say and nothing about where
anything sits. The two panels above the list are the same stand-in with
`shimmer` off and on.

## Props

### `Skeleton`

| Prop       | Type       | Default        | What it does                                                                               |
| ---------- | ---------- | -------------- | ------------------------------------------------------------------------------------------ |
| `width`    | `UiLength` | `percent(100)` | The box. Give it the width the real content will have                                      |
| `height`   | `UiLength` | `16`           | The box. Give it the height the real content will have                                     |
| `radius`   | `number`   | `4`            | Corner rounding. Ignored when `circle` is set, which is round                              |
| `circle`   | `boolean`  | `false`        | A round stand-in, for an avatar's place. One measurement is enough; the other axis follows |
| `shimmer`  | `boolean`  | `false`        | Breathe rather than stand still                                                            |
| `label`    | `string`   | `'Loading'`    | What a screen reader says while it waits                                                   |
| `announce` | `boolean`  | `true`         | Whether it says anything at all                                                            |

### `SkeletonText`

| Prop         | Type                  | Default        | What it does                                                            |
| ------------ | --------------------- | -------------- | ----------------------------------------------------------------------- |
| `lines`      | `number`              | `3`            | How many bars                                                           |
| `widths`     | `readonly UiLength[]` | full, then 60% | The width of each bar in order; the last entry repeats if it runs short |
| `lineHeight` | `number`              | `12`           | How thick each bar is                                                   |
| `gap`        | `number`              | `8`            | The space between bars                                                  |
| `shimmer`    | `boolean`             | `false`        | Breathe rather than stand still                                         |
| `label`      | `string`              | `'Loading'`    | What a screen reader says while it waits                                |
| `announce`   | `boolean`             | `true`         | Whether the run says anything at all                                    |

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply to both. Three of them
are read once when the component is built, because each decides the
shape of the element tree rather than a value bound into it: `circle`,
`shimmer` and `lines`. A skeleton that has to change any of the three
should change its `key`, which is the same rule
[Chip](/components/chip)'s variant follows.

`widths` is `UiLength` rather than the `number | string` a CSS library
would take, because `percent(60)` is how this codebase writes a
percentage: [lengths](/guide/layout-basics) are deliberately never strings
to parse, so a typo is a type error instead of a silent zero.

## The box is the whole point

```tsx
// The row's height is declared once and used by both faces.
const ROW_HEIGHT = 56;

const standIn = (
  <row height={ROW_HEIGHT} gap={12} paddingX={10} y="center">
    <Skeleton circle width={40} announce={false} />
    <SkeletonText flex={1} lines={2} lineHeight={11} widths={[percent(52), percent(32)]} announce={false} />
  </row>
);
```

Segue did this by hand before the library had it, and the shape of the
workaround says what the component is for: `rows.tsx` exports its
`ROW_HEIGHT` for no purpose other than letting `RowSkeleton` occupy
exactly the same box as the real row. Keep that discipline. Declare the
box once and let both faces read it, rather than typing a number into
the stand-in that happens to match the number in the row today.

A block given neither measurement fills the width it is offered and is
sixteen pixels tall, which is a line of body text. A `circle` given one
measurement derives the other from an aspect ratio, so
`<Skeleton circle width={32} />` is a disc and not a stripe.

## The shimmer

Off by default, and a single input turns it on. A skeleton is already
saying that content is coming, and a page full of moving grey is harder
to read past than a page of still grey; the shimmer is for a wait long
enough that a still block starts to read as a broken layout.

It is built the way [Spinner](/components/spinner)'s turn is: one cell,
one repeating tween on `AnimationService`, and a `stepMs` that keeps
the runtime from waking sixty times a second for decoration. The period
is 1.6 seconds and the step is 100 milliseconds, so the cost is ten
wake-ups and ten property writes a second. A `SkeletonText` costs that
once however many bars it draws, because the opacity is written on the
column rather than on each bar.

The breath is one tween rather than two because the easing returns to
where it started:

```ts
const BREATH = t => (1 - Math.cos(2 * Math.PI * t)) / 2;
```

A repeating tween samples `easing(elapsed % duration / duration)`, so a
curve that is 0 at `t = 0`, 1 at `t = 0.5` and back to 0 as `t`
approaches 1 gives an out-and-back with no second animation and no
bookkeeping. A cosine rather than a triangle because a breath has no
corners in it; the eye reads a linear ramp that reverses as a blink.

### Reduced motion stops it

This is the opposite of what `Spinner` does, deliberately. A spinner
passes `reducedMotion: 'keep'` on the grounds that a still spinner is
not a calmer spinner but one that says work has stopped: its movement
is the information, and WCAG 2.3.3 is about motion triggered by
interaction rather than about a busy indicator. A shimmer carries
nothing a still block does not already carry, so it takes the default
`snap` policy. Under a reduced-motion preference, and on a hidden tab,
the tween never enters the running set at all, and a running one is
landed where it was going.

Which is why the tween runs from the dim end towards full strength and
not the other way round. Landing writes the target, so a stopped
shimmer rests at full opacity and is pixel for pixel the still skeleton
a caller would have got by leaving `shimmer` off. Written the obvious
way round, a reduced-motion preference would leave every skeleton on
the screen permanently dimmed, which is a worse block than the one it
was asked to calm down. See [motion](/appearance/motion).

## Announcing

A `status` is a live region: an assistive technology reads it when it
appears. One skeleton standing in for one thing should say "Loading"
once. Twelve of them standing in for a list should also say it once,
and a component that announced unconditionally would say it twelve
times, which is worse than silence because it is twelve interruptions
carrying one bit between them.

So the rule is that the container speaks and the bars are silent.
`SkeletonText` already implements it for the run it draws: the column
carries the `status` and the bars carry nothing. A caller assembling a
group by hand does the same, which is what the example above does:

```tsx
<column
  role={computed(() => (loaded.value ? undefined : 'status'))}
  label="Loading tracks"
  states={computed(() => (loaded.value ? undefined : ['busy']))}>
  {rows}
</column>
```

with `announce={false}` on every stand-in inside it. The default is
`true` so that the single skeleton, which is the common case and the
one nobody thinks about, is announced rather than silent by an
oversight.

## Semantics

| What   | Value                                                          |
| ------ | -------------------------------------------------------------- |
| Role   | `status` while `announce`, and no record at all when it is off |
| Name   | `label`, which defaults to "Loading"                           |
| States | `busy`                                                         |
| Focus  | None. A stand-in is not a control and is not a tab stop        |

Neither component is selectable or hit testable, so the pointer passes
through to whatever the stand-in is sitting in. That is what a caller
who put a skeleton inside a pressable card wants, and it is the same
choice [Divider](/components/divider) makes for a rule.

## Colours

None of them are props. Both components paint in `placeholder`, the
palette's own token for a thing standing in for content that has not
arrived, resolved at paint against whatever theme the node inherits.

It is its own token rather than a borrowed one because it is a role no
other token plays. Borrowing `border` would tie a filled block to the
colour of a rule, and borrowing `controlBackgroundPressed` would move
every skeleton on the screen when a theme adjusted how a button looks
while held. Restyling is a theme provider, which is the mechanism
[themes and the
environment](/appearance/themes-and-the-environment) describes.

## What this page was checked against

`Skeleton.spec.ts` mounts both components with `gesso-testing` and
asserts that the default starts no animation at all and writes no
opacity, that a caller's width and height reach the box, that a circle
given one measurement is square, that `shimmer` moves the opacity
across a tick on the documented period and step, that the tween stops
and leaves the driver when the component leaves the tree, that a
reduced-motion preference lands it at full strength rather than dimmed,
that a run of six bars costs one animation, that the default widths
leave the last line short and a short `widths` array repeats its last
entry, and that the run announces itself once with the bars silent.
`SkeletonExample.spec.ts` measures the claim the page opens with: the
caption below the list is at the same place and the same height before
and after the tracks arrive.

## Next

[Spinner](/components/spinner) is the control for a wait with no shape
to promise, and [ProgressBar](/components/progress-bar) for work with a
measurable end.
