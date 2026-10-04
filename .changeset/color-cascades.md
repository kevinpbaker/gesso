---
'gesso-core': minor
'gesso-framework': patch
---

`color` cascades, as the property reference always said it did: text that names no colour takes the `color` of the nearest ancestor that set one, unless a nearer `textStyle` brings its own. A theme token travels as a name and is resolved where the text is painted, so `<box theme={darkTheme} color="text">` draws its plain text in the dark palette's `text`, and a card inside it that provides another theme draws in that theme's. Until now a node's own `color` reached nothing below it, and plain text under a dark root drew in the default style's near-black on the dark background. Text that already names a colour or a role is unchanged; text that names neither, under a container that sets a `color`, now takes that colour. Changing a cascaded colour repaints the subtree without laying it out again. `UiEnvironmentKeys.color` is the new key the colour travels on, and an overlay carries it from where it was declared.
