---
description: 'Alert: a persistent inline banner, with the three tones the palette has, the paint that keeps a banner proportional, and the role it declares.'
---

# Alert

A banner that stays where it was put. The strip across the top of a
settings page saying the trial ends on Friday, the line above a form
saying the card was declined, the note over a list saying the
connection dropped and these numbers are an hour old.

An alert belongs to the region it sits in. It is still there when the
person comes back to that region, and that is the whole difference
between it and [Toast](/components/toast): a toast belongs to the
screen, says its piece over whatever is underneath, and leaves on a
timer. If the message can be missed at no cost, it is a toast. If the
person has to act on it, or will want to read it again, it is this.
When the thing being reported is a short marker attached to something
else rather than a message of its own,
[Badge](/components/badge) is the smaller one; when it is work in
progress, [Spinner](/components/spinner) and
[ProgressBar](/components/progress-bar) already have the semantics for
it.

Two decisions are the whole design: how much colour a banner is allowed
to be, and what it says to a screen reader. The rest of this page is
those two.

<LiveExample id="alert" height="380" />

<<< @/src/examples/AlertExample.tsx#alert

The trial notice is the standing banner. It was on the page at load,
nothing about it has changed, and it is `live={false}` for that reason:
a `region` a reader can find, skip and come back to. "Payment failed"
is `danger`, so it interrupts. "Invoices are syncing" is `accent`, so
it waits its turn. Press Dismiss and the banner goes, because the
example stops rendering it; press Retry payment and it is back.

## Props

| Prop        | Type         | Default     | What it does                                                             |
| ----------- | ------------ | ----------- | ------------------------------------------------------------------------ |
| `title`     | `string`     | none        | The headline, and the banner's accessible name                           |
| `message`   | `string`     | none        | The sentence under the title, and the name when there is no title        |
| `tone`      | `AlertTone`  | `'neutral'` | `neutral`, `accent` or `danger`, carried by the edge and the title's ink |
| `live`      | `boolean`    | `true`      | Whether the banner's arrival is announced. False is the standing banner. |
| `onDismiss` | `() => void` | none        | Draws a Dismiss button and is called when it is pressed                  |
| `children`  | `UiChild`    | none        | Content under the message: an action row, a link, a list                 |

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too. A banner is
usually `width={percent(100)}`, because the region it belongs to is
what decides how wide it is.

`live`, the tone the banner is built with, and whether `onDismiss` was
supplied are read once, when the banner is built. The first two decide
the role and the live region and the third decides whether there is a
button at all, and a live region has to be registered before the text
inside it changes: one created, or made assertive, in the same frame as
its content is typically not announced at all, because there was no
region to observe when the change happened. A banner that has to change
its tone from `accent` to `danger`, or stop being live, changes its
`key` and is built again, which is the same rule
[Button](/components/button), [Chip](/components/chip) and
[Badge](/components/badge) state for their own axes. The text of
`title` and `message` and the paint of `tone` are bound and follow a
cell.

## The three tones

| Tone      | Ground              | Edge            | Title               | Message     |
| --------- | ------------------- | --------------- | ------------------- | ----------- |
| `neutral` | `controlBackground` | `controlBorder` | `controlForeground` | `textMuted` |
| `accent`  | `controlBackground` | `controlAccent` | `controlAccent`     | `textMuted` |
| `danger`  | `controlBackground` | `danger`        | `danger`            | `textMuted` |

Three, and that is a constraint rather than an oversight. The palette
has no `success` token and no `warning` token: it has `controlAccent`
and `danger`, and a banner may not name a colour the theme does not
have. A `success` tone would have to be painted in a green chosen
inside the component, which is the one thing a themed component cannot
do. It would survive the appearance toggle unchanged, ignore a nested
theme provider, and clash with the brand of the first application that
themed anything.

An application that wants a green banner themes `controlAccent`, or
wraps the banner in a theme provider of its own. That is the mechanism
[restyling](/components/restyling) describes, and it is the same answer
[Button](/components/button) and [Badge](/components/badge) give.
Adding `success` and `warning` to the palette is a defensible change;
it is a change to `UiColors`, both stock palettes, the renderers'
fixtures and every theme an application has written, and it is not a
thing for a banner to do on the way past.

The three tones are written out locally in `Alert.ts`, as
[Badge](/components/badge)'s and [Chip](/components/chip)'s are. That
is now the third local copy of the same three, which is one past the
point where a shared group earns its place: they should move onto
`controlTokens` together, in a change whose whole content is that move.

### The ground is the same under all three

The ground is always `controlBackground`, and the tone is carried by
two small things: the ring around the banner and the ink of its title.

