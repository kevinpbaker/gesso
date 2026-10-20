---
'gesso-components': patch
---

Media and status components follow the values they are given instead of freezing the first one.

- `VideoPlayer` shows captions that arrive after it mounted. A track is usually fetched once the player is already on screen, and an empty list at mount used to mean no captions ever. `Captions` also follows a track that changes while a paused clip's position stands still.
- `VideoPlayer` now passes `onState`, `poster`, `placeholderColor`, `volume`, `muted` and `rate` through to its `Video`, so an application can say why a clip will not play.
- `ProgressBar` switches between sweeping and filling as its `value` comes and goes, rather than deciding once at build. A bar that started without a value kept sweeping after one arrived, and a bar whose value went away reported a NaN. It also follows a change to `min` or `max` alone.
- `ProgressBar` and `Meter` fill from the right under a right-to-left reading.
- `Spinner` follows a `size` or `color` that changes.
- A `Video` whose controls have `hideAfterMs: 0` puts the bar away when the pointer leaves, as documented, instead of keeping it up for good.
- The fullscreen copy of a `Video` starts at the inline clip's volume and mute, keeps its `clock` and `poster`, and a level changed in fullscreen is still there after leaving it.
- `Image` has an `onState` prop, like `Video`'s, and `Avatar` uses it: a picture that fails to load falls back to the initials (or the glyph) instead of leaving an empty disc. A new `src` is tried again.
- `Alert` draws no blank title line while a bound `title` is empty, and the line appears when the title does. The same holds for `message`.
- `Chip` draws a `count` or `icon` that arrives after the chip was built; the accessible name already included the count, so a screen reader and the screen now agree.
- `Skeleton`'s and `SkeletonText`'s `shimmer` are documented as read once.
