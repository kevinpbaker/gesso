---
description: 'Avatar: a person or an entity as a picture, with the initials and the glyph it falls back to, its sizes, shapes and semantics.'
---

# Avatar

A person or an entity, as a picture. Reach for it wherever an account
appears: beside the name in a header, down the left of a list of
comments, large at the top of a profile, in a stack of the people on a
document. It is the picture plus the two things to draw when there is
no picture, which is the part an application otherwise writes again at
every call site.

The fallback chain is the whole component. A `src` draws the picture; no
`src` and a `name` draws the initials derived from that name; neither
draws a generic glyph. All three stand on the theme's `placeholder`
token, so a row of them does not change colour as the data fills in.

<LiveExample id="avatar" height="380" />

<<< @/src/examples/AvatarExample.tsx#avatar

Turn "Show pictures" off and watch the chain. Every row is the same
component with the same props; what differs is only what the data has.
The avatars in the list are decorative, because the name is written
beside each one, and the four below stand alone and are announced.

## Props

| Prop       | Type                     | Default    | What it does                                                                                                  |
| ---------- | ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------- |
| `src`      | `string` or `string[]`   | none       | The picture, or several urls for the same face tried in order. Absent or empty falls through to the initials. |
| `name`     | `string`                 | none       | The person or entity. The initials come from it, and so does the accessible name                              |
| `initials` | `string`                 | derived    | The initials to draw, when the derived ones are wrong. Empty is the same as none                              |
| `icon`     | `string`                 | a person   | SVG path data for the last-resort glyph, on the usual 24 grid                                                 |
| `size`     | `AvatarSize` or `number` | `'medium'` | A named step, or the side in logical pixels                                                                   |
| `shape`    | `AvatarShape`            | `'circle'` | `circle`, or a rounded `square`                                                                               |
| `label`    | `string`                 | `name`     | The accessible name. `''` declares the avatar decorative                                                      |
| `ref`      | `UiNodeRef`              | none       | Receives the node that is the avatar, for anchoring a menu to it                                              |

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too. There is no
colour prop, here or anywhere else in the library.

## The fallback chain, and the one link it cannot have

```tsx
<Avatar src={account.avatar} name={account.name} />
```

`src` takes a list as well as a string, because that is the shape an
account usually arrives in: Audius returns several sizes of the same
face, and Segue's header held exactly that list with an emptiness check
written around it by hand. A list is tried in order, as
[Image](/components/image) tries one, and a list of nothing but blanks
counts as no picture rather than as a fetch that can only fail.

That single line is the whole of it. `src` empty or absent moves to the
initials, and no initials moves to the glyph. Empty counts as absent on
purpose: the shape an application actually holds is a string that is
sometimes `''`, and making the caller turn that into `undefined` is the
guard this component exists to absorb.

What the chain cannot include is a **failed load**, and the reason is
worth stating plainly rather than leaving as a surprise.
[`Image`](/components/image) is told by its modifier when a
source fails, but it keeps that to itself and spends it on the
placeholder tint; `ImageProps` has no `onError`, no `onState` and no
status output of any kind. So nothing outside an `Image`, including this
component, can learn that a url did not resolve. `Avatar` therefore
falls back on an absent or empty `src` only, which is a question it can
answer, rather than pretending to a recovery it has no way to trigger.

A url that 404s leaves the avatar showing the `placeholder` disc, which
is the same ground the initials would have stood on, so a broken picture
degrades to a blank face rather than to a hole. If an application needs
more than that today, it has to know the url is bad before it passes it.

## Initials

| Name              | Initials | Why                                                          |
| ----------------- | -------- | ------------------------------------------------------------ |
| `Ada Lovelace`    | `AL`     | The given name and the family name                           |
| `Ada`             | `A`      | One name, one letter                                         |
| `Ada B. Lovelace` | `AL`     | The first part and the last, because a middle one is neither |
| `Ålesund Kommune` | `ÅK`     | One grapheme, not one code unit                              |
| `村上 春樹`       | `村春`   | A script with no case is left alone                          |
| `` (empty)        | none     | Nothing to derive, so the glyph is next                      |

