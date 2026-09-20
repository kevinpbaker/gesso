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

## Rebuilding it

`../../art/` holds what these were made from: an SVG each for the two
covers and the card tile, and `motion-loop.py` for the video, which
writes 120 frames and carries the ffmpeg line that encodes them. It
sits outside `public/` on purpose, because everything under `public/`
is copied into the build verbatim and a generator is not an asset.

```bash
rsvg-convert -w 275 -h 360 ../../art/portrait-tall.svg | magick png:- -quality 88 portrait-tall.webp
rsvg-convert -w 414 -h 360 ../../art/portrait-wide.svg | magick png:- -quality 88 portrait-wide.webp
rsvg-convert -w 64  -h 64  ../../art/card-texture.svg  -o card-texture.png
```

Keep the dimensions. `playlists.ts` declares each one's intrinsic size
so the layout can reserve the box before the bytes arrive, and a
replacement of a different size has to update it.
