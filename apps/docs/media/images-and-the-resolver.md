---
description: 'How a picture reaches the canvas: the resolver that fetches and decodes it, where that work happens, and how objectFit puts it in a box.'
---

# Images and the resolver

A canvas has no `<img>` to hand a URL to. Something has to fetch the
file, decode it, keep the result while it is on screen, and let go of it
afterwards. That something is the `ImageResolver`, and an `Image` is a
box with a modifier that asks one for a bitmap.

The four boxes below are the same picture, 320 by 180, in four
110-pixel squares:

<LiveExample id="mediaimages" height="340" />

<<< @/src/examples/MediaImagesExample.tsx#fits

## What a source goes through

1. `fetch(src)` gives a `Blob`. A response that is not `ok` becomes a
   rejection naming the status, rather than a decode failure later.
2. `createImageBitmap(blob)` gives an `ImageBitmap`.
3. The `imageSource` modifier writes that bitmap onto the node's
   `image` property.
4. Both renderers already draw `image`: the Canvas2D backend calls
   `drawImage`, and the WebGPU one uploads the bitmap through its
   texture cache.

That last step is why the whole Media tier added no renderer work.
`UiImage` is `ImageBitmap` and nothing else, chosen because an
`ImageBitmap` can be created and drawn on the main thread and in a
worker alike, so the rendering core never has to know which thread it
is on.

## What the resolver guarantees

| Guarantee                            | What it means for an app                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| One fetch and one decode per source  | Five `Image`s on one URL share one bitmap, whether or not their requests overlap in time      |
| Reference counting first, LRU second | A bitmap something on screen is holding is never evicted, however long the queue gets         |
| A released bitmap stays cached       | Scrolling a list back and forth does not re-fetch, up to the capacity, which is 32 by default |
| Eviction closes the bitmap           | An `ImageBitmap` holds decoded pixels and garbage collection is not prompt about them         |
| A failure is not cached              | The next caller tries again instead of inheriting a rejection forever                         |

The first row is what the example above measures: four fitted boxes and
the card are five `Image`s pointed at one file, and the spec asserts one
fetch and one decode between them.

## Where the decode happens

The resolver does not spawn a decode worker, and that is a decision
rather than an omission.

- **A Gesso runtime normally is a worker.** `renderRoot` runs in the
  render worker, so a resolver constructed there fetches and decodes off
  the main thread already, and the bitmap never crosses a thread at all.
  A decode worker inside the render worker would be a nested worker
  buying a hop.
- **`createImageBitmap` decodes in parallel by specification.** Even on
  a single-thread runtime the decode is not on the main thread. Only the
  fetch bookkeeping is.

The seam is still open: `ImageResolver` is an interface with three
methods, so an app that fetches through its own stack, or that has
measured a reason for a decode worker, supplies one.

## Holding a bitmap, and letting go of it

The bitmap arrives through a modifier rather than through a
subscription taken in the component body, because a modifier's lifetime
is exactly its node's. The release is registered with `host.own`, which
runs inside `removeSubtree`, so a list that scrolls a thousand
thumbnails past cannot leave a thousand of them held after their rows
have gone. An image is the one thing here where a leak is measured in
megabytes rather than in listeners.

The write goes through the override cascade, so detaching restores what
the element declared. For an `Image` that is nothing: the property is
removed rather than left holding a bitmap that is about to be closed.

## The resolver is a runtime option, not a store

`GessoRuntimeOptions` has a `media` field, and so does every shell in
front of it:

```ts
media?: { resolver?: ImageResolver; rasterizer?: IconRasterizer; videoResolver?: VideoResolver };
```

It is given at construction and not set on the `MediaService`
afterwards, because the tree is built inside the runtime's constructor
and an `Image` in it asks for its bitmap at that moment. A resolver
installed after the runtime exists has already missed the first screen.
That was found by writing a spec which set the resolver in `onCreate`
and watched the component use the default one.

The caches live on a service rather than a module singleton for the
usual reason, that a component reaches the outside world through
something injected, and for one specific to them: they must be per
runtime. Two runtimes in one worker sharing a bitmap that one of them
is about to `close()` is a use-after-free.

An application declares it where its root is declared. In a render
worker that is the worker entry:

```ts
// app.render.worker.ts
renderRoot(AppRoot).useMedia({ resolver: new CachingResolver() });
```

On the single thread it is the builder, which takes the same object:

