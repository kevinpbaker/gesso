---
description: 'Badge: a count or a short status marker attached to something else, with its tones, props and the semantics it declines to invent.'
---

# Badge

A count or a short status marker attached to something else. The "3" on
an inbox icon, the "Live" beside a title, the bare dot in a sidebar
that means something under here changed. It is the smallest thing in
the library: no interaction, no focus, no keyboard, no state of its
own.

Reach for it when a number or a word belongs _to_ something on the
screen rather than standing on its own. When the thing can be pressed,
[Chip](/components/chip) is the control, because a chip is a toggle and
announces itself as a button. When the message is transient and belongs
to the whole screen rather than to one element,
[Toast](/components/toast) is the one that appears, says its piece and
leaves. When the thing being reported is work in progress rather than a
count, [Spinner](/components/spinner) and
[ProgressBar](/components/progress-bar) already say so, with the
semantics for it.

What a badge costs to get right is not the pill. It is deciding what
the pill _says_, and that decision is most of this page.

<LiveExample id="badge" height="340" />

<<< @/src/examples/BadgeExample.tsx#badge

The inbox count is the only badge here that changes, so it is the only
one that is `live`. Press "New message" and the figure moves; a screen
reader is told the new count without focus going anywhere, because the
pill is a polite `status`. The folder counts below it are plain: they
declare nothing at all, and the figures in them are read as the prose
they are. Spam's 1284 is past `max` and draws as "99+". Archive has
nothing waiting, so the example draws no badge for it.

## Props

| Prop    | Type        | Default     | What it does                                                                     |
| ------- | ----------- | ----------- | -------------------------------------------------------------------------------- |
| `label` | `string`    | `''`        | The word on it: "Live", "Beta", "Failed"                                         |
| `count` | `number`    | none        | A figure instead of a word, drawn through `max`. Supplying both draws the count. |
| `max`   | `number`    | `99`        | The largest figure drawn as itself; above it the badge draws `99+`               |
| `tone`  | `BadgeTone` | `'neutral'` | Which of the three grounds it is painted on: `neutral`, `accent` or `danger`     |
| `dot`   | `boolean`   | `false`     | A bare dot: no text, a fixed 8 pixel circle in the tone's ground                 |
| `name`  | `string`    | none        | The accessible name, when the drawn text cannot be it. A dot needs one.          |
| `live`  | `boolean`   | `false`     | Announces changes: the pill becomes a `status` with a polite live region         |

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too.

`dot`, `live` and whether `name` was supplied are read once, when the
badge is built, because each decides the badge's shape or the role it
declares rather than a value inside it. A badge that has to become
live, or to stop being a dot, changes its `key` and is built again,
which is the same rule [Button](/components/button) and
[Chip](/components/chip) state for their variants. Everything else,
including the text of `name` and the value of `tone`, is bound and
follows a cell as it changes.

## Counts, and the reason `max` exists

`count` draws a figure. `max` caps it, so a mailbox with 1284 unread
draws "99+" and the pill has a width it cannot outgrow:

```tsx
<Badge count={unread} max={99} />
```

That is `max`'s whole job: "99+" is not the caller's string arithmetic,
in one place rather than at each of the six call sites that would
otherwise each get it slightly differently.

A count of 0 draws "0". Whether a badge with nothing to count should be
in the tree at all is the caller's conditional, because only the caller
knows whether a zero is worth saying: an inbox hides it, a filter count
shows it to say the filter matched nothing. Supplying `count` and
`label` together draws the count, because a count is the more specific
of the two.

## The three tones

| Tone      | Ground              | Words               | Edge            |
| --------- | ------------------- | ------------------- | --------------- |
| `neutral` | `controlBackground` | `controlForeground` | `controlBorder` |
| `accent`  | `controlAccent`     | `controlBackground` | none            |
| `danger`  | `danger`            | `controlBackground` | none            |