The slice is by grapheme and never by code unit. A name beginning with
an emoji, a flag, a Devanagari cluster or a letter carrying combining
marks is one visible character made of several code units, and `name[0]`
cuts it in half: half a surrogate pair draws as a replacement character,
and a base letter stripped of its marks is the wrong letter. The
runtime already answers this question for the caret, so that Backspace
deletes a flag rather than half of one, and `Avatar` asks the same
function.

Case is raised with `toLocaleUpperCase`, which does nothing in the
scripts that have no case and the right thing in the ones that do. Pass
`initials` for a name the rule cannot read the way a reader would: a
company that goes by three letters, a handle that is not a name, a
person whose family name comes first.

## Size and shape

| Step     | Side  | Where it fits                            |
| -------- | ----- | ---------------------------------------- |
| `small`  | 24 px | Beside a word, in a header or a byline   |
| `medium` | 40 px | A row in a list of comments or of people |
| `large`  | 64 px | A card, or a person's own entry          |

Three steps rather than five, because `size` also takes a number: a
named step earns its name by being reached for repeatedly, and these are
the three the applications reach for. A profile header at 128 is a
number at the call site, where the reason for it is visible.

Everything inside scales with the side rather than coming from a table,
so a number is as well served as a step. The initials are 40% of the
side, which keeps two capitals inside the disc at every size; the glyph
is 60%, which is what a shoulders-up figure needs to look centred rather
than small; and a `square` avatar's corners are a sixth of the side,
because one fixed radius would be a blob at 24 and a sharp corner at 128. That radius does not name a step of [the shape
scale](/appearance/themes-and-the-environment) on purpose: the shared
scale has no name for a radius that is a function of a box, and
inventing one for a library's sake would put the library's taste in
everyone's vocabulary.

Size and shape are both followed rather than read once, so an avatar
that grows when a page opens under it does not need a new `key`, which
matters because a new key is exactly what a shared-element morph between
the two must not have.

## Semantics

| What   | Value                                                         |
| ------ | ------------------------------------------------------------- |
| Role   | `image`, on the disc itself, when there is a name to announce |
| Name   | `label` if it was given, else `name`                          |
| States | none: an avatar is a picture, not a control                   |

The decision to make deliberately is which of the two cases you are in.

An avatar **beside the name it depicts** is a picture of a word that is
already on the screen. Announcing it makes a reader hear "Ada Lovelace,
image, Ada Lovelace", so it should be silent, and `label=""` declares
that: no role, no name, nothing in the semantics tree at all. Still
drawn, because decorative means unannounced and not absent.

An avatar that **stands alone**, in a grid of faces or a stack of
authors, is the only thing naming the person and must announce them.
That is the default: with no `label`, the accessible name is `name`.

```tsx
// In a list, beside the name: silent.
<row><Avatar src={person.avatar} name={person.name} label="" /><text text={person.name} /></row>

// On its own: announced.
<Avatar src={person.avatar} name={person.name} />
```

An avatar with neither a `label` nor a `name` is decorative too, because
it has nothing to say. The picture inside never has a record of its own:
the avatar carries the role and the name, and a second record inside it
would announce the person twice.

## Colours

None of them are props. The ground is `placeholder`, the palette token
that exists for something standing in for content that has not arrived.
Not `border`, which would tie a filled disc to the colour of a rule, and
not `controlBackgroundPressed`, which would move every avatar on the
screen when a theme adjusted how a button looks while held. The initials
are `text` and the glyph is `textMuted`, and that difference is
deliberate: initials are information and have to be read, while the
glyph says only "no picture" and should not shout it.

Restyling is a theme provider around the avatar, the mechanism
[themes and the environment](/appearance/themes-and-the-environment)
describes.

## What this page was checked against

`Avatar.spec.ts` mounts the component with `gesso-testing` and asserts
each link of the chain and that only one of them is in the tree at a
time, that an arriving `src` swaps the layer without rebuilding the node
that is the avatar, that explicit initials win over the derived ones,
that the derivation takes the first and last parts and never cuts a
grapheme, that the labelled case is an `image` named by the person and
`label=""` is silent while still drawn, that the picture inside adds no
second record, that each named step and a number give their own side,
that a size which changes is followed, that a circle and a square differ
only in radius, and that the ground is `placeholder`.
`AvatarExample.spec.ts` asserts what the example above claims, by role
and name.

## Next

[Image](/components/image) is the picture underneath this one,
and says what a source that fails does and does not report.