```ts
createApp(AppRoot).useMedia({ resolver: new CachingResolver() }).mountSync('#app');
```

There is nothing about media in the shell's own `createApp({ renderWorker })`
options, and there cannot be: a resolver is a function, and no function
crosses a `postMessage`. The worker entry is the first code that runs
on the thread which will do the fetching, so it is both the only place
that can build one and the right place to.

A spec goes in through the runtime option directly, which is where
substituting a resolver is most useful of all:

```ts
const resolver = new DefaultImageResolver({
  fetch: () => Promise.resolve(new Blob()),
  decode: () => Promise.resolve(bitmap)
});
const ui = renderTest(createComponent(Gallery, {}), { media: { resolver } });
```

Whatever you leave out, the runtime builds and owns, and disposes with
the runtime. Whatever you pass stays yours: the runtime never disposes
a resolver, rasteriser or decoder it was handed, because one is often
shared between runtimes and closing it would take the other runtime's
bitmaps with it.

## Fitting a picture to its box

`objectFit` is a property of the node, resolved in `PaintState` and
applied identically by both backends:

| Value     | What is drawn                                                              |
| --------- | -------------------------------------------------------------------------- |
| `fill`    | The box exactly, whatever that does to the picture's shape                 |
| `cover`   | Scaled until both sides are covered, centred, and cropped by the box       |
| `contain` | Scaled until both sides fit, centred, leaving the box's colour at the ends |
| `none`    | The picture's own size, from the box's top left                            |

`fill` is the property's default when nothing sets it, and `cover` is
what the `Image` component passes when you do not. The picture is
clipped to the node's box, and to its rounded corners when it has them,
which is what makes `cover` and `none` legible rather than overflowing.

The box is the element's, so an image never resizes anything: what
arrives late is pixels, not a layout input. Give the box a width and a
height, or let its parent do it.

## `alt`, and what a screen reader gets

An `Image` with an `alt` is an `image` record with that name. An
`Image` without one is decorative: no role, no name, and no record in
the semantics tree at all.

<<< @/src/examples/MediaImagesExample.tsx#named

There is deliberately no way to get a nameless `image` record, which
would announce "image" and tell a reader nothing. If the picture carries
information, say what to announce; if the caption beside it already
does, leave the `alt` off.

## Limits

- **SVG does not decode.** `createImageBitmap` takes a `Blob` and Chrome
  refuses an SVG one, with "The source image could not be decoded", so
  an `Image` pointed at an `.svg` fails where the same file in an `<img>`
  would work. A vector glyph belongs in [`Icon`](/media/icons), which
  draws a path instead of decoding a document.
- **Several urls for one picture.** `src` may be a list, tried in order
  until one resolves: the same file on several mirrors, or a small
  render then a large one. Only the url that answered is held, a failed
  one is not cached, and the placeholder shows only when every candidate
  has failed.
- **A bound `src` is followed.** An `Image` whose `src` is an Observable
  shows each url it emits: the new file resolves, the old bitmap is
  released, and a load that was superseded before it arrived is dropped
  rather than drawn. The same url again is not a reload. A `key` is
  still the right tool when the _shape_ changes, an `Image` that becomes
  a placeholder box when there is nothing to show.
- **No `srcset`.** Nothing selects a variant per device pixel ratio,
  because the component cannot see one. Choose the file yourself.
- **A failed load is a tinted box.** While the bitmap is decoding, and
  after a failure, the node paints `controlBackground` from the theme,
  or whatever `placeholderColor` names, so a grid of thumbnails does not
  jump as they arrive. There is no error slot on the component.

## What this page was checked against

`MediaImagesExample.spec.ts` mounts the example above with a resolver
injected through the `media` option, and measures three claims: that one
source is fetched once and decoded once for the five `Image`s that ask
for it, that the four fits produce four different drawn rectangles (the
spec reads the sizes the renderer actually drew, so `cover` really is
wider than its box and `contain` really is shorter), and that only the
picture with an `alt` reaches the semantics tree.

What the spec does not exercise is the decode itself. Node has no
`createImageBitmap`, so the resolver's `fetch` and `decode` are
substituted there; the real pair runs in a browser, which is also where
the LRU behaviour under a long scrolling list would have to be measured.
It has not been.

## Next

[Icons](/media/icons) are the other half of this tier: a glyph drawn
from a path rather than a file fetched from a server, and the one thing
in the library that cannot resolve a palette colour at paint time.