`neutral` is the quiet one, for a count that is only a count. It is the
only tone with an edge and it needs one: its ground is the colour of a
surface, so without the ring a neutral badge on a card would have no
shape at all. `accent` and `danger` are their own shape.

The words on both loud grounds are `controlBackground`, which is the
pairing `controlTokens.button.paint.filled` already makes for the same
two tones. A badge and a filled button of the same tone therefore
agree, and a theme that has raised the contrast under its filled
buttons has raised it here too rather than leaving the badge behind.

Every value in that table is a palette name resolved at paint against
the inherited theme, so it says nothing about light and dark. None of
them is a prop, and none of them will be. Restyling a badge is a theme
provider around it, the mechanism [themes and the
environment](/appearance/themes-and-the-environment) describes.

## A badge is transparent to the pointer

A badge is attached to something, and that something is usually the
thing worth clicking. The pill sets `hitTestable: false`, so a count
sitting over an inbox icon does not swallow the press on the icon, for
the same reason [Divider](/components/divider) is transparent. It also
sets `flexShrink: 0`, because a badge beside a title is the first thing
a tight row would give up width on, and half a count is worse than
none.

## Semantics

The interesting part, and the reason the component exists rather than
being a rounded box with a number in it.

| What        | Role     | Name                    | Live     |
| ----------- | -------- | ----------------------- | -------- |
| Plain badge | none     | none; the text is prose | none     |
| With `name` | `image`  | `name`                  | none     |
| With `live` | `status` | `name`, else the text   | `polite` |

**A plain badge declares nothing.** The figure or the word inside it is
a text node, and the semantics tree gives prose a record of its own, so
"3" and "Live" are already read by a reader walking the region they sit
in. Wrapping them in a `status` nobody asked for would announce a
number that has not changed, every time focus passed it. A decorative
marker is better declaring nothing than having a role guessed for it,
which is what the library means by semantics being declared and never
inferred.

**`live` is the opt-in for a badge whose changes matter.** It makes the
pill a `status` with a polite live region, which is exactly the pair:
`status` is the role, `polite` is the urgency, and the announcement
happens because the text under the region changed rather than because
focus went anywhere. An unread count that ticks up while the person is
reading something else is what this is for. Most badges are not, so it
is off by default.

**`name` is for when the drawn text cannot be the name.** Given one,
the pill becomes an `image` and carries the name: a graphic with a text
alternative, which is what a marker with a meaning beyond its glyph
actually is. The role matters as much as the name, because `image`
makes the pill's children presentational, so "3" is announced once as
"3 unread messages" rather than twice, as itself and then as its
alternative.

```tsx
<Badge count={unread} max={99} tone="accent" live name={computed(() => `${unread.value} unread messages`)} />
```

### A dot with no name is a defect

`dot` draws a bare circle and no text. A dot with no `name` therefore
has nothing in it for the semantics tree to read and nothing declared
about it: the sighted reader sees "something changed here" and nobody
else is told anything. That is not a style choice a caller can have
meant, so the component says so once, with `console.warn`, the way an
index-keyed list does. It is a warning rather than a thrown error
because a missing name breaks one reader's experience of one marker,
and taking the application down over it would be worse than the defect.

```tsx
// Warns: nothing here says what the dot means.
<Badge dot tone="danger" />

// Says it.
<Badge dot tone="danger" name="Unsaved changes" />
```

## What this page was checked against

`Badge.spec.ts` mounts the component with `@gesso/testing` and asserts
that the three tones resolve to three different grounds and that only
the neutral one has an edge, that the words on a loud ground are the
sheet's colour, that a count draws as itself until it passes `max` and
then as "99+", that a plain badge declares no role and is still read as
the prose inside it, that `name` makes it an `image` announced once,
that `live` and only `live` makes it a polite `status`, that a dot
draws no text and is a circle, and that a dot with no name warns once.
`BadgeExample.spec.ts` asserts what the example above claims, by role
and name.

## Next

[Chip](/components/chip) is the version of this that can be pressed,
and [Toast](/components/toast) is the one that appears, says its piece
and leaves.