A badge is a pill the size of a word, so a full `danger` ground on it
is a small red dot and reads as one. A banner is the width of a region.
The same treatment scaled up is a red wall with white words across the
top of a page, which is louder than nearly every message that will ever
go in one, and at that size it takes the screen over from the content
it is a note about.

The rejected alternative was the filled banner: `danger` edge to edge
with `controlBackground` words, matching Badge's loud tones exactly.
Consistency with Badge is its whole case, and it loses on the two
things that matter more here. A filled banner forces every word in it,
including its dismiss button's, onto a ground the theme only had to
guarantee for short labels; and it makes the quietest thing on a page
the loudest thing on it. Keeping the body text on the one sheet whose
contrast against `controlForeground` and `textMuted` a theme has
already had to get right is worth more than the echo.

Every value in that table is a palette name resolved at paint against
the inherited theme, so it says nothing about light and dark. None of
them is a prop and none of them will be.

## Semantics

The reason this is a component and not a `Card` with a coloured border.

| What                 | Role     | Name                    | Live        |
| -------------------- | -------- | ----------------------- | ----------- |
| Live, `danger`       | `alert`  | `title`, else `message` | `assertive` |
| Live, any other tone | `status` | `title`, else `message` | `polite`    |
| `live={false}`       | `region` | `title`, else `message` | none        |

**`live` defaults true**, because a banner that appears in response to
something is news, and the person who needs it most is the one who is
not looking at that part of the screen. This is the opposite default to
[Badge](/components/badge), and for the opposite reason: a badge is a
fact about something else and declares as little as it honestly can,
while an alert is the thing itself, the reason the region looks
different, and a reader told nothing about it is told nothing at all.

**`danger` and live is `role: 'alert'`, assertive.** In ARIA, `alert`
carries an assertive live region: it interrupts whatever is being read.
That is correct for the card that was declined and wrong for
everything else, and a library that made every banner assertive would
be teaching people to turn the announcements off.

**Any other tone, live, is `role: 'status'` with a polite live
region.** The pair [Badge](/components/badge) uses, for the same
reason: `status` is the role, `polite` is the urgency, and the
announcement happens because the text under the region changed rather
than because focus went anywhere.

**`live={false}` is `role: 'region'` and no live region at all.** The
standing banner: the trial-expiry notice that was on the page when it
loaded and will be there tomorrow. Nothing about it has changed, so
there is nothing to announce, and announcing it anyway every time focus
passes it is exactly the defect Badge refuses to commit with its
decorative counts. As a `region` it is a landmark named by its title,
so a reader can find it, skip it, and come back to it deliberately.

### The name, and why the banner is always labelled

The accessible name is the `title`. Given a `message` and no `title`,
the name is the message: a region with no name cannot be introduced,
listed among landmarks or navigated to, and the message is the only
sentence in the banner.

The label is always declared, and not only so it can be read. The
semantics tree names an unlabelled container from the text of its
transparent descendants and then claims those descendants, so they stop
being records of their own, and the walk stops at the claimed subtree,
taking a dismiss button inside it out of the tree entirely. A labelled
container claims nothing: its name introduces it, its prose stays
readable, and its button stays reachable. The label is there to prevent
that defect, not as a nicety.

## Dismissing does one thing

`onDismiss` draws a real [Button](/components/button) with the
accessible name "Dismiss", rather than a glyph with nothing behind it.
It is the only control in a banner, and a nameless one is a button a
screen reader can only announce as "button".

Pressing it calls `onDismiss` and nothing else. The component does not
hide itself, because whether the banner is in the tree is the caller's
conditional: only the caller knows whether dismissing means forgetting
it for this render, for this session, or for good.

```tsx
{
  show(declined, () => (
    <Alert
      tone="danger"
      title="Payment failed"
      message="We could not charge the card ending 4242."
      width={percent(100)}
      onDismiss={() => (declined.value = false)}
    />
  ));
}
```

## What this page was checked against

`Alert.spec.ts` mounts the component with `gesso-testing` and asserts
that the three tones resolve to three different edges and title inks on
one shared `controlBackground` sheet, that a banner is a polite
`status` by default, that only `danger` makes it an assertive `alert`,
that `live={false}` makes it a named `region` with no live region at
all, that its prose stays readable and its dismiss button stays
reachable because the container is labelled, that a banner with no
title is named by its message and draws no blank title line, that the
words and the paint follow a cell while the role does not, that
pressing Dismiss calls `onDismiss` and leaves the banner in the tree,
and that the layout props reach the root. `AlertExample.spec.ts`
asserts what the example above claims, by role and name.

## Next

[Toast](/components/toast) is the version of this that appears, says
its piece and leaves, and [Badge](/components/badge) is the marker that
declares as little as it honestly can.
