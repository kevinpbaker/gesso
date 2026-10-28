---
'gesso-framework': patch
---

`renderRoot(App).renderThemesWith(() => ({ light, dark }))` says what `render_frame`'s `light` and `dark` draw in, asked on each call: an application's own themes rather than Gesso's, such as the design system of a project a design editor is designing, so an agent sees a mock in the product's colours and type.
