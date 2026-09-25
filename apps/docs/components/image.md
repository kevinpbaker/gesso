---
description: 'Image: a picture fetched and decoded off the main thread, with its props, its fits, and what it announces.'
---

# Image

A picture. Reach for it whenever the thing on screen is a bitmap
somebody produced elsewhere: a photograph, a thumbnail, an avatar, a
piece of album art. When the thing is a glyph the interface drew for
itself, use an [icon](/components/icon), which rasterises a path
instead of decoding a document, and when it moves, use a
[video](/components/video).

`Image` is a box with a bitmap in it. It does not fetch anything
itself: it asks the resolver in the runtime's media store for its
source and draws whatever comes back, which is what puts the fetch and
the decode on the thread the application already runs on rather than on
the shell.

<LiveExample id="image" height="330" />

<<< @/src/examples/ImageExample.tsx#image

The swatch is three times as wide as it is tall and every box is 112 by
72, so the four fits have something to disagree about. All four name
one source, so between them they cause one fetch and one decode; the
spec beside the example asserts that they are handed the same bitmap
object.

## Props

| Prop               | Type                                       | Default             | What it does                                                                              |
| ------------------ | ------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------- |
| `src`              | `string`                                   | required            | What the resolver is asked for. Read once, when the component is built.                   |
| `alt`              | `string`                                   | none                | What a screen reader reads. Omitting it makes the picture decorative.                     |
| `objectFit`        | `'fill' \| 'cover' \| 'contain' \| 'none'` | `'cover'`           | How the bitmap meets a box that is not its shape.                                         |
| `borderRadius`     | `number`                                   | `0`                 | Rounds the box, and clips the picture to it.                                              |
| `placeholderColor` | `UiColorValue`                             | `controlBackground` | The tint while the bitmap decodes, and after it fails.                                    |
| `ref`              | `UiNodeRef`                                | none                | Receives the node the picture is drawn on, for measuring it or anchoring something to it. |

`src` is read once because a component's body runs once, and an image
whose source changed is a different image: give it a `key` that changes
with the source and let the old node go, which is also what releases
the old bitmap.

`placeholderColor` takes a palette name or a colour outright, and the
default is the theme's `controlBackground`. Reach for it only when the
picture is going somewhere the theme cannot know about: over a
photograph, or in a panel of its own colour, where the control
background would be a rectangle of the wrong shade until the bitmap
arrives. It is read once, like `src`, because a placeholder that
changed after the picture landed would have nothing left to tint.

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too. `Image` also
attaches `rootModifiers` to the node it draws on, so a
`sharedElement` or a `motion` can be put on a picture without wrapping
it in a box.

## The resolver

The bitmap comes from an `ImageResolver`, which the runtime holds on
its media store, one per runtime. The default one fetches the source,
decodes it with `createImageBitmap`, keeps one entry per source
however many pictures asked for it, reference counts what is on screen
and evicts what is not.

An application that fetches through its own stack replaces it, where
its root is declared. In a render worker that is the worker entry:

```ts
// app.render.worker.ts
renderRoot(AppRoot).useMedia({ resolver: new DefaultImageResolver({ capacity: 128 }) });
```

On the single thread the builder takes the same object, and a spec
hands it to the runtime directly:

```ts
createSyncApp(AppRoot).useMedia({ resolver: myResolver }).mountSync('#app');
renderTest(root, { media: { resolver: myResolver } });
```

Declaring it there rather than setting it afterwards matters more than
it looks. The tree is built inside the runtime's constructor and an
`Image` in it asks for its bitmap the moment it is built, so a resolver
installed once there is an app to install it on has already missed the
first screen. `MediaService.setResolver` is still there for a resolver
that has to change with the screen, and it is subject to that same
rule: call it from the body of a component above the first picture,
because a body runs before the elements it returns are built.

The resolver this page's pictures come from is below, and the worker
entry beside the example declares it:

<<< @/src/examples/ImageExample.tsx#resolver

Nothing on this page goes to the network: the swatch is painted into an
`OffscreenCanvas` and handed over as an `ImageBitmap`, which is exactly
what a decoded PNG would have been. [Images and the
resolver](/media/images-and-the-resolver) is where the caching,
eviction and reference counting are described in full.

**A limit worth knowing before you hit it:** `createImageBitmap` takes a
blob, and Chrome refuses an SVG one, so an `Image` pointed at an `.svg`
fails where the same file in an `<img>` would have worked. A vector
glyph belongs in [Icon](/components/icon).

## Loading and failure

The picture arrives late by construction, so the box has to look like
something in the meantime. It is filled with `placeholderColor`, which
is the theme's `controlBackground` unless the call site named another,
and the fill is dropped when the bitmap arrives, so a list of
thumbnails holds its shape instead of jumping as they land.

A source that fails keeps that same tint and nothing else happens:
there is no error slot, no retry, and no callback to hang one on. The
broken picture in the example above is tinted `danger`, which is a
placeholder colour doing the only thing a placeholder colour can do
about a failure. What to do instead is draw your own beside it, and
decide with the resolver whether to ask again. A rejection is not
cached, so the next component that names the source does try again.

## Fits

| `objectFit` | What it does                                                               |
| ----------- | -------------------------------------------------------------------------- |
| `cover`     | Fills the box and crops what does not fit. The default, and usually right. |
| `contain`   | Fits the whole picture inside the box and leaves the rest empty.           |
| `fill`      | Stretches to the box, changing the picture's shape.                        |
| `none`      | Draws at the bitmap's own size, clipped by the box.                        |

The box's size is the layout's, not the picture's: an `Image` given no
width or height is a box with no content size, so give it one, or a
`flex`, or let a parent stretch it.

## Keyboard

None. A picture is not a tab stop and binds no keys. It is marked
unselectable, so a drag that starts on it belongs to the list it sits
in rather than becoming a text selection.

## Semantics

| What   | Value                                                             |
| ------ | ----------------------------------------------------------------- |
| Role   | `image`, when `alt` was given, on the box the picture is drawn on |
| Name   | `alt`                                                             |
| States | None. A picture has nothing to be                                 |
| Value  | None                                                              |

An `Image` with no `alt` has no role and no name, so it is not in the
semantics tree at all. That is ARIA's rule for a decorative picture and
it is the right default for a bullet or a divider glyph, but it is a
decision rather than an oversight: there is no way to get a nameless
`image` record, because a screen reader announcing "image" and nothing
else is worse than silence.

Neither the loading tint nor the failure is announced. If the
difference matters to the reader, say it in text beside the picture,
where everybody gets it.

## Next

[Video](/components/video) is the same rectangle with a moving picture
in it, and [Icon](/components/icon) is the one to reach for when the
picture is a glyph.
