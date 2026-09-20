# The transitions example's media

Generated, not photographed, and deliberately so.

`portrait-tall.webp`, `portrait-wide.webp`, `card-texture.png` and
`motion-loop.mp4` are abstract compositions produced with ImageMagick
and ffmpeg. They exist to give the shared-element morph something with
real pixels to carry between two routes, and the video to give the
decoder something to decode. Nothing here depicts anybody.

They are part of this repository and covered by its MIT licence, which
is the point: a demo asset with unclear provenance is a licence problem
for everyone who clones the repository, and this example is not worth
one.

Dimensions matter and are load-bearing. `playlists.ts` declares the
intrinsic size of each so the layout can reserve the box before the
bytes arrive, and a replacement of a different size has to update it.
