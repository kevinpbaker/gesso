# gesso-core

## 0.1.0

First public release.

The engine: the retained UI graph, typed properties and dirty flags; a layout
engine covering flexbox in full, CSS Grid with typed tracks, absolute, relative
and sticky positioning and overflow; one paragraph algorithm shared by the
engine and both renderers; `Canvas2DRenderer` and `WebGPURenderer` behind one
`UiRenderer` interface; pointer, wheel, keyboard, focus, gesture and
hit-testing input; and `UiEnvironment` for typed, scoped, reactive theming.

Layout is checked against headless Chrome: 239 generated cases agree within
0.1 px, with the divergences that remain pinned by name. Text breaking is
checked the same way across 124 paragraphs in seven faces, including CJK,
Arabic, Hebrew, Devanagari, Thai and emoji.

`engine.explain(node)` answers why a box is the size it is, in sentences, in
the order the rules applied.

Also in this release: the half of the accessibility mirror that lives below a
component. `UiEditingController.replaceText` is new, so a value set by an
assistive technology arrives as ordinary editing.
